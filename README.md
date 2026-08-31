# Trade Risk Monitor

A Kubernetes SRE learning project built around a realistic domain:
real-time counterparty exposure monitoring, styled after the kind of system you'd support in a Nomura production-support role.

## Architecture

```
                        ┌──────────────────────────────────────────┐
                        │  risk namespace                           │
                        │                                           │
  trade-generator ─────▶ ingestion ─────▶ kafka                    │
  (CronJob)              (2 replicas)     (StatefulSet)             │
                                              │                      │
                                        risk-engine                  │
                                        (2 replicas)                 │
                                              │                      │
                                           postgres                  │
                                        (StatefulSet)    ◀── alert-api ◀── frontend
                                                                             │
                        └──────────────────────────────────────────┘        │
                                                                             │
                        ┌─────────────────────────────┐                     │
                        │  ingress-nginx namespace     │                     │
                        │  risk.local ──────────────────────────────────────┘
                        └─────────────────────────────┘
```

**Ingress routing** (only two things reachable from outside):
- `risk.local/` → frontend (React dashboard)
- `risk.local/api` → alert-api (REST)

**NetworkPolicy** — each service has a minimal allow-list; everything else default-deny.

## Services

| Service | Language | Port | Role |
|---------|----------|------|------|
| ingestion | Python/FastAPI | 8080 | Receives trades, produces to Kafka |
| risk-engine | Python | 9090 (metrics) | Consumes Kafka, calculates exposure, writes Postgres |
| alert-api | Python/FastAPI | 8080 | REST over Postgres, only internet-facing service |
| frontend | React/nginx | 80 | Dashboard, polls alert-api every 4s |
| trade-generator | Python | — | CronJob, POSTs synthetic trades every 2min |

## Quick Start

### 1. Set up cluster

```bash
./scripts/setup-registry.sh
# Installs kind-registry, creates cluster, connects them
```

### 2. Install ingress-nginx

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### 3. Add host entry

```bash
echo "127.0.0.1  risk.local" | sudo tee -a /etc/hosts
```

### 4. Build and push images

```bash
./scripts/build-push.sh
```

### 5. Deploy

```bash
kubectl apply -f k8s/base/
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/netpol/
kubectl -n risk get pods -w   # watch them come up
```

### 6. Watch it run

Open http://risk.local — the dashboard auto-updates every 4 seconds.

The CronJob fires every 2 minutes. Trigger it immediately:
```bash
kubectl -n risk create job --from=cronjob/trade-generator trigger-$(date +%s)
```

## Roadmap Phase Mapping

| Phase | What to practice on this project |
|-------|----------------------------------|
| 1 | Deploy all services, verify pods Running |
| 2 | Ingress — `risk.local` serving frontend + API |
| 3 | ConfigMaps/Secrets — externalise DB creds, Kafka topic name |
| 4 | Probes + resources — break a probe, watch rollout block; OOMKill a service by halving memory limit |
| 5 | StatefulSets — `kubectl exec kafka-0` into Kafka; delete a pod, watch it rejoin |
| 6 | HPA — add CPU load to ingestion, watch replicas scale |
| 7 | Node scheduling — taint/tolerate; pin Postgres to a specific node |
| 8 | Monitoring — Prometheus scrapes risk-engine metrics; Grafana panel for breach count |
| 9 | NetworkPolicy — verify default-deny: `kubectl exec` into frontend, try to curl postgres directly |
| 10 | Chaos — kill risk-engine mid-run, observe trade queue backlog recover |
| 11 | GitOps — move k8s/base/ into ArgoCD or Flux; bump image tag, watch it sync |
| 12 | EKS — identical manifests, swap local registry for ECR |

## Chaos Runbook

### Kill the risk engine mid-backlog
```bash
# Start a high-volume load
kubectl -n risk scale deployment/ingestion --replicas=5
kubectl -n risk create job --from=cronjob/trade-generator flood-$(date +%s)

# Kill the risk engine
kubectl -n risk delete pod -l app=risk-engine

# Watch: Kafka queue builds up, new pods come up, drain the backlog
# Expected: no trade data lost (Kafka consumer offset holds)
kubectl -n risk logs -l app=risk-engine --follow
```

### Force a Postgres failure
```bash
kubectl -n risk delete pod postgres-0
# Alert-api starts returning 503 (readinessProbe fails)
# risk-engine retries connection loop (check logs)
# StatefulSet brings postgres-0 back with same PVC
```

### Verify NetworkPolicy enforcement
```bash
# This should FAIL (frontend can't reach postgres)
kubectl -n risk exec deploy/frontend -- wget -qO- postgres:5432 --timeout=3
# This should SUCCEED (alert-api can reach postgres)
kubectl -n risk exec deploy/alert-api -- pg_isready -h postgres -U risk
```

## API Reference

```
GET /api/summary            — dashboard totals
GET /api/exposure           — all counterparties, exposure, utilisation %
GET /api/exposure/{cp}      — single counterparty
GET /api/breaches?limit=50  — most recent breach events
GET /api/trades?limit=100   — recent trade log
```

## Dashboard

- **Summary bar** — total exposure, trade count, breach count, breached counterparties
- **Exposure table** — counterparty, net exposure, utilisation bar (green/amber/red), trade count, last trade time, status badge (OK/WARN/BREACH)
- **Breach feed** — live breach events with counterparty, exposure at breach, % over limit
- Polls every 4 seconds; pulsing dot in header confirms live connection
