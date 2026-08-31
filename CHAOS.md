# Chaos & Reliability Runbook

Each exercise maps to a roadmap phase. Run these while watching the dashboard at http://risk.local.

---

## Phase 4 — Probes & Scheduling

### Kill the risk engine mid-stream
```bash
kubectl delete pod -l app=risk-engine -n risk
```
**Observe:** Dashboard still serves stale exposure data (api-service + Postgres survive).  
Kafka queues events while the engine is down. Once the new pod passes readiness, it replays the backlog.  
**Interview angle:** "The readinessProbe meant traffic wasn't sent to the new pod until it reconnected to Kafka and Postgres."

### Force a bad readiness state
```bash
# Exec into an ingestion pod and kill the process — probe fails, pod removed from endpoints
kubectl exec -it deployment/ingestion-service -n risk -- kill 1
```

---

## Phase 5 — StatefulSets

### Kill Kafka, measure queue behaviour
```bash
kubectl delete pod kafka-0 -n risk
```
**Observe:** ingestion-service logs will show KafkaJS retry backoff. Trade generator keeps sending.  
Once Kafka-0 restarts (StatefulSet respawns it with the same PVC), ingestion reconnects automatically.

### Kill Postgres
```bash
kubectl delete pod postgres-0 -n risk
```
**Observe:** risk-engine logs `ROLLBACK` / retry. api-service returns 500 until Postgres is back.  
Dashboard shows the API error state (red dot top-right).

---

## Phase 6 — HPA Stress Test

### Trigger HPA on ingestion pods
```bash
# Bump the generator to burst mode
kubectl set env deployment/trade-generator BURST_MODE=true -n risk
# Watch HPA scale ingestion pods up
kubectl get hpa -n risk -w
# Reset
kubectl set env deployment/trade-generator BURST_MODE=false -n risk
```

---

## Phase 7 — Scheduling (Advanced)

### Drain a node, observe pod rescheduling
```bash
# In a multi-node kind cluster
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Watch pods reschedule
kubectl get pods -n risk -o wide -w
# Uncordon when done
kubectl uncordon <node-name>
```

---

## Phase 9 — NetworkPolicy verification

### Confirm Postgres is unreachable from the frontend
```bash
# Should fail — no egress from frontend to postgres
kubectl exec -it deployment/frontend -n risk -- wget -T 3 postgres.risk.svc.cluster.local:5432
```

### Confirm risk-engine can't reach the internet
```bash
kubectl exec -it deployment/risk-engine -n risk -- wget -T 3 https://google.com
# Expected: connection refused / timeout
```

### Confirm ingestion can reach Kafka but not Postgres
```bash
kubectl exec -it deployment/ingestion-service -n risk -- wget -T 3 postgres.risk.svc.cluster.local:5432
# Expected: timeout
```

---

## Exposure Reset (between chaos runs)
```bash
# Reset all counterparty exposure to zero via API
for cp in CP-ALPHA CP-BETA CP-GAMMA CP-DELTA CP-EPSILON; do
  curl -X POST http://risk.local/api/exposure/$cp/reset
done
```
