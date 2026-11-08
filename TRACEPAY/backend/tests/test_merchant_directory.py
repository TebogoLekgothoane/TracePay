import json
from decimal import Decimal
from io import BytesIO

import pytest

from app.config import settings
from categorisation.merchant_directory import (
    DirectoryEntry,
    MerchantDirectory,
    entry_for,
    pattern_key_for,
)
from categorisation.models import CategorisationResult
from categorisation.service import CategorisableTransaction, categorise_batch, categorise_batch_with_metrics
from tests.test_categorisation import LIVE_CATEGORIES

DESCRIPTION = "Mabaso Corner Cafe"


class FakeDirectory(MerchantDirectory):
    def __init__(self, known: dict[str, CategorisationResult] | None = None) -> None:
        self.known = known or {}
        self.looked_up: list[str] = []
        self.stored: list[DirectoryEntry] = []

    def lookup(self, keys: list[str]) -> dict[str, CategorisationResult]:
        self.looked_up.extend(keys)
        return {key: self.known[key] for key in keys if key in self.known}

    def store(self, entries: list[DirectoryEntry]) -> int:
        self.stored.extend(entries)
        return len(entries)


def _ai_result(**overrides) -> CategorisationResult:
    values = dict(
        category_name="Restaurants",
        category_confidence=0.95,
        transaction_class="spending",
        classification_confidence=0.95,
        classification_reason="Identified by AI",
        merchant_name="Mabaso Corner Cafe",
        rule="ai:openai",
    )
    values.update(overrides)
    return CategorisationResult(**values)


def _enable_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)
    monkeypatch.setattr("categorisation.service.settings.openai_api_key", "test-openai-key")


def _fail_if_called(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("AI must not be called")


def test_directory_hit_skips_the_ai_call(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_ai(monkeypatch)
    monkeypatch.setattr("categorisation.service.classify_batch", _fail_if_called)
    key = pattern_key_for(DESCRIPTION)
    directory = FakeDirectory({key: _ai_result(rule="merchant_directory")})
    run = categorise_batch_with_metrics(
        [CategorisableTransaction("0", DESCRIPTION, Decimal("-60"), "debit")],
        LIVE_CATEGORIES,
        merchant_directory=directory,
    )
    result = run.results["0"]
    assert result.category_name == "Restaurants"
    assert result.merchant_name == "Mabaso Corner Cafe"
    assert run.metrics.directory_matches == 1
    assert run.metrics.ai_requests == 0
    assert directory.stored == []


def test_directory_hit_works_even_when_ai_categorisation_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    monkeypatch.setattr("categorisation.service.classify_batch", _fail_if_called)
    directory = FakeDirectory({pattern_key_for(DESCRIPTION): _ai_result(rule="merchant_directory")})
    result = categorise_batch(
        [CategorisableTransaction("0", DESCRIPTION, Decimal("-60"), "debit")],
        LIVE_CATEGORIES,
        merchant_directory=directory,
    )["0"]
    assert result.category_name == "Restaurants"


def test_ai_answer_for_a_verified_merchant_is_learned(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_ai(monkeypatch)
    monkeypatch.setattr(
        "categorisation.service.classify_batch",
        lambda items, _names: {item.transaction_id: _ai_result() for item in items},
    )
    directory = FakeDirectory()
    categorise_batch(
        [CategorisableTransaction("0", DESCRIPTION, Decimal("-60"), "debit")],
        LIVE_CATEGORIES,
        merchant_directory=directory,
    )
    assert directory.stored == [DirectoryEntry(pattern_key_for(DESCRIPTION), "Mabaso Corner Cafe", "Restaurants", 0.95)]


def test_credits_are_never_looked_up_or_learned(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_ai(monkeypatch)
    monkeypatch.setattr(
        "categorisation.service.classify_batch",
        lambda items, _names: {item.transaction_id: _ai_result() for item in items},
    )
    directory = FakeDirectory()
    categorise_batch(
        [CategorisableTransaction("0", DESCRIPTION, Decimal("60"), "credit")],
        LIVE_CATEGORIES,
        merchant_directory=directory,
    )
    assert directory.looked_up == []
    assert directory.stored == []


@pytest.mark.parametrize(
    "result",
    [
        _ai_result(merchant_name=None),
        _ai_result(transaction_class="person_to_person"),
        _ai_result(transaction_class="income"),
        _ai_result(category_name="Other"),
        _ai_result(classification_confidence=0.5),
        _ai_result(category_confidence=0.5),
        _ai_result(rule="merchant_memory"),
        _ai_result(merchant_name="Payment Received"),
    ],
)
def test_unsafe_or_weak_results_are_not_shared(result: CategorisationResult) -> None:
    assert entry_for(DESCRIPTION, result) is None


@pytest.mark.parametrize(
    "description",
    [
        "Mabaso Cafe 0821234567",
        "Mabaso Cafe 1234567890123",
        "Mabaso Cafe REF ABC12345",
        "",
        "ab",
        "x" * 200,
    ],
)
def test_descriptions_with_identifiers_or_odd_length_are_not_shared(description: str) -> None:
    assert pattern_key_for(description) is None


def test_disabled_by_default_makes_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    assert settings.merchant_directory_enabled is False
    monkeypatch.setattr("urllib.request.urlopen", _fail_if_called)
    monkeypatch.setattr("categorisation.merchant_directory.urlopen", _fail_if_called)
    directory = MerchantDirectory()
    assert directory.lookup(["mabaso corner cafe"]) == {}
    assert directory.store([DirectoryEntry("mabaso corner cafe", "Mabaso", "Restaurants", 0.95)]) == 0


def test_enabled_client_reads_and_writes_only_non_personal_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "merchant_directory_enabled", True)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")
    requests = []

    class Response(BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def fake_urlopen(request, timeout=None):
        requests.append(request)
        if request.get_method() == "GET":
            return Response(
                json.dumps(
                    [{"pattern_key": "mabaso corner cafe", "merchant_name": "Mabaso Corner Cafe",
                      "category_name": "Restaurants", "confidence": 0.95}]
                ).encode()
            )
        return Response(b"")

    monkeypatch.setattr("categorisation.merchant_directory.urlopen", fake_urlopen)
    directory = MerchantDirectory()
    found = directory.lookup(["mabaso corner cafe", "unknown thing"])
    assert list(found) == ["mabaso corner cafe"]
    assert found["mabaso corner cafe"].rule == "merchant_directory"
    assert "merchant_directory" in requests[0].full_url and "in.(" in requests[0].full_url

    assert directory.store([DirectoryEntry("mabaso corner cafe", "Mabaso Corner Cafe", "Restaurants", 0.95)]) == 1
    body = json.loads(requests[1].data)[0]
    assert set(body) == {
        "pattern_key", "merchant_name", "category_name", "transaction_class",
        "confidence", "source", "updated_at",
    }
    assert "on_conflict=pattern_key" in requests[1].full_url


def test_lookup_failure_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "merchant_directory_enabled", True)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-key")

    def boom(*_args, **_kwargs):
        raise TimeoutError

    monkeypatch.setattr("categorisation.merchant_directory.urlopen", boom)
    directory = MerchantDirectory()
    assert directory.lookup(["mabaso corner cafe"]) == {}
    assert directory.store([DirectoryEntry("mabaso corner cafe", "Mabaso", "Restaurants", 0.95)]) == 0
