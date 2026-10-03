#!/usr/bin/env bash
# Deploys the current commit's images to one environment with kustomize + kubectl.
# Invoked by .github/workflows/deploy.yml; requires KUBE_CONFIG (base64) and ENVIRONMENT.
set -euo pipefail

: "${ENVIRONMENT:?ENVIRONMENT must be staging or production}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
REGISTRY="${REGISTRY:-ghcr.io/${GITHUB_REPOSITORY_OWNER:-inrent}}"
OVERLAY="infrastructure/kubernetes/overlays/${ENVIRONMENT}"
NAMESPACE="inrent-${ENVIRONMENT}"

if [[ -z "${KUBE_CONFIG:-}" ]]; then
  echo "KUBE_CONFIG is not set for '${ENVIRONMENT}' — skipping deploy (configure the environment secret to enable)." >&2
  exit 0
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
echo "$KUBE_CONFIG" | base64 -d > "$workdir/kubeconfig"
chmod 600 "$workdir/kubeconfig"
export KUBECONFIG="$workdir/kubeconfig"

cp -r infrastructure/kubernetes "$workdir/k8s"
cd "$workdir/k8s/overlays/${ENVIRONMENT}"
kustomize edit set image \
  "ghcr.io/inrent/gateway=${REGISTRY}/inrent-gateway:${GITHUB_SHA}" \
  "ghcr.io/inrent/worker=${REGISTRY}/inrent-worker:${GITHUB_SHA}" \
  "ghcr.io/inrent/migrate=${REGISTRY}/inrent-migrate:${GITHUB_SHA}" \
  "ghcr.io/inrent/web=${REGISTRY}/inrent-web:${GITHUB_SHA}-${ENVIRONMENT}"

kustomize build . > "$workdir/manifests.yaml"
kubectl apply -f "$workdir/manifests.yaml" --dry-run=server >/dev/null

# 1) Namespace, config and migrations first (forward-only, backwards compatible with the
#    running release), 2) then roll out services.
kubectl -n "$NAMESPACE" delete job inrent-migrate --ignore-not-found
kubectl apply -f "$workdir/manifests.yaml" -l 'app.kubernetes.io/component in (config,migration)'
kubectl -n "$NAMESPACE" wait --for=condition=complete job/inrent-migrate --timeout=600s
kubectl apply -f "$workdir/manifests.yaml"

for d in inrent-gateway inrent-worker inrent-web; do
  kubectl -n "$NAMESPACE" rollout status "deployment/$d" --timeout=600s
done
echo "Deployed ${GITHUB_SHA} to ${ENVIRONMENT} (${OVERLAY})"
