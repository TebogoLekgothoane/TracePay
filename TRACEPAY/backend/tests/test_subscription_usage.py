from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app import finding_actions
from app import finding_registry
from app import subscription_usage
from leak_intelligence.finding_diff import RegistryRow
from leak_intelligence.finding_guidance import build_guidance


USER_ID = "11111111-1111-1111-1111-111111111111"
FINDING_ID = "22222222-2222-2222-2222-222222222222"
FINGERPRINT = "a" * 64


@pytest.fixture(autouse=True)
def configured_project(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subscription_usage, "_project_url", lambda: "https://tracepay.test")
    monkeypatch.setattr(finding_registry, "_project_url", lambda: "https://tracepay.test")


def test_missing_usage_answer_is_explicit() -> None:
    payload = subscription_usage.usage_payload(None)
    assert payload["usage_answer"] is None
    assert payload["usage_confirmed"] is False
    assert payload["explanation"] == "Usage has not been confirmed by the user."


def test_usage_read_is_user_scoped_and_returns_latest(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(url: str, _token: str, *, method: str, **_kwargs: object) -> list[dict[str, object]]:
        if "finding_registry" in url:
            return [{"id": FINDING_ID, "user_id": USER_ID, "leak_type": "subscription_leak", "fingerprint": FINGERPRINT}]
        assert method == "GET"
        return [{
            "id": "33333333-3333-3333-3333-333333333333",
            "user_id": USER_ID,
            "finding_id": FINDING_ID,
            "usage_answer": "never",
            "confirmed_at": "2026-10-15T12:00:00+00:00",
        }]

    monkeypatch.setattr(subscription_usage, "_request_json", request)
    result = subscription_usage.load_subscription_usage(USER_ID, "token", FINGERPRINT)
    assert result is not None
    assert result.usage_answer == "never"
    assert result.finding_id == FINDING_ID


def test_usage_cannot_attach_to_non_subscription_or_foreign_finding(monkeypatch: pytest.MonkeyPatch) -> None:
    def request(_url: str, _token: str, *, method: str, **_kwargs: object) -> list[dict[str, object]]:
        assert method == "GET"
        return [{"id": FINDING_ID, "user_id": USER_ID, "leak_type": "bank_fee_leak", "fingerprint": FINGERPRINT}]

    monkeypatch.setattr(subscription_usage, "_request_json", request)
    with pytest.raises(HTTPException) as error:
        subscription_usage.load_subscription_usage(USER_ID, "token", FINGERPRINT)
    assert error.value.status_code == 422


def test_usage_rejects_foreign_registry_row(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        subscription_usage,
        "_request_json",
        lambda *_args, **_kwargs: [{
            "id": FINDING_ID,
            "user_id": "99999999-9999-9999-9999-999999999999",
            "leak_type": "subscription_leak",
            "fingerprint": FINGERPRINT,
        }],
    )
    with pytest.raises(HTTPException) as error:
        subscription_usage.load_subscription_usage(USER_ID, "token", FINGERPRINT)
    assert error.value.status_code == 403


def test_usage_save_appends_answer_without_changing_finding(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def request(_url: str, _token: str, *, method: str, body: object | None = None, **_kwargs: object) -> list[dict[str, object]]:
        calls.append(method)
        if method == "GET":
            return [{"id": FINDING_ID, "user_id": USER_ID, "leak_type": "subscription_leak", "fingerprint": FINGERPRINT}]
        assert isinstance(body, dict)
        assert body["usage_answer"] == "sometimes"
        return [{
            "id": "44444444-4444-4444-4444-444444444444",
            "user_id": USER_ID,
            "finding_id": FINDING_ID,
            "usage_answer": "sometimes",
            "confirmed_at": "2026-10-15T12:00:00+00:00",
        }]

    monkeypatch.setattr(subscription_usage, "_request_json", request)
    saved = subscription_usage.save_subscription_usage(
        USER_ID,
        "token",
        FINGERPRINT,
        subscription_usage.SubscriptionUsageRequest(usage_answer="sometimes"),
        confirmed_at=datetime(2026, 10, 15, tzinfo=timezone.utc),
    )
    assert calls == ["GET", "POST"]
    assert saved.usage_answer == "sometimes"


def test_subscription_usage_integrates_into_finding_guidance() -> None:
    row = RegistryRow(
        id=FINDING_ID,
        user_id=USER_ID,
        fingerprint=FINGERPRINT[:32],
        identity_key="b" * 32,
        leak_type="subscription_leak",
        detector_version="1.0",
        account_id=None,
        status="open",
        material_signature="c" * 64,
        signature_generation=1,
        finding_focus="subscription_review",
        root_cause_type="recurring_commitment",
        analysis_status="supported",
        persistence="persistent",
        detected_amount=Decimal("199.00"),
        impact_kind="recurring",
        impact_label="observed_recurring_payment",
        period_start=date(2026, 7, 1),
        period_end=date(2026, 9, 30),
        evidence_highlights=(("merchant_display_name", "Merchant", "Netflix"),),
        first_detected_at=datetime(2026, 10, 10, tzinfo=timezone.utc),
        last_seen_at=datetime(2026, 10, 10, tzinfo=timezone.utc),
        last_absent_at=None,
        last_statement_import_id=None,
    )
    guidance = build_guidance(row, usage_answer="never")
    payload = finding_actions.guidance_payload(guidance)

    assert guidance.usage_answer == "never"
    assert payload["usage_answer"] == "never"
    assert guidance.detection_status == "open"
    assert any("User-confirmed usage: never." in item for item in guidance.known)
    assert any(
        "does not cancel the payment or establish verified savings" in item
        for item in guidance.uncertain
    )
    assert any("cancellation or downgrade" in step for step in guidance.steps)

