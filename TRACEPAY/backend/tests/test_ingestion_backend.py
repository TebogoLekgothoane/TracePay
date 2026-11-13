"""Tests for the FastAPI port of phone reading ingestion. Supabase is faked; no network."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import ingestion, ingestion_routes
from app.auth_errors import AuthError
from app.config import settings
from app.ingestion_parser import _parse_amount, to_parsed_transaction
from app.main import app

USER_ID = "11111111-2222-3333-4444-555555555555"


@pytest.fixture(autouse=True)
def supabase_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-key-for-tests")
    monkeypatch.setattr(settings, "supabase_anon_key", "anon-key-for-tests")
    monkeypatch.setattr(settings, "supabase_key", "")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sms(**overrides: Any) -> dict[str, Any]:
    reading = {
        "clientId": "sms-1",
        "source": "sms",
        "receivedAt": _now_iso(),
        "sender": "Capitec",
        "body": "Debit R250.00 at WOOLWORTHS SANDTON",
    }
    reading.update(overrides)
    return reading


class FakeSupabase:
    def __init__(self) -> None:
        self.readings: list[dict[str, Any]] = []
        self.parsed: list[dict[str, Any]] = []

    def __call__(self, method: str, path: str, *, headers: dict[str, str], body: Any = None) -> tuple[int, Any]:
        if path.startswith("/rest/v1/ingestion_readings"):
            assert "on_conflict=user_id,source,client_id" in path
            stored = []
            for row in body:
                record = {**row, "id": str(uuid.uuid4())}
                self.readings.append(record)
                stored.append(record)
            return 201, stored
        if path.startswith("/rest/v1/parsed_transactions"):
            self.parsed.extend(body)
            return 201, []
        raise AssertionError(f"unexpected {method} {path}")


@pytest.fixture
def fake_supabase(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(ingestion, "_supabase", fake)
    return fake


# --- Validation -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("reading", "message"),
    [
        (_sms(sender=""), "sender is required for SMS readings."),
        (_sms(appIdentifier="com.bank"), "SMS readings cannot include appIdentifier."),
        (_sms(source="fax"), "Reading source must be sms or notification."),
        ({"clientId": "n", "source": "notification", "receivedAt": _now_iso(), "body": "x"}, "appIdentifier is required for notification readings."),
        (_sms(clientId=""), "clientId is required."),
        (_sms(body="x" * 4001), "body is too long."),
        (_sms(receivedAt="not a date"), "receivedAt must be a valid timestamp."),
        (_sms(receivedAt=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()), "receivedAt cannot be in the future."),
        (_sms(metadata={"blob": "x" * 9000}), "metadata is too large."),
    ],
)
def test_invalid_reading_is_rejected(reading: dict[str, Any], message: str) -> None:
    with pytest.raises(AuthError) as info:
        ingestion.validate_batch({"readings": [reading]}, USER_ID)
    assert info.value.status_code == 400
    assert info.value.message == message


def test_foreign_user_id_is_rejected() -> None:
    with pytest.raises(AuthError) as info:
        ingestion.validate_batch({"readings": [_sms(user_id="someone-else")]}, USER_ID)
    assert info.value.message == "user_id does not match the signed-in user."


def test_own_user_id_is_accepted() -> None:
    rows = ingestion.validate_batch({"readings": [_sms(userId=USER_ID)]}, USER_ID)
    assert len(rows) == 1


def test_batch_limits() -> None:
    with pytest.raises(AuthError, match="Send at least one reading."):
        ingestion.validate_batch({"readings": []}, USER_ID)
    with pytest.raises(AuthError, match="Send no more than 100 readings at once."):
        ingestion.validate_batch({"readings": [_sms(clientId=f"c{i}") for i in range(101)]}, USER_ID)


def test_non_array_readings_is_rejected() -> None:
    with pytest.raises(AuthError, match="readings must be an array."):
        ingestion.validate_batch({"readings": "nope"}, USER_ID)


# --- Parser ---------------------------------------------------------------------


def test_bank_debit_sms_is_parsed() -> None:
    reading = {
        "id": "reading-1",
        "user_id": USER_ID,
        "client_id": "sms-1",
        "source": "sms",
        "received_at": _now_iso(),
        "sender": "Capitec",
        "app_identifier": None,
        "title": None,
        "body": "Debit R250.00 at WOOLWORTHS SANDTON",
    }
    row = to_parsed_transaction(reading, _now_iso())
    assert row is not None
    assert row["type"] == "debit"
    assert row["amount"] == 250.0
    assert row["merchant"] == "WOOLWORTHS SANDTON"
    assert row["merchant_key"] == "woolworths-sandton"
    assert row["confidence"] == "high"
    assert row["transaction_id"] == "ingestion:reading-1"
    assert row["source"] == "sms_parse"


def test_non_bank_text_is_not_parsed() -> None:
    reading = {
        "id": "reading-2",
        "user_id": USER_ID,
        "client_id": "n-1",
        "source": "notification",
        "received_at": _now_iso(),
        "sender": None,
        "app_identifier": "com.whatsapp",
        "title": "Mum",
        "body": "Sent you R20 for lunch",
    }
    assert to_parsed_transaction(reading, _now_iso()) is None


def test_bank_credit_is_typed_as_credit() -> None:
    reading = {
        "id": "reading-3",
        "user_id": USER_ID,
        "client_id": "sms-2",
        "source": "sms",
        "received_at": _now_iso(),
        "sender": "FNB",
        "app_identifier": None,
        "title": None,
        "body": "Credit R1,500.00 deposit received",
    }
    row = to_parsed_transaction(reading, _now_iso())
    assert row is not None and row["type"] == "credit"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("R1,500.00", 1500.0),
        ("R1 500,00", 1500.0),
        ("R1 500,00", 1500.0),
        ("R1,234,567.89", 1234567.89),
        ("ZAR 12 345.67", 12345.67),
        ("R250,00", 250.0),
        ("R250.00", 250.0),
        ("R1,50", 1.5),
        ("R1 000", 1000.0),
        ("R45", 45.0),
    ],
)
def test_amount_separators(text: str, expected: float) -> None:
    reading = {
        "id": "reading-amount",
        "user_id": USER_ID,
        "client_id": "sms-amount",
        "source": "sms",
        "received_at": _now_iso(),
        "sender": "Capitec",
        "app_identifier": None,
        "title": None,
        "body": f"Debit {text} at SHOP",
    }
    row = to_parsed_transaction(reading, _now_iso())
    assert _parse_amount(f"Debit {text} at SHOP") == expected
    assert row is not None and row["amount"] == expected


# --- Ingest ---------------------------------------------------------------------


def test_ingest_stores_readings_and_parsed_transactions(fake_supabase: FakeSupabase) -> None:
    result = ingestion.ingest_readings(
        USER_ID,
        {
            "readings": [
                _sms(),
                {"clientId": "n-1", "source": "notification", "receivedAt": _now_iso(), "appIdentifier": "com.bank", "body": "hello"},
            ]
        },
    )
    assert result["accepted"] == 2
    assert {r["clientId"] for r in result["readings"]} == {"sms-1", "n-1"}
    assert all(row["user_id"] == USER_ID for row in fake_supabase.readings)
    assert len(fake_supabase.parsed) == 1
    assert fake_supabase.parsed[0]["amount"] == 250.0


def test_ingest_rejects_empty_user() -> None:
    with pytest.raises(AuthError) as info:
        ingestion.ingest_readings("  ", {"readings": [_sms()]})
    assert info.value.status_code == 401


# --- HTTP route -----------------------------------------------------------------


def test_route_requires_bearer_token() -> None:
    response = TestClient(app).post("/ingestion/readings", json={"readings": [_sms()]})
    assert response.status_code == 401
    assert response.json() == {"error": "Sign in to sync phone readings."}


def test_route_accepts_authenticated_batch(monkeypatch: pytest.MonkeyPatch, fake_supabase: FakeSupabase) -> None:
    monkeypatch.setattr(ingestion_routes, "_fetch_supabase_user_id", lambda token: USER_ID)
    response = TestClient(app).post(
        "/ingestion/readings",
        json={"readings": [_sms(clientId="route-1")]},
        headers={"Authorization": "Bearer token-for-tests"},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] == 1
    assert body["readings"][0]["clientId"] == "route-1"
    assert body["readings"][0]["receivedAt"]


def test_route_maps_invalid_session_to_error_body(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    def rejected(token: str) -> str:
        raise HTTPException(status_code=401, detail="The Supabase access token is invalid or expired.")

    monkeypatch.setattr(ingestion_routes, "_fetch_supabase_user_id", rejected)
    response = TestClient(app).post(
        "/ingestion/readings",
        json={"readings": [_sms()]},
        headers={"Authorization": "Bearer expired"},
    )
    assert response.status_code == 401
    assert response.json() == {"error": "Your session expired. Please sign in again."}
