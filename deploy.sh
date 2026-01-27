#!/usr/bin/env bash
set -e

# Deploy travel-lust to Cloud Run from source (Cloud Build builds the image).
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Secret "GEMINI_API_KEY" in Secret Manager with your Gemini API key
#   - Cloud Run API, Secret Manager API, Artifact Registry API enabled

SERVICE_NAME="${SERVICE_NAME:-travel-lust}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
SECRET_NAME="${GEMINI_SECRET_NAME:-GEMINI_API_KEY}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: PROJECT_ID not set. Set it or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Deploying $SERVICE_NAME to Cloud Run (project=$PROJECT_ID, region=$REGION)"
echo "Using Secret Manager secret: $SECRET_NAME for GEMINI_API_KEY"
echo ""

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=${SECRET_NAME}:latest" \
  --port 8080

echo ""
echo "Deployment complete. Service URL:"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)'
