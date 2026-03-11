FROM python:3.9-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY email_alerts.py .
COPY email_utils.py .

CMD ["python", "-u", "email_alerts.py"]
