from __future__ import annotations

import smtplib
from email.message import EmailMessage

from fastapi import HTTPException, status

from .settings import settings


def ensure_email_delivery_configured() -> None:
    missing = [
        name
        for name, value in {
            "SMTP_HOST": settings.smtp_host,
            "SMTP_FROM_EMAIL": settings.smtp_from_email,
            "APP_PUBLIC_URL": settings.app_public_url,
        }.items()
        if not value
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Email delivery is not configured. Missing: {', '.join(missing)}.",
        )


def send_email(to_email: str, subject: str, body: str) -> None:
    ensure_email_delivery_configured()

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery failed. Please try again later.",
        ) from exc


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    send_email(
        to_email,
        "Reset your TracePay password",
        "\n".join(
            [
                "We received a request to reset your TracePay password.",
                "",
                f"Reset your password here: {reset_url}",
                "",
                "This link expires in 30 minutes. If you did not request this, you can ignore this email.",
            ]
        ),
    )


def send_email_verification_email(to_email: str, verification_url: str) -> None:
    send_email(
        to_email,
        "Verify your TracePay email",
        "\n".join(
            [
                "Please verify your TracePay email address.",
                "",
                f"Verify your email here: {verification_url}",
                "",
                "This link expires in 24 hours.",
            ]
        ),
    )
