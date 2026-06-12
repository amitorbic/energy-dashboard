import os
import asyncio
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "AmeriPower <info@ameripower.com>")


def send_email(
    to: str,
    subject: str,
    html: str,
    attachment: bytes = None,
    attachment_name: str = None,
):
    msg = MIMEMultipart("mixed")
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    if attachment:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(attachment)
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition", f"attachment; filename={attachment_name}"
        )
        msg.attach(part)

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, to, msg.as_string())


async def send_email_async(
    to: str,
    subject: str,
    html: str,
    attachment: bytes = None,
    attachment_name: str = None,
):
    emails = [e.strip() for e in to.split(";") if e.strip()]
    loop = asyncio.get_event_loop()
    for email in emails:
        await loop.run_in_executor(
            None,
            lambda e=email: send_email(e, subject, html, attachment, attachment_name),
        )
