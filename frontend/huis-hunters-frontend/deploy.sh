#!/bin/bash
# This script builds and deploys the frontend service to Google Cloud Run.

# go to directory cd house-hunters-amsterdam/frontend/huis-hunters-frontend
# Run:     ./deploy.sh


# --- Configuration ---
# Your Google Cloud Project ID
PROJECT_ID="house-hunters-amsterdam"
# The region for your Cloud Run service
REGION="europe-west4"
# The name of the repository in Artifact Registry
REPOSITORY="main"
# The name for this service
SERVICE_NAME="frontend"

# --- Script Logic ---

# Ensure we're using the correct project
echo "Setting gcloud project to: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

# Verify the project is set correctly
CURRENT_PROJECT=$(gcloud config get-value project)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
  echo "ERROR: Failed to set project to ${PROJECT_ID}. Current project is: ${CURRENT_PROJECT}"
  exit 1
fi

# Construct the full image name
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# Build and push the image from the current directory
echo "Building and pushing image: ${IMAGE_NAME}"
echo "Current directory: $(pwd)"
echo "Files in current directory:"
ls -la
# The '.' tells gcloud to build from the current directory where this script and the Dockerfile are located.
# Pass build arguments for production environment variables using substitutions
# Note: --tag is not used when --config is specified (cloudbuild.yaml handles tagging)

# Load values from .env file
ENV_FILE=""
if [ -f .env ]; then
  ENV_FILE=".env"
elif [ -f ../../.env ]; then
  ENV_FILE="../../.env"
fi

load_env_var() {
  local key="$1"
  local val=""
  if [ -n "$ENV_FILE" ]; then
    val=$(grep "^${key}=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  fi
  # Fall back to environment variable if not found in file
  if [ -z "$val" ]; then
    val="${!key}"
  fi
  echo "$val"
}

GOOGLE_MAPS_API_KEY=$(load_env_var "REACT_APP_GOOGLE_MAPS_API_KEY")
FIREBASE_API_KEY=$(load_env_var "REACT_APP_FIREBASE_API_KEY")
FIREBASE_AUTH_DOMAIN=$(load_env_var "REACT_APP_FIREBASE_AUTH_DOMAIN")
FIREBASE_PROJECT_ID=$(load_env_var "REACT_APP_FIREBASE_PROJECT_ID")
FIREBASE_STORAGE_BUCKET=$(load_env_var "REACT_APP_FIREBASE_STORAGE_BUCKET")
FIREBASE_MESSAGING_SENDER_ID=$(load_env_var "REACT_APP_FIREBASE_MESSAGING_SENDER_ID")
FIREBASE_APP_ID=$(load_env_var "REACT_APP_FIREBASE_APP_ID")
FIREBASE_MEASUREMENT_ID=$(load_env_var "REACT_APP_FIREBASE_MEASUREMENT_ID")

if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
  echo "ERROR: REACT_APP_GOOGLE_MAPS_API_KEY is not set in .env or environment"
  exit 1
fi

if [ -z "$FIREBASE_API_KEY" ]; then
  echo "ERROR: REACT_APP_FIREBASE_API_KEY is not set in .env or environment"
  exit 1
fi

gcloud builds submit . \
  --substitutions=_IMAGE_NAME="${IMAGE_NAME}",\
_REACT_APP_SEARCH_API_URL="https://search-service-315949479081.europe-west4.run.app",\
_REACT_APP_GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY}",\
_REACT_APP_FIREBASE_API_KEY="${FIREBASE_API_KEY}",\
_REACT_APP_FIREBASE_AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN}",\
_REACT_APP_FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}",\
_REACT_APP_FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET}",\
_REACT_APP_FIREBASE_MESSAGING_SENDER_ID="${FIREBASE_MESSAGING_SENDER_ID}",\
_REACT_APP_FIREBASE_APP_ID="${FIREBASE_APP_ID}",\
_REACT_APP_FIREBASE_MEASUREMENT_ID="${FIREBASE_MEASUREMENT_ID}" \
  --config=cloudbuild.yaml \
  --project "${PROJECT_ID}"

# Check if the build was successful
if [ $? -ne 0 ]; then
  echo "Error: Docker image build failed."
  exit 1
fi

# Deploy the service to Cloud Run, allowing public access
echo "Deploying service: ${SERVICE_NAME}-service"
gcloud run deploy "${SERVICE_NAME}-service" \
  --image "${IMAGE_NAME}" \
  --region "${REGION}" \
  --platform "managed" \
  --port "80" \
  --allow-unauthenticated \
  --service-account "frontend-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project "${PROJECT_ID}"

echo "Deployment of ${SERVICE_NAME}-service complete."
echo "You can view your service at the URL provided above."