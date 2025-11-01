#!/bin/bash
# This script deploys all services to Cloud Run
# Usage: ./deploy-all.sh [services]
# If no services specified, deploys: search, frontend
# Options: search, frontend, scraper, processor, all

set -e  # Exit on error

DEPLOY_SEARCH=false
DEPLOY_FRONTEND=false
DEPLOY_SCRAPER=false
DEPLOY_PROCESSOR=false

# Parse arguments
if [ $# -eq 0 ]; then
    # Default: deploy search and frontend (the ones that were modified)
    DEPLOY_SEARCH=true
    DEPLOY_FRONTEND=true
else
    for arg in "$@"; do
        case $arg in
            search)
                DEPLOY_SEARCH=true
                ;;
            frontend)
                DEPLOY_FRONTEND=true
                ;;
            scraper)
                DEPLOY_SCRAPER=true
                ;;
            processor)
                DEPLOY_PROCESSOR=true
                ;;
            all)
                DEPLOY_SEARCH=true
                DEPLOY_FRONTEND=true
                DEPLOY_SCRAPER=true
                DEPLOY_PROCESSOR=true
                ;;
            *)
                echo "Unknown service: $arg"
                echo "Usage: ./deploy-all.sh [search|frontend|scraper|processor|all]"
                exit 1
                ;;
        esac
    done
fi

# Get the project root directory (where this script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "Deploying services to Cloud Run"
echo "========================================="

# Deploy Search API
if [ "$DEPLOY_SEARCH" = true ]; then
    echo ""
    echo "🔍 Deploying Search API..."
    cd backend/scrape-and-process-listings
    ./deploy.sh search
    cd "$SCRIPT_DIR"
    echo "✅ Search API deployment complete"
fi

# Deploy Frontend
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo ""
    echo "🎨 Deploying Frontend..."
    cd frontend/huis-hunters-frontend
    ./deploy.sh
    cd "$SCRIPT_DIR"
    echo "✅ Frontend deployment complete"
fi

# Deploy Scraper (only if requested)
if [ "$DEPLOY_SCRAPER" = true ]; then
    echo ""
    echo "📥 Deploying Scraper Job..."
    cd backend/scrape-and-process-listings
    ./deploy.sh scraper
    cd "$SCRIPT_DIR"
    echo "✅ Scraper deployment complete"
fi

# Deploy Processor (only if requested)
if [ "$DEPLOY_PROCESSOR" = true ]; then
    echo ""
    echo "⚙️  Deploying Processor Job..."
    cd backend/scrape-and-process-listings
    ./deploy.sh processor
    cd "$SCRIPT_DIR"
    echo "✅ Processor deployment complete"
fi

echo ""
echo "========================================="
echo "🎉 All deployments complete!"
echo "========================================="

