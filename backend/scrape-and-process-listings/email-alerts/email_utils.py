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
        from_name = os.getenv("GMAIL_FROM_NAME", "Huis Hunters")

        if not to_email:
            to_email = os.getenv("GMAIL_ALERT_EMAIL")

        if not gmail_user or not gmail_password or not to_email:
            print("Email alert skipped: Gmail credentials not configured.")
            print("   Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_ALERT_EMAIL")
            return False

        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{from_name} <{from_email}>"
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

        print(f"Email alert sent successfully to {to_email}")
        return True

    except Exception as e:
        print(f"Failed to send email alert: {e}")
        return False


def send_html_email(subject, html_body, to_email):
    """
    Sends an HTML email via Gmail SMTP.

    Args:
        subject: Email subject line
        html_body: HTML email body
        to_email: Recipient email address

    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        gmail_user = os.getenv("GMAIL_USER")
        gmail_password = os.getenv("GMAIL_APP_PASSWORD")
        from_email = os.getenv("GMAIL_FROM_EMAIL", gmail_user)
        from_name = os.getenv("GMAIL_FROM_NAME", "Huis Hunters")

        if not gmail_user or not gmail_password or not to_email:
            print("HTML email skipped: credentials not configured.")
            return False

        msg = MIMEMultipart('alternative')
        msg['From'] = f"{from_name} <{from_email}>"
        msg['To'] = to_email
        msg['Subject'] = subject

        msg.attach(MIMEText(html_body, 'html'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, to_email, msg.as_string())
        server.quit()

        print(f"HTML email sent to {to_email}")
        return True

    except Exception as e:
        print(f"Failed to send HTML email: {e}")
        return False
