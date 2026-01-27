# Deploying travel-lust to Cloud Run

## Prerequisites

1. **gcloud CLI** – [Install](https://cloud.google.com/sdk/docs/install) and authenticate:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **APIs** – Enable required APIs in your project:
   ```bash
   gcloud services enable run.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
   ```

3. **Secret Manager** – Create a secret for the Gemini API key:
   ```bash
   echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
   ```
   Or add a new version to an existing secret:
   ```bash
   echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
   ```

4. **Permissions** – The Cloud Run service identity needs access to the secret. Grant Secret Manager Secret Accessor to the default compute service account (or the one your service uses):
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

## Deploy

From the project root, run:

```bash
./deploy.sh
```

Optional environment variables:

- `PROJECT_ID` – GCP project (default: `gcloud config get-value project`)
- `REGION` – Cloud Run region (default: `us-central1`)
- `SERVICE_NAME` – Service name (default: `travel-lust`)
- `GEMINI_SECRET_NAME` – Secret Manager secret name for `GEMINI_API_KEY` (default: `GEMINI_API_KEY`)

Example:

```bash
PROJECT_ID=my-project REGION=europe-west1 ./deploy.sh
```

Deploy uses `gcloud run deploy --source .`, so Cloud Build builds the image from the Dockerfile in this repo; no local Docker build or push is required.
