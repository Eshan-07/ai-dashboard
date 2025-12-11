
import os
import smtplib
from email.message import EmailMessage
import logging

logger = logging.getLogger(__name__)

def send_welcome_email_smtp(to_email: str, to_name: str = ""):
    """
    Sends a welcome email using SMTP to the specified email address.
    Reads SMTP settings from environment variables.
    """
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    logger.info(f"Attempting to send email to {to_email} from {smtp_user}...")

    if not smtp_user or not smtp_pass:
        logger.warning(f"⚠️ SMTP credentials missing! USER={smtp_user}, PASS={'*' * 5 if smtp_pass else 'None'}")
        return

    msg = EmailMessage()
    msg["Subject"] = "Welcome to AI Dashboard — Glad you joined!"
    msg["From"] = smtp_user
    msg["To"] = to_email

    plain = f"""Hi {to_name or 'there'},

Welcome to AI Dashboard! We’re excited to have you on board.

— Team AI Dashboard
"""
    html = f"""
    <html>
      <body>
        <p>Hi {to_name or 'there'},</p>
        <p><strong>Welcome to AI Dashboard!</strong></p>
        <p>We're excited to have you on board.</p>
        <p>— Team AI Dashboard</p>
      </body>
    </html>
    """
    msg.set_content(plain)
    msg.add_alternative(html, subtype='html')

    try:
        # Use STARTTLS on port 587
        with smtplib.SMTP(smtp_host, smtp_port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(smtp_user, smtp_pass)
            smtp.send_message(msg)
        logger.info(f"✅ Welcome email sent to {to_email}")
    except Exception as e:
        logger.error(f"❌ Failed to send email to {to_email}: {e}")
