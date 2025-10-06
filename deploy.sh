
# This script builds and deploys a service to Cloud Run Jobs.
# It ensures that the correct naming convention is always used.

#To deploy the scraper:   
#                          ./deploy.sh scraper

#To deploy the processor:   
#                         ./deploy.sh processor


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

# Deploy the job to Cloud Run
echo "Deploying job: ${SERVICE_NAME}-job"
gcloud run jobs deploy "${SERVICE_NAME}-job" \
  --image "${IMAGE_NAME}" \
  --region "${REGION}"

echo "Deployment of ${SERVICE_NAME}-job complete."