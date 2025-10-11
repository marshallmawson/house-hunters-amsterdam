
# This script builds and deploys a service to Cloud Run Jobs.
# It ensures that the correct naming convention is always used.

#Go to directory cd house-hunters-amsterdam/backend/scrape-and-process-listings

#To deploy the scraper:   
#                          ./deploy.sh scraper

#To deploy the processor:   
#                         ./deploy.sh processor

#To deploy the search service:   
#                         ./deploy.sh search

# --- Configuration ---
# Your Google Cloud Project ID
PROJECT_ID="house-hunters-amsterdam"
# The region for your Cloud Run jobs
REGION="europe-west4"
# The name of the repository in Artifact Registry
REPOSITORY="main"

# --- Script Logic ---
# The service to deploy (e.g., "processor" or "scraper")
SERVICE_NAME=$1

# Check if a service name was provided
if [ -z "$SERVICE_NAME" ]; then
  echo "Usage: ./deploy.sh [service-name]"
  echo "Example: ./deploy.sh processor"
  exit 1
fi

# Construct the full image name
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# Build and push the image
echo "Building and pushing image: ${IMAGE_NAME}"
gcloud builds submit "${SERVICE_NAME}" --tag "${IMAGE_NAME}"

# Check if the build was successful
if [ $? -ne 0 ]; then
  echo "Error: Docker image build failed."
  exit 1
fi

# Deploy based on service type
if [ "$SERVICE_NAME" = "search" ]; then
    # Deploy as a Cloud Run Service (same pattern as frontend)
    echo "Deploying Cloud Run service: ${SERVICE_NAME}-service"
    gcloud run deploy "${SERVICE_NAME}-service" \
      --image "${IMAGE_NAME}" \
      --region "${REGION}" \
      --platform managed \
      --allow-unauthenticated \
      --port 8080 \
      --memory 2Gi \
      --cpu 2 \
      --timeout 300 \
      --max-instances 10
    echo "Deployment of ${SERVICE_NAME}-service complete."
    echo "You can view your service at the URL provided above."
else
    # Deploy as a Cloud Run Job for scraper and processor
    echo "Deploying job: ${SERVICE_NAME}-job"
    gcloud run jobs deploy "${SERVICE_NAME}-job" \
      --image "${IMAGE_NAME}" \
      --region "${REGION}" \
      --task-timeout 1800 # Set timeout to 30 minutes (1800 seconds)
    echo "Deployment of ${SERVICE_NAME}-job complete."
fi