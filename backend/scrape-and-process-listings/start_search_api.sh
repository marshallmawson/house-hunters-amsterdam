#!/bin/bash

# Start the AI Search API
echo "Starting AI Search API..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -r search_requirements.txt

# Set environment variables (you'll need to set these)
export GOOGLE_APPLICATION_CREDENTIALS="../firebase-credentials.json"

# Start the Flask API
echo "Starting Flask API on port 5000..."
python search_api.py
