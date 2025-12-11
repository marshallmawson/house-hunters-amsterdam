import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def send_email_alert(subject, body, to_email=None):
    """
    Sends an email alert via Gmail SMTP.
    
    Args:
        subject: Email subject line
        body: Email body text
        to_email: Recipient email address (defaults to GMAIL_ALERT_EMAIL env var)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Get email configuration from environment variables
        gmail_user = os.getenv("GMAIL_USER")
        gmail_password = os.getenv("GMAIL_APP_PASSWORD")
        from_email = os.getenv("GMAIL_FROM_EMAIL", gmail_user)  # Default to GMAIL_USER if not set
        
        if not to_email:
            to_email = os.getenv("GMAIL_ALERT_EMAIL")
        
        if not gmail_user or not gmail_password or not to_email:
            print("⚠️ Email alert skipped: Gmail credentials not configured.")
            print("   Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_ALERT_EMAIL")
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Add timestamp to body
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        body_with_timestamp = f"{body}\n\nTimestamp: {timestamp}"
        
        msg.attach(MIMEText(body_with_timestamp, 'plain'))
        
        # Send email via Gmail SMTP
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(gmail_user, gmail_password)
        text = msg.as_string()
        server.sendmail(gmail_user, to_email, text)
        server.quit()
        
        print(f"✅ Email alert sent successfully to {to_email}")
        return True
        
    except Exception as e:
        print(f"❗️ Failed to send email alert: {e}")
        return False
