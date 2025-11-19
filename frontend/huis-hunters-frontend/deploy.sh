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

# Get Google Maps API key from environment variable or .env file
# Check root .env file first, then local .env file
if [ -f ../../.env ]; then
  GOOGLE_MAPS_API_KEY=$(grep "REACT_APP_GOOGLE_MAPS_API_KEY" ../../.env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
elif [ -f .env ]; then
  GOOGLE_MAPS_API_KEY=$(grep "REACT_APP_GOOGLE_MAPS_API_KEY" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
fi

# Use environment variable if .env file doesn't have it or value is empty
if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
  GOOGLE_MAPS_API_KEY="${REACT_APP_GOOGLE_MAPS_API_KEY}"
fi

# Check if API key is set
if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
  echo "ERROR: REACT_APP_GOOGLE_MAPS_API_KEY is not set!"
  echo "Please set it in your .env file or as an environment variable"
  exit 1
fi

gcloud builds submit . \
  --substitutions=_IMAGE_NAME="${IMAGE_NAME}",_REACT_APP_SEARCH_API_URL="https://search-service-315949479081.europe-west4.run.app",_REACT_APP_GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY}" \
  --config=cloudbuild.yaml

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
  --allow-unauthenticated

echo "Deployment of ${SERVICE_NAME}-service complete."
echo "You can view your service at the URL provided above."