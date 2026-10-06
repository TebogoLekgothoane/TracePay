import io
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from categorisation import ai_classifier
from categorisation.merchant_memory import MerchantMemory
from categorisation.models import CategorisationResult
from categorisation.normalize import extract_merchant_name, normalize_for_matching
from categorisation.reprocess import classification_update_payload, reprocess_transactions
from categorisation.service import CategorisableTransaction, categorise_batch, categorise_batch_with_metrics


LIVE_CATEGORIES = [
    "Airtime & Data",
    "Bank Fees",
    "Cash Withdrawal",
    "Entertainment",
    "Fast Food",
    "Fuel",
    "Groceries",
    "Healthcare",
    "Other",
    "Other Income",
    "Public Transport",
    "Restaurants",
    "Ride Hailing",
    "Salary",
    "Savings",
    "Shopping",
    "Subscriptions",
    "Transfers",
    "Transport",
    "Utilities",
]


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
    assert result.classification_reason


def test_case_and_merchant_variations() -> None:
    assert classify_transaction("woolworths").category_name == "Groceries"
    assert classify_transaction("Woolworths Store 123").category_name == "Groceries"
    assert classify_transaction("WOOLWORTHS CAPE TOWN").category_name == "Groceries"


@pytest.mark.parametrize("description", [
    "NETFLIX",
    "Netflix",
    "NETFLIX.COM",
    "POS PURCHASE NETFLIX.COM 123456",
    "POS PURCHASE NETFLIX.COM 849293",
])
def test_netflix_merchant_variations(description: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name == "Subscriptions"
    assert result.transaction_class == "spending"
    assert extract_merchant_name(description)
    assert "NETFLIX" in normalize_for_matching(description)


def test_unknown_and_amount_independence() -> None:
    assert classify_transaction("RANDOM UNKNOWN MERCHANT").category_name is None
    assert classify_transaction("WOOLWORTHS", "debit").category_name == classify_transaction("WOOLWORTHS", "credit").category_name


def test_data_alone_is_not_airtime() -> None:
    assert classify_transaction("CUSTOMER DATA REPORT").category_name is None


def test_salary_advance_is_other_income() -> None:
    assert classify_transaction("SALARY ADVANCE", "credit").category_name == "Other Income"
    assert classify_transaction("SALARY ADVANCE", "debit").category_name is None


@pytest.mark.parametrize(("description", "transaction_class", "category"), [
    ("Pay Beneficiary, Mosto", "person_to_person", "Transfers"),
    ("Money transferred out from GoalSave", "internal_transfer", "Transfers"),
    ("Money added to Fixed Deposit 30710268044", "savings", "Savings"),
    ("SendMoney to Lebo", "person_to_person", "Transfers"),
    ("PayShap - Pay by ShapID, grocery", "person_to_person", "Transfers"),
    ("FNB SERVICE FEE", "bank_fee", "Bank Fees"),
])
def test_non_spending_transaction_classes(description: str, transaction_class: str, category: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == transaction_class
    assert result.category_name == category
    assert result.classification_confidence >= 0.85


def test_eft_and_generic_purchase_are_not_deterministic_categories() -> None:
    eft = classify_transaction("EFT for CAPITEC J MAPHOSA", "debit")
    purchase = classify_transaction("Purchase at BUCCANEERS", "debit")
    assert eft.transaction_class == "unknown"
    assert purchase.transaction_class == "unknown"


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


def test_blank_description_falls_back_to_other(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    caplog.set_level("INFO", logger="tracepay.categorisation")
    result = categorise_batch(
        [CategorisableTransaction("0", "-", Decimal("-10"), "debit")],
        LIVE_CATEGORIES,
    )["0"]
    assert result.category_name == "Other"
    assert result.transaction_class == "unknown"
    assert result.classification_reason
    assert "fallback" in (result.rule or "")
    message = " ".join(record.getMessage() for record in caplog.records)
    assert "uncategorised_transactions=0" in message


def test_every_transaction_receives_a_category(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    run = categorise_batch_with_metrics(
        [
            CategorisableTransaction("0", "WOOLWORTHS", Decimal("-20"), "debit"),
            CategorisableTransaction("1", "Pay Beneficiary, Mosto", Decimal("-12"), "debit"),
            CategorisableTransaction("2", "Completely unknown shop XYZ", Decimal("-9"), "debit"),
            CategorisableTransaction("3", "-", Decimal("-1"), "debit"),
        ],
        LIVE_CATEGORIES,
    )
    assert run.metrics.uncategorised_transactions == 0
    assert run.metrics.categorised_transactions == 4
    assert all(result.category_name for result in run.results.values())
    assert all(result.classification_reason for result in run.results.values())
    assert all(result.classification_confidence > 0 for result in run.results.values())


def test_merchant_memory_reuses_prior_classification() -> None:
    memory = MerchantMemory(
        {
            "NETFLIX": CategorisationResult(
                category_name="Subscriptions",
                category_confidence=0.99,
                transaction_class="spending",
                classification_confidence=0.99,
                classification_reason="Matched deterministic rule: merchant:subscriptions",
                merchant_name="Netflix",
                rule="merchant:subscriptions",
            )
        }
    )
    # Description that deterministic rules may not catch if mangled unusually, but memory key matches.
    result = categorise_batch(
        [CategorisableTransaction("0", "ONLINE NETFLIX BILLING DESK", Decimal("-99"), "debit")],
        LIVE_CATEGORIES,
        merchant_memory=memory,
    )["0"]
    # Either deterministic or memory — must be Subscriptions.
    assert result.category_name == "Subscriptions"


def test_merchant_memory_applies_when_rules_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    memory = MerchantMemory(
        {
            "BUCCANEERS": CategorisationResult(
                category_name="Restaurants",
                category_confidence=0.95,
                transaction_class="spending",
                classification_confidence=0.95,
                classification_reason="Matched known merchant: Buccaneers",
                merchant_name="Buccaneers",
                rule="ai:gemini",
            )
        }
    )
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    result = categorise_batch(
        [CategorisableTransaction("0", "Purchase at BUCCANEERS", Decimal("-80"), "debit")],
        LIVE_CATEGORIES,
        merchant_memory=memory,
    )["0"]
    assert result.category_name == "Restaurants"
    assert result.rule == "merchant_memory"


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
        LIVE_CATEGORIES,
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
            category_name="Transfers",
            category_confidence=0.81,
            transaction_class="person_to_person",
            classification_confidence=0.88,
            classification_reason="Payment to another person",
            rule="ai:openai",
        )}

    monkeypatch.setattr("categorisation.service.classify_batch", fake_classify_batch)
    # Use a description that is no longer deterministic so AI path is exercised.
    transactions = [
        CategorisableTransaction(str(index), "EFT to T LEKGOTHOANE", Decimal("-50"), "debit")
        for index in range(3)
    ]
    results = categorise_batch(transactions, LIVE_CATEGORIES)
    assert calls == 1
    assert all(result.transaction_class == "person_to_person" for result in results.values())
    assert all(result.category_name == "Transfers" for result in results.values())


def test_partial_ai_batch_maps_hits_and_fallbacks_misses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)

    def fake_classify_batch(items: list[object], _category_names: list[str]) -> dict[str, CategorisationResult]:
        # Only return a result for the first candidate; others must fall back.
        first = items[0]
        return {
            first.transaction_id: CategorisationResult(
                category_name="Shopping",
                category_confidence=0.84,
                transaction_class="spending",
                classification_confidence=0.84,
                classification_reason="Classified by AI based on transaction description",
                merchant_name="Example",
                rule="ai:gemini",
            )
        }

    monkeypatch.setattr("categorisation.service.classify_batch", fake_classify_batch)
    run = categorise_batch_with_metrics(
        [
            CategorisableTransaction("0", "Unknown shop alpha", Decimal("-10"), "debit"),
            CategorisableTransaction("1", "Unknown shop beta", Decimal("-11"), "debit"),
            CategorisableTransaction("2", "Unknown shop gamma", Decimal("-12"), "debit"),
        ],
        LIVE_CATEGORIES,
    )
    assert run.results["0"].category_name == "Shopping"
    assert run.results["1"].category_name == "Other"
    assert run.results["2"].category_name == "Other"
    assert run.metrics.fallback_classifications == 2
    assert run.metrics.uncategorised_transactions == 0


def test_ai_disabled_still_applies_fallback(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    monkeypatch.setattr("categorisation.service.settings.openai_api_key", "openai-test-key")
    monkeypatch.setattr("categorisation.service.settings.gemini_api_key", "gemini-test-key")

    def fail_if_called(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("AI provider should not be called when disabled")

    monkeypatch.setattr("categorisation.service.classify_batch", fail_if_called)
    caplog.set_level("INFO", logger="tracepay.categorisation")
    results = categorise_batch(
        [
            CategorisableTransaction("known", "WOOLWORTHS", Decimal("-20"), "debit"),
            CategorisableTransaction("unknown", "Unrecognised merchant", Decimal("-20"), "debit"),
        ],
        LIVE_CATEGORIES,
    )
    assert results["known"].category_name == "Groceries"
    assert results["unknown"].category_name == "Other"
    assert "skipped reason=disabled" in " ".join(record.getMessage() for record in caplog.records)


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
        LIVE_CATEGORIES,
    )
    assert calls == 1
    assert result["0"].rule == "ai:openai"


def test_openai_failure_returns_empty_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier.settings, "gemini_api_key", "")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: None)
    assert ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Purchase at Example", "-10", "debit")],
        ["Groceries"],
    ) == {}


def test_openai_success_returns_validated_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier.settings, "gemini_api_key", "")
    monkeypatch.setattr(ai_classifier, "_request_openai", lambda *_args: {
        "choices": [{"message": {"content": '{"transactions":[{"transaction_id":"0","transaction_class":"spending","classification_confidence":0.9,"category_name":"Groceries","category_confidence":0.8,"reason":"Merchant purchase","merchant_name":"Example"}]}'}}],
    })
    result = ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Purchase at Example", "-10", "debit")],
        ["Groceries"],
    )["0"]
    assert result.rule == "ai:openai"
    assert result.category_name == "Groceries"


def test_gemini_success_returns_validated_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "gemini_api_key", "gemini-test-key")
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "")
    monkeypatch.setattr(ai_classifier, "_request_gemini", lambda *_args: {
        "candidates": [{"content": {"parts": [{"text": '{"transactions":[{"transaction_id":"0","transaction_class":"spending","classification_confidence":0.91,"category_name":"Groceries","category_confidence":0.88,"reason":"Merchant purchase","merchant_name":"Example"}]}'}]}}],
    })
    result = ai_classifier.classify_batch(
        [ai_classifier.AiTransaction("0", "Purchase at Example", "-10", "debit")],
        ["Groceries"],
    )["0"]
    assert result.rule == "ai:gemini"
    assert result.category_name == "Groceries"


def test_malformed_openai_response_is_rejected_safely(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_classifier.settings, "openai_api_key", "openai-test-key")
    monkeypatch.setattr(ai_classifier.settings, "gemini_api_key", "")
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
    monkeypatch.setattr(ai_classifier.settings, "gemini_api_key", "")
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


def test_reprocessing_is_idempotent_and_does_not_duplicate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    items = [
        CategorisableTransaction("tx-1", "WOOLWORTHS", Decimal("-20"), "debit"),
        CategorisableTransaction("tx-2", "Unknown vendor", Decimal("-15"), "debit"),
    ]
    first = reprocess_transactions(items, LIVE_CATEGORIES)
    second = reprocess_transactions(items, LIVE_CATEGORIES)
    assert set(first.results) == {"tx-1", "tx-2"}
    assert set(second.results) == {"tx-1", "tx-2"}
    assert first.results["tx-1"].category_name == second.results["tx-1"].category_name
    payload = classification_update_payload(first.results)
    assert len(payload) == 2
    assert {row["id"] for row in payload} == {"tx-1", "tx-2"}
    assert all(row["category_name"] for row in payload)


def test_pipeline_metrics_cover_mixed_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", True)

    def fake_classify_batch(items: list[object], _category_names: list[str]) -> dict[str, CategorisationResult]:
        return {
            items[0].transaction_id: CategorisationResult(
                category_name="Shopping",
                category_confidence=0.82,
                transaction_class="spending",
                classification_confidence=0.82,
                classification_reason="Classified by AI based on transaction description",
                rule="ai:gemini",
                merchant_name="MysteryMart",
            )
        }

    monkeypatch.setattr("categorisation.service.classify_batch", fake_classify_batch)
    memory = MerchantMemory(
        {
            "BUCCANEERS": CategorisationResult(
                category_name="Restaurants",
                category_confidence=0.95,
                transaction_class="spending",
                classification_confidence=0.95,
                classification_reason="Matched known merchant: Buccaneers",
                merchant_name="Buccaneers",
                rule="ai:gemini",
            )
        }
    )
    run = categorise_batch_with_metrics(
        [
            CategorisableTransaction("d1", "WOOLWORTHS", Decimal("-20"), "debit"),
            CategorisableTransaction("m1", "Purchase at BUCCANEERS", Decimal("-40"), "debit"),
            CategorisableTransaction("a1", "MysteryMart online", Decimal("-30"), "debit"),
            CategorisableTransaction("f1", "Totally obscure xyz", Decimal("-5"), "debit"),
        ],
        LIVE_CATEGORIES,
        merchant_memory=memory,
    )
    assert run.metrics.total_transactions == 4
    assert run.metrics.deterministic_matches >= 1
    assert run.metrics.merchant_memory_matches >= 1
    assert run.metrics.fallback_classifications >= 1
    assert run.metrics.categorised_transactions == 4
    assert run.metrics.uncategorised_transactions == 0
    assert run.results["d1"].category_name == "Groceries"
    assert run.results["m1"].category_name == "Restaurants"
    assert run.results["a1"].category_name == "Shopping"
    assert run.results["f1"].category_name == "Other"


@pytest.mark.parametrize(("description", "category", "transaction_class"), [
    ("SMS Notification Fee: 1 notification(s)", "Bank Fees", "bank_fee"),
    ("Monthly Account Admin Fee", "Bank Fees", "bank_fee"),
    ("Card Purchase Insufficient Funds Fee: Uber Johannesburg Za", "Bank Fees", "bank_fee"),
    ("Banking App External PayShap Payment: Tebogo", "Transfers", "person_to_person"),
    ("Banking App Immediate Payment: Neo Capitec", "Transfers", "person_to_person"),
    ("Live Better Round-up Transfer", "Transfers", "internal_transfer"),
    ("Banking App Transfer Received from Tebogo Savings: Transfer", "Transfers", "internal_transfer"),
    ("Banking App Prepaid Purchase: MTN", "Airtime & Data", "spending"),
    ("Online Purchase: Uber Eats Johannesburg (Card 7571)", "Fast Food", "spending"),
])
def test_capitec_live_failure_patterns(
    description: str,
    category: str,
    transaction_class: str,
) -> None:
    result = classify_transaction(description, "debit")
    assert result.category_name == category
    assert result.transaction_class == transaction_class


def test_weak_statement_category_does_not_override_deterministic_fee() -> None:
    run = categorise_batch_with_metrics(
        [
            CategorisableTransaction(
                "0",
                "SMS Notification Fee: 3 notification(s)",
                Decimal("-1.50"),
                "debit",
                statement_category="Fees",
                bank="Capitec",
            )
        ],
        LIVE_CATEGORIES,
    )
    result = run.results["0"]
    assert result.category_name == "Bank Fees"
    assert result.transaction_class == "bank_fee"
    assert result.rule == "description:service-fee"
    assert run.metrics.deterministic_matches == 1
    assert run.metrics.statement_matches == 0


def test_mapped_statement_category_used_when_rules_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    run = categorise_batch_with_metrics(
        [
            CategorisableTransaction(
                "0",
                "Some local cinema purchase",
                Decimal("-80"),
                "debit",
                statement_category="Movies",
                bank="Capitec",
            )
        ],
        LIVE_CATEGORIES,
    )
    result = run.results["0"]
    assert result.category_name == "Entertainment"
    assert result.rule == "statement:category"
    assert result.classification_confidence <= 0.90


def test_generic_statement_other_does_not_win(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    result = categorise_batch(
        [
            CategorisableTransaction(
                "0",
                "Completely unknown vendor ZZ9",
                Decimal("-12"),
                "debit",
                statement_category="Other",
                bank="Capitec",
            )
        ],
        LIVE_CATEGORIES,
    )["0"]
    assert result.category_name == "Other"
    assert result.rule == "fallback:other"
    assert result.classification_confidence <= 0.40


def test_fallback_other_has_low_confidence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    result = categorise_batch(
        [CategorisableTransaction("0", "Obscure merchant 999", Decimal("-9"), "debit")],
        LIVE_CATEGORIES,
    )["0"]
    assert result.category_name == "Other"
    assert result.classification_confidence <= 0.40
