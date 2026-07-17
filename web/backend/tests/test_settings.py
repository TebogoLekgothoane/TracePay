from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.settings import Settings


def _settings(cors_origins: str) -> Settings:
    return Settings(
        database_url="postgresql://user:password@example.com:5432/postgres",
        secret_key="test-secret",
        cors_origins=cors_origins,
    )


def test_cors_origins_require_explicit_origins():
    settings = _settings("https://dashboard.tracepay.example,https://app.tracepay.example/")

    assert settings.cors_origins == [
        "https://dashboard.tracepay.example",
        "https://app.tracepay.example",
    ]


def test_cors_origins_reject_wildcards():
    with pytest.raises(ValidationError):
        _settings("*")


def test_cors_origins_reject_localhost_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(ValidationError):
        _settings("http://localhost:3000")
