#!/usr/bin/env bash
# Build all images and push to local kind registry.
# Run once after `kind create cluster --config kind-config.yaml`
#
# Usage: ./scripts/build-push.sh [service]
#   ./scripts/build-push.sh            # builds all
#   ./scripts/build-push.sh frontend   # builds one

set -euo pipefail

REGISTRY="991046440740.dkr.ecr.eu-west-1.amazonaws.com"
SERVICES=("ingestion" "risk-engine" "alert-api" "trade-generator" "frontend")
TARGET="${1:-all}"

build_and_push() {
  local svc=$1
  local dir="services/$svc"
  [[ "$svc" == "frontend" ]] && dir="frontend"

  echo ""
  echo "▶ Building $svc …"
  docker build -t "$REGISTRY/$svc:latest" "$dir"
  docker push "$REGISTRY/$svc:latest"
  echo "✓ $svc pushed"
}

if [[ "$TARGET" == "all" ]]; then
  for svc in "${SERVICES[@]}"; do
    build_and_push "$svc"
  done
else
  build_and_push "$TARGET"
fi

echo ""
echo "All done. Apply manifests with:"
echo "  kubectl apply -f k8s/base/"
echo "  kubectl apply -f k8s/ingress/"
echo "  kubectl apply -f k8s/netpol/"
