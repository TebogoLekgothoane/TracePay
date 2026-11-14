"""The database-backed daily AI budget and how categorisation behaves when it is spent."""

from decimal import Decimal
from urllib.error import URLError

import pytest

from app.config import settings
from categorisation import ai_budget
from categorisation.ai_budget import AiBudgetUnavailable, consume_ai_budget
from categorisation.service import CategorisableTransaction, categorise_batch


class _FakeResponse:
    def __init__(self, body: str):
        self._body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")
    monkeypatch.setattr(settings, "ai_daily_item_limit", 2000)


def test_budget_allows_when_the_database_says_true(configured, monkeypatch):
    sent = {}

    def fake_urlopen(request, timeout):
        sent["url"] = request.full_url
        sent["body"] = request.data
        return _FakeResponse("true")

    monkeypatch.setattr(ai_budget, "urlopen", fake_urlopen)
    assert consume_ai_budget("user-1", 40) is True
    assert sent["url"] == "https://example.supabase.co/rest/v1/rpc/consume_ai_budget"
    assert b'"p_amount": 40' in sent["body"]
    assert b'"p_limit": 2000' in sent["body"]


def test_budget_refuses_when_the_database_says_false(configured, monkeypatch):
    monkeypatch.setattr(ai_budget, "urlopen", lambda request, timeout: _FakeResponse("false"))
    assert consume_ai_budget("user-1", 40) is False


def test_zero_items_never_touch_the_database(configured, monkeypatch):
    def boom(request, timeout):
        raise AssertionError("no database call expected")

    monkeypatch.setattr(ai_budget, "urlopen", boom)
    assert consume_ai_budget("user-1", 0) is True


def test_an_unreachable_database_is_unavailable_not_allowed(configured, monkeypatch):
    def down(request, timeout):
        raise URLError("connection refused")

    monkeypatch.setattr(ai_budget, "urlopen", down)
    with pytest.raises(AiBudgetUnavailable):
        consume_ai_budget("user-1", 40)


def test_missing_service_key_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    with pytest.raises(AiBudgetUnavailable):
        consume_ai_budget("user-1", 40)


class _StubMemory:
    def get(self, key):
        return None

    def remember(self, merchant, result):
        return None


class _StubDirectory:
    def lookup(self, keys):
        return {}

    def store(self, entries):
        return None


def _unknown_debit():
    return [
        CategorisableTransaction(
            "t1", "QWRTZ 88213 LOCAL PAYEE", Decimal("-120.00"), "debit"
        )
    ]


def test_categorisation_skips_the_model_when_the_budget_is_spent(monkeypatch):
    monkeypatch.setattr(settings, "ai_categorisation_enabled", True)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    calls = []
    monkeypatch.setattr(
        "categorisation.service.classify_batch",
        lambda batch, catalog: calls.append(len(batch)) or {},
    )
    results = categorise_batch(
        _unknown_debit(),
        ["Other", "Shopping"],
        merchant_memory=_StubMemory(),
        merchant_directory=_StubDirectory(),
        ai_allowed=lambda amount: False,
    )
    assert calls == []
    assert "t1" in results


def test_categorisation_charges_only_the_items_sent_to_the_model(monkeypatch):
    monkeypatch.setattr(settings, "ai_categorisation_enabled", True)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    charged = []
    calls = []
    monkeypatch.setattr(
        "categorisation.service.classify_batch",
        lambda batch, catalog: calls.append(len(batch)) or {},
    )
    categorise_batch(
        _unknown_debit(),
        ["Other", "Shopping"],
        merchant_memory=_StubMemory(),
        merchant_directory=_StubDirectory(),
        ai_allowed=lambda amount: charged.append(amount) or True,
    )
    assert charged == [1]
    assert calls == [1]


def test_an_unreachable_budget_check_means_no_model_call(monkeypatch):
    monkeypatch.setattr(settings, "ai_categorisation_enabled", True)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    calls = []
    monkeypatch.setattr(
        "categorisation.service.classify_batch",
        lambda batch, catalog: calls.append(len(batch)) or {},
    )

    def unavailable(amount):
        raise AiBudgetUnavailable("down")

    results = categorise_batch(
        _unknown_debit(),
        ["Other", "Shopping"],
        merchant_memory=_StubMemory(),
        merchant_directory=_StubDirectory(),
        ai_allowed=unavailable,
    )
    assert calls == []
    assert "t1" in results
