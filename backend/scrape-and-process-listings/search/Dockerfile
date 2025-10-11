FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the search service files
COPY search_api.py .
COPY search_service.py .

# Copy the neighborhoods.kml file
COPY neighborhoods.kml .

# Set environment variables for Cloud Run
ENV PORT=8080
# Note: GOOGLE_APPLICATION_CREDENTIALS not set - Cloud Run uses default service account

# Expose the port that Cloud Run expects
EXPOSE 8080

# Use gunicorn to run the Flask app
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 search_api:app
