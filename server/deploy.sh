#!/usr/bin/env bash
# Deploy the relay to Cloud Run (P13). Idempotent: re-running updates the service.
#
#   PROJECT=my-gcp-project ./server/deploy.sh
#
# Secrets are read from the environment the first time (and when ROTATE=1) and stored in Secret
# Manager; they are never echoed or written to disk:
#   APP_TOKEN, GNANI_API_KEY, OPENROUTER_API_KEY
# Optional: REGION (asia-south1), SERVICE (drishti-relay), VLM_PROVIDER (openrouter),
#   VLM_MODEL (z-ai/glm-5.3-flash), MIN_INSTANCES (1; 0 = no idle cost, cold starts).
# Secret names (an existing secret is used as is): APP_TOKEN_SECRET (<service>-app-token),
#   GNANI_SECRET (<service>-gnani-key), OPENROUTER_SECRET (<service>-openrouter-key).
set -euo pipefail

: "${PROJECT:?set PROJECT to the GCP project id}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-drishti-relay}"
VLM_PROVIDER="${VLM_PROVIDER:-openrouter}"
# P17: open-weight GLM-5.3-Flash (zai-org/GLM-5.3-Flash): 8/8 bench answers, first sentence p50
# 1.53 s, same as gemini-3.5-flash-lite, and it didn't invent the bus number (bench 20261110-085805).
VLM_MODEL="${VLM_MODEL:-z-ai/glm-5.3-flash}"
APP_TOKEN_SECRET="${APP_TOKEN_SECRET:-${SERVICE}-app-token}"
GNANI_SECRET="${GNANI_SECRET:-${SERVICE}-gnani-key}"
OPENROUTER_SECRET="${OPENROUTER_SECRET:-${SERVICE}-openrouter-key}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"
SA="${SERVICE}@${PROJECT}.iam.gserviceaccount.com"
HERE="$(cd "$(dirname "$0")" && pwd)"

gcloud config set project "$PROJECT" >/dev/null
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com

# Service account: Vertex AI (when VLM_PROVIDER=vertex) and reading its own secrets. No key file.
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE" --display-name "Drishti relay (${SERVICE})"
fi
for role in roles/aiplatform.user roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" \
    --condition=None >/dev/null
done

# secret <name> <ENV_VAR>: create from the env var if missing (or ROTATE=1 adds a new version).
secret() {
  local name="$1" var="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    : "${!var:?$var must be set to create secret $name}"
    printf '%s' "${!var}" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  elif [[ "${ROTATE:-0}" == "1" && -n "${!var:-}" ]]; then
    printf '%s' "${!var}" | gcloud secrets versions add "$name" --data-file=-
  fi
}
secret "$APP_TOKEN_SECRET" APP_TOKEN
secret "$GNANI_SECRET" GNANI_API_KEY
secret "$OPENROUTER_SECRET" OPENROUTER_API_KEY

# max-instances 1: the rate limit lives in memory (L1.1). timeout 300 s covers /stt sessions.
# --allow-unauthenticated: Cloud Run IAM is open; the relay's own APP_TOKEN check guards it.
gcloud run deploy "$SERVICE" \
  --source "$HERE" \
  --region "$REGION" \
  --service-account "$SA" \
  --min-instances "$MIN_INSTANCES" --max-instances 1 \
  --cpu 1 --memory 512Mi --concurrency 20 --timeout 300 \
  --allow-unauthenticated \
  --set-env-vars "VLM_PROVIDER=${VLM_PROVIDER},VLM_MODEL=${VLM_MODEL},VERTEX_PROJECT=${PROJECT},VERTEX_LOCATION=${REGION}" \
  --set-secrets "APP_TOKEN=${APP_TOKEN_SECRET}:latest,GNANI_API_KEY=${GNANI_SECRET}:latest,OPENROUTER_API_KEY=${OPENROUTER_SECRET}:latest"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "Deployed: $URL"
echo "Smoke test: cd server && DEPLOYED_URL=$URL APP_TOKEN=… uv run pytest -m live tests/test_live_deployed.py"
