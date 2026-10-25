from __future__ import annotations

from io import BytesIO
from urllib.error import HTTPError

import pytest

from app import financial_features


def test_missing_optional_transaction_time_column_falls_back_to_legacy_select(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        financial_features,
        "_supabase_config",
        lambda: ("https://example.supabase.co", "publishable-key"),
    )
    calls: list[str] = []

    def fake_get(url: str, **_kwargs):
        calls.append(url)
        if "transaction_time" in url:
            raise financial_features._OptionalTransactionColumnUnavailable
        return []

    monkeypatch.setattr(financial_features, "_authenticated_get", fake_get)

    assert financial_features._fetch_transaction_rows("user-a", "token") == []
    # Newest schema first, then each older shape, ending on the legacy select.
    assert len(calls) == len(financial_features._TRANSACTION_SELECTS)
    assert "transaction_time" in calls[0] and "account_id" in calls[0]
    assert "transaction_time" not in calls[-1] and "account_id" not in calls[-1]


def test_only_missing_optional_transaction_time_http_errors_use_compatibility_path(
    monkeypatch,
) -> None:
    error = HTTPError(
        "https://example.supabase.co/rest/v1/transactions",
        400,
        "Bad Request",
        {},
        BytesIO(b'{"message":"column transactions.transaction_time does not exist"}'),
    )

    def raise_error(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(financial_features, "urlopen", raise_error)

    with pytest.raises(financial_features._OptionalTransactionColumnUnavailable):
        financial_features._authenticated_get(
            "https://example.supabase.co/rest/v1/transactions",
            access_token="token",
            publishable_key="publishable-key",
        )


def test_other_upstream_http_errors_remain_service_unavailable(monkeypatch) -> None:
    error = HTTPError(
        "https://example.supabase.co/rest/v1/transactions",
        500,
        "Internal Server Error",
        {},
        BytesIO(b'{"message":"database unavailable"}'),
    )

    def raise_error(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(financial_features, "urlopen", raise_error)

    with pytest.raises(financial_features.HTTPException) as raised:
        financial_features._authenticated_get(
            "https://example.supabase.co/rest/v1/transactions",
            access_token="token",
            publishable_key="publishable-key",
        )
    assert raised.value.status_code == 503
