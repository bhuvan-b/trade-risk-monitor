#!/usr/bin/env bash
# Stand up a local Docker registry connected to kind.
# Run BEFORE `kind create cluster`.
set -euo pipefail

REG_NAME="kind-registry"
REG_PORT="5000"

if docker ps | grep -q "$REG_NAME"; then
  echo "Registry already running."
else
  docker run -d --restart=always -p "127.0.0.1:${REG_PORT}:5000" \
    --name "$REG_NAME" registry:2
  echo "Registry started on localhost:${REG_PORT}"
fi

# Create cluster
kind create cluster --config kind-config.yaml --name risk-monitor

# Connect registry to kind network
docker network connect kind "$REG_NAME" 2>/dev/null || true

# Tell kind nodes about the registry
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REG_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

echo ""
echo "Cluster ready. Next:"
echo "  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml"
echo "  echo '127.0.0.1  risk.local' | sudo tee -a /etc/hosts"
echo "  ./scripts/build-push.sh"
echo "  kubectl apply -f k8s/base/"
echo "  kubectl apply -f k8s/ingress/"
echo "  kubectl apply -f k8s/netpol/"
