# Use an official Python runtime as a parent image
FROM python:3.9-slim
WORKDIR /app

# Install dependencies including system libraries needed for transformers
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Hugging Face models during build to avoid cold start delays
# This downloads the models and caches them in the container image
RUN python -c "from transformers import MarianMTModel, MarianTokenizer; model_name='Helsinki-NLP/opus-mt-nl-en'; tk = MarianTokenizer.from_pretrained(model_name); mdl = MarianMTModel.from_pretrained(model_name); print(f'Translation model {model_name} downloaded and cached successfully')"

# Pre-download the summarization model
RUN python -c "from transformers import AutoTokenizer, AutoModelForSeq2SeqLM; model_name='sshleifer/distilbart-cnn-12-6'; tk = AutoTokenizer.from_pretrained(model_name); mdl = AutoModelForSeq2SeqLM.from_pretrained(model_name); print(f'Summarization model {model_name} downloaded and cached successfully')"

# Copy the processor script, email utilities, and KML file
COPY processor.py .
COPY email_utils.py .
COPY neighborhoods.kml .

# Command to run the processor with unbuffered output
CMD ["python", "-u", "processor.py"]