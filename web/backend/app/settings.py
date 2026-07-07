from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List
from urllib.parse import urlparse

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings(BaseModel):
    database_url: str = Field(...)
    secret_key: str = Field(...)
    cors_origins: List[str] = Field(default_factory=list)
    app_public_url: str = ""
    backend_public_url: str = ""
    open_banking_mode: str = "sandbox"
    open_banking_base_url: str = "https://open-banking-ais.onrender.com"
    open_banking_client_id: str = ""
    open_banking_client_secret: str = ""
    groq_api_key: str = ""
    mtn_momo_api_key: str = ""
    mtn_momo_base_url: str = ""
    admin_bootstrap_token: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "TracePay"
    smtp_use_tls: bool = True

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value:
            raise ValueError("DATABASE_URL is required for the PostgreSQL database.")
        if not value.startswith(("postgresql://", "postgres://")):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string.")
        return value

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if not value:
            raise ValueError("SECRET_KEY is required for JWT authentication.")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            origins = [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        else:
            origins = value

        for origin in origins:
            parsed = urlparse(origin)
            if origin == "*" or not parsed.scheme or not parsed.netloc or parsed.path:
                raise ValueError("CORS_ORIGINS must contain explicit origins like https://app.example.com")
            if parsed.scheme not in {"http", "https"}:
                raise ValueError("CORS origins must use http or https.")
            if parsed.hostname in {"localhost", "127.0.0.1", "0.0.0.0"} and os.getenv("ENVIRONMENT") == "production":
                raise ValueError("Localhost CORS origins are not allowed in production.")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", ""),
        secret_key=os.getenv("SECRET_KEY", ""),
        cors_origins=os.getenv("CORS_ORIGINS", ""),
        app_public_url=os.getenv("APP_PUBLIC_URL", ""),
        backend_public_url=os.getenv("BACKEND_PUBLIC_URL", ""),
        open_banking_mode=os.getenv("OPEN_BANKING_MODE", "sandbox").strip().lower(),
        open_banking_base_url=os.getenv(
            "OPEN_BANKING_BASE_URL", "https://open-banking-ais.onrender.com"
        ).rstrip("/"),
        open_banking_client_id=os.getenv("OPEN_BANKING_CLIENT_ID", ""),
        open_banking_client_secret=os.getenv("OPEN_BANKING_CLIENT_SECRET", ""),
        groq_api_key=os.getenv("GROQ_API_KEY", ""),
        mtn_momo_api_key=os.getenv("MTN_MOMO_API_KEY", ""),
        mtn_momo_base_url=os.getenv("MTN_MOMO_BASE_URL", ""),
        admin_bootstrap_token=os.getenv("ADMIN_BOOTSTRAP_TOKEN", ""),
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_username=os.getenv("SMTP_USERNAME", ""),
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_from_email=os.getenv("SMTP_FROM_EMAIL", ""),
        smtp_from_name=os.getenv("SMTP_FROM_NAME", "TracePay"),
        smtp_use_tls=(
            os.getenv("SMTP_USE_TLS", "true").strip().lower()
            not in {"0", "false", "no"}
        ),
    )


settings = get_settings()
