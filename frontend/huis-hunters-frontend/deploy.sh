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
gcloud builds submit . --tag "${IMAGE_NAME}"

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