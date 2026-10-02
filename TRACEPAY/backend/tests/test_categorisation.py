import io

import pytest
from decimal import Decimal

from categorisation.classifier import classify_transaction
from categorisation import ai_classifier
from categorisation.models import CategorisationResult
from categorisation.service import CategorisableTransaction, categorise_batch


@pytest.mark.parametrize(("description", "category"), [
    ("WOOLWORTHS", "Groceries"), ("CHECKERS", "Groceries"), ("SHOPRITE", "Groceries"),
    ("NANDO'S", "Restaurants"), ("MUGG & BEAN", "Restaurants"),
    ("KFC", "Fast Food"), ("MCDONALDS", "Fast Food"),
    ("UBER", "Ride Hailing"), ("BOLT", "Ride Hailing"), ("SHELL", "Fuel"), ("GAUTRAIN", "Public Transport"),
    ("MTN AIRTIME", "Airtime & Data"), ("VODACOM DATA", "Airtime & Data"),
    ("NETFLIX", "Subscriptions"), ("SPOTIFY", "Subscriptions"), ("DSTV", "Subscriptions"),
    ("FNB SERVICE FEE", "Bank Fees"),
    ("SALARY", "Salary"), ("PAYROLL", "Salary"), ("ELECTRICITY", "Utilities"),
])
def test_known_rules(description: str, category: str) -> None:
    result = classify_transaction(description, "credit" if category == "Salary" else "debit")
    assert result.category_name == category
    assert result.confidence > 0
    assert result.rule


def test_case_and_merchant_variations() -> None:
    assert classify_transaction("woolworths").category_name == "Groceries"
    assert classify_transaction("Woolworths Store 123").category_name == "Groceries"
    assert classify_transaction("WOOLWORTHS CAPE TOWN").category_name == "Groceries"


def test_unknown_and_amount_independence() -> None:
    assert classify_transaction("RANDOM UNKNOWN MERCHANT").category_name is None
    assert classify_transaction("WOOLWORTHS", "debit").category_name == classify_transaction("WOOLWORTHS", "credit").category_name


def test_data_alone_is_not_airtime() -> None:
    assert classify_transaction("CUSTOMER DATA REPORT").category_name is None


def test_salary_advance_is_other_income() -> None:
    assert classify_transaction("SALARY ADVANCE", "credit").category_name == "Other Income"
    assert classify_transaction("SALARY ADVANCE", "debit").category_name is None


@pytest.mark.parametrize(("description", "transaction_class"), [
    ("Pay Beneficiary, Mosto", "person_to_person"),
    ("Money transferred out from GoalSave", "internal_transfer"),
    ("Money added to Fixed Deposit 30710268044", "savings"),
])
def test_non_spending_transaction_classes(description: str, transaction_class: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == transaction_class
    if description.startswith("Money added to Fixed Deposit"):
        assert result.category_name == "Savings"
    else:
        assert result.category_name is None


def test_eft_and_generic_purchase_are_not_deterministic_categories() -> None:
    eft = classify_transaction("EFT for CAPITEC J MAPHOSA", "debit")
    purchase = classify_transaction("Purchase at BUCCANEERS", "debit")
    assert eft.transaction_class == "unknown"
    assert purchase.transaction_class == "unknown"


def test_payshap_is_left_for_ai_context() -> None:
    result = classify_transaction("PayShap - Pay by ShapID, grocery", "debit")
    assert result.transaction_class == "unknown"
    assert result.category_name is None


def test_data_bundle_is_airtime_and_data() -> None:
    result = classify_transaction("VAS - Mobile Purchase for 0716423985 Data Bundle", "debit")
    assert result.transaction_class == "spending"
    assert result.category_name == "Airtime & Data"


@pytest.mark.parametrize(("description", "category"), [
    ("Purchase at TROPICAL FRUIT", "Groceries"),
    ("Purchase at S2SAubsSpaza", "Groceries"),
])
def test_common_statement_descriptions(description: str, category: str) -> None:
    assert classify_transaction(description, "debit").category_name == category


def test_blank_description_is_unknown_and_uncategorised(caplog: pytest.LogCaptureFixture) -> None:
    result = classify_transaction("-", "debit")
    assert result.transaction_class == "unknown"
    assert result.category_name is None


def test_uncategorised_breakdown_is_logged_without_descriptions(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="tracepay.categorisation")
    categorise_batch(
        [
            CategorisableTransaction("0", "-", Decimal("-10"), "debit"),
            CategorisableTransaction("1", "Pay Beneficiary, Mosto", Decimal("-12"), "debit"),
        ],
        [],
    )
    message = " ".join(record.getMessage() for record in caplog.records)
    assert "uncategorised_breakdown total=2" in message
    assert "placeholder_descriptions=1" in message
    assert "Pay Beneficiary" not in message
    assert "transaction_ids=" not in message


def test_ai_low_confidence_category_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)

    def fake_classify_batch(*_args: object, **_kwargs: object) -> dict[str, CategorisationResult]:
        return {"0": CategorisationResult(
            category_name="Savings",
            category_confidence=0.62,
            transaction_class="savings",
            classification_confidence=0.96,
            classification_reason="Fixed deposit contribution",
            rule="ai:openai",
        )}

    monkeypatch.setattr("categorisation.service.classify_batch", fake_classify_batch)
    result = categorise_batch(
        [CategorisableTransaction("0", "A savings contribution", Decimal("-100"), "debit")],
        ["Savings"],
    )["0"]
    assert result.category_name == "Savings"
    assert result.category_confidence == 0.62
    assert result.classification_confidence == 0.96


def test_duplicate_ai_pattern_is_applied_to_every_transaction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)

    calls = 0

    def fake_classify_batch(items: list[object], _category_names: list[str]) -> dict[str, CategorisationResult]:
        nonlocal calls
        calls += 1
        item = items[0]
        return {item.transaction_id: CategorisationResult(
            category_name="Person to Person",
            category_confidence=0.81,
            transaction_class="person_to_person",
            classification_confidence=0.88,
            classification_reason="Payment to another person",
            rule="ai:openai",
        )}

    monkeypatch.setattr("categorisation.service.classify_batch", fake_classify_batch)
    transactions = [
        CategorisableTransaction(str(index), "PayShap - Pay by Account, T LEKGOTHOANE", Decimal("-50"), "debit")
        for index in range(3)
    ]
    results = categorise_batch(transactions, ["Person to Person"])
    assert calls == 1
    assert all(result.transaction_class == "person_to_person" for result in results.values())
    assert all(result.category_name == "Person to Person" for result in results.values())


def test_ai_disabled_skips_providers_and_preserves_deterministic_results(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    monkeypatch.setattr("categorisation.service.settings.openai_api_key", "openai-test-key")

    def fail_if_called(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("AI provider should not be called when disabled")

    monkeypatch.setattr("categorisation.service.classify_batch", fail_if_called)
    caplog.set_level("INFO", logger="tracepay.categorisation")
    results = categorise_batch(
        [
            CategorisableTransaction("known", "WOOLWORTHS", Decimal("-20"), "debit"),
            CategorisableTransaction("unknown", "Unrecognised merchant", Decimal("-20"), "debit"),
        ],
        ["Groceries"],
    )
    assert results["known"].category_name == "Groceries"
    assert results["unknown"].category_name is None
    assert "skipped reason=disabled" in " ".join(record.getMessage() for record in caplog.records)
    assert "candidate_collected" not in " ".join(record.getMessage() for record in caplog.records)


def test_ai_enabled_keeps_provider_flow_reachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)
    monkeypatch.setattr("categorisation.service.settings.openai_api_key", "openai-test-key")
    calls = 0

    def classify(items: list[object], _category_names: list[str]) -> dict[str, CategorisationResult]:
        nonlocal calls
        calls += 1
        item = items[0]
        return {item.transaction_id: CategorisationResult(
            category_name="Groceries",
            category_confidence=0.9,
            transaction_class="spending",
            classification_confidence=0.9,
            classification_reason="AI test result",
            rule="ai:openai",
        )}

    monkeypatch.setattr("categorisation.service.classify_batch", classify)
    result = categorise_batch(
        [CategorisableTransaction("0", "Unknown merchant", Decimal("-10"), "debit")],
        ["Groceries"],
    )
    assert calls == 1
    assert result["0"].rule == "ai:openai"


def test_openai_failure_returns_empty_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: None)
    assert ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Purchase at Example", "-10", "debit")],
        ["Groceries"],
    ) == {}


def test_openai_success_returns_validated_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: {
        "choices": [{"message": {"content": '{"transactions":[{"transaction_id":"0","transaction_class":"spending","classification_confidence":0.9,"category_name":"Groceries","category_confidence":0.8,"reason":"Merchant purchase","merchant_name":"Example"}]}'}}],
    })
    result = ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Purchase at Example", "-10", "debit")],
        ["Groceries"],
    )["0"]
    assert result.rule == "ai:openai"
    assert result.category_name == "Groceries"


def test_malformed_openai_response_is_rejected_safely(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: {
        "choices": [{"message": {"content": "not-json"}}],
    })
    assert ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Unknown", "-10", "debit")],
        ["Groceries"],
    ) == {}


@pytest.mark.parametrize("content", [
    '{"transactions": []}',
    'json\n{"transactions": []}',
    '  ```json\n{"transactions": []}\n```  ',
])
def test_openai_response_text_accepts_json_variants(content: str) -> None:
    payload = {"choices": [{"message": {"content": content}}]}
    assert ai_classifier.json.loads(ai_classifier._openai_response_text(payload)) == {"transactions": []}


def test_openai_response_text_accepts_content_parts() -> None:
    payload = {"choices": [{"message": {"content": [{"type": "text", "text": '{"transactions": []}'}]}}]}
    assert ai_classifier._openai_response_text(payload) == '{"transactions": []}'


@pytest.mark.parametrize("payload", [
    {"choices": [{"message": {"content": ""}}]},
    {"choices": [{"message": {"content": None}}]},
    {"choices": []},
    {},
])
def test_openai_response_text_rejects_missing_or_empty_content(payload: dict) -> None:
    with pytest.raises(ValueError):
        ai_classifier._openai_response_text(payload)


def test_invalid_openai_category_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: {
        "choices": [{"message": {"content": '{"transactions":[{"transaction_id":"0","transaction_class":"spending","classification_confidence":0.9,"category_name":"Not A Live Category","category_confidence":0.8,"reason":"Invalid","merchant_name":"Example"}]}'}}],
    })
    assert ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Unknown", "-10", "debit")],
        ["Groceries"],
    ) == {}


def test_openai_http_failure_fails_cleanly(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")

    def fail(*_args: object, **_kwargs: object) -> None:
        raise ai_classifier.HTTPError("https://api.openai.com/v1/chat/completions", 503, "Unavailable", {}, io.BytesIO(b"provider unavailable"))

    monkeypatch.setattr(ai_classifier, "urlopen", fail)
    caplog.set_level("ERROR", logger="tracepay.categorisation.ai")
    assert ai_classifier._request_openai("{}", {}, 1) is None
    assert "request_failed provider=openai" in " ".join(record.getMessage() for record in caplog.records)


def test_openai_success_uses_configured_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier.settings, "openai_timeout_seconds", 45)

    class Response:
        def __enter__(self) -> "Response":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"choices":[{"message":{"content":"{\\"transactions\\":[]}"}}]}'

    seen: dict[str, int] = {}

    def succeed(_request: object, *, timeout: int) -> Response:
        seen["timeout"] = timeout
        return Response()

    monkeypatch.setattr(ai_classifier, "urlopen", succeed)
    assert ai_classifier._request_openai("{}", {}, 1) is not None
    assert seen["timeout"] == 45


def test_openai_timeout_fails_cleanly(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier.settings, "openai_timeout_seconds", 45)

    def timeout(*_args: object, **_kwargs: object) -> None:
        raise TimeoutError

    monkeypatch.setattr(ai_classifier, "urlopen", timeout)
    caplog.set_level("ERROR", logger="tracepay.categorisation.ai")
    assert ai_classifier._request_openai("{}", {}, 1) is None
    message = " ".join(record.getMessage() for record in caplog.records)
    assert "request_timeout provider=openai" in message
    assert "timeout_seconds=45" in message
