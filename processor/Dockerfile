# Use an official Python runtime as a parent image
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the processor script
COPY processor.py .

# Command to run the processor with unbuffered output
CMD ["python", "-u", "processor.py"]