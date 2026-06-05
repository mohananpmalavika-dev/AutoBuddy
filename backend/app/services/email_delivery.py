import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _smtp_port() -> int:
    raw = os.environ.get("SMTP_PORT", "587").strip()
    try:
        return int(raw)
    except ValueError:
        return 587


async def send_otp_email_message(
    *,
    recipient_email: str,
    otp_code: str,
    production: bool = False,
    subject: str = "Your AutoBuddy verification code",
) -> bool:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port = _smtp_port()
    smtp_username = os.environ.get("SMTP_USERNAME", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    smtp_from = (
        os.environ.get("SMTP_FROM_EMAIL", "").strip()
        or smtp_username
        or os.environ.get("MAIL_FROM", "").strip()
    )
    use_ssl = _env_bool("SMTP_USE_SSL", False)
    use_tls = _env_bool("SMTP_USE_TLS", not use_ssl)

    if not smtp_host or not smtp_from:
        message = "SMTP_HOST and SMTP_FROM_EMAIL/SMTP_USERNAME are required for email OTP delivery."
        if production:
            raise RuntimeError(message)
        logger.info("Email OTP dry-run for %s: %s", recipient_email, otp_code)
        return False

    email = EmailMessage()
    email["Subject"] = subject
    email["From"] = smtp_from
    email["To"] = recipient_email
    email.set_content(
        "Use this AutoBuddy verification code to continue:\n\n"
        f"{otp_code}\n\n"
        "This code expires shortly. If you did not request it, you can ignore this email."
    )

    def _send() -> None:
        client: Optional[smtplib.SMTP] = None
        try:
            if use_ssl:
                client = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
            else:
                client = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                if use_tls:
                    client.starttls()
            if smtp_username:
                client.login(smtp_username, smtp_password)
            client.send_message(email)
        finally:
            if client:
                client.quit()

    await asyncio.to_thread(_send)
    return True
