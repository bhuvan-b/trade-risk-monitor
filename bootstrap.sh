#!/usr/bin/env bash
# bootstrap.sh — build all images into kind and apply manifests
# Usage: ./bootstrap.sh [kind|minikube]
set -euo pipefail

CLUSTER=${1:-kind}
REGISTRY="risk"

echo "==> Target cluster: $CLUSTER"

# ── 1. Build images ──────────────────────────────────────────────────────────
SERVICES=(ingestion-service risk-engine api-service trade-generator frontend)

for svc in "${SERVICES[@]}"; do
  echo "==> Building $svc..."
  docker build -t "$REGISTRY/$svc:latest" "services/$svc"
done

# ── 2. Load images into cluster ──────────────────────────────────────────────
if [ "$CLUSTER" = "kind" ]; then
  for svc in "${SERVICES[@]}"; do
    echo "==> Loading $svc into kind..."
    kind load docker-image "$REGISTRY/$svc:latest"
  done
elif [ "$CLUSTER" = "minikube" ]; then
  echo "==> Pointing Docker to minikube daemon..."
  eval "$(minikube docker-env)"
  for svc in "${SERVICES[@]}"; do
    docker build -t "$REGISTRY/$svc:latest" "services/$svc"
  done
fi

# ── 3. Apply manifests ───────────────────────────────────────────────────────
echo "==> Applying manifests..."

kubectl apply -f k8s/namespace/
kubectl apply -f k8s/kafka/
kubectl apply -f k8s/postgres/

echo "==> Waiting for Postgres to be ready..."
kubectl rollout status statefulset/postgres -n risk --timeout=120s

echo "==> Waiting for Kafka to be ready..."
kubectl rollout status statefulset/kafka -n risk --timeout=120s

kubectl apply -f k8s/ingestion/
kubectl apply -f k8s/risk-engine/
kubectl apply -f k8s/api-service/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/network-policies/

echo "==> Waiting for all deployments..."
kubectl rollout status deployment/ingestion-service -n risk --timeout=120s
kubectl rollout status deployment/risk-engine       -n risk --timeout=120s
kubectl rollout status deployment/api-service       -n risk --timeout=120s
kubectl rollout status deployment/frontend          -n risk --timeout=120s
kubectl rollout status deployment/trade-generator   -n risk --timeout=120s

echo ""
echo "✓ All done. Add to /etc/hosts if not already there:"
echo "  127.0.0.1  risk.local"
echo ""
echo "Then open: http://risk.local"
echo ""
echo "Useful commands:"
echo "  kubectl get pods -n risk"
echo "  kubectl logs -f deployment/risk-engine -n risk"
echo "  kubectl logs -f deployment/trade-generator -n risk"
echo "  kubectl top pods -n risk"
