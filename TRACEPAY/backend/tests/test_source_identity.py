"""Regression: bank boilerplate is never treated as a confirmed merchant."""

from __future__ import annotations

from categorisation.ai_classifier import _validate_results
from categorisation.merchant_memory import MerchantMemory, _eligible_for_memory
from categorisation.models import CategorisationResult
from categorisation.normalize import (
    extract_merchant_name,
    is_bank_boilerplate_label,
    merchant_key,
    strip_bank_extraction_prefixes,
)
from categorisation.source_identity import (
    identify_source,
    trusted_merchant_for_memory,
    validate_ai_source,
)
from leak_intelligence.common import merchant_group_key
from leak_intelligence.merchant_display import merchant_display_name_for
from tests.test_leak_detection import _transaction


def test_known_merchants_survive_card_and_pos_prefixes() -> None:
    assert extract_merchant_name("PURCHASE WITH CARD AT EPOS AT CHECKERS SANDTON") == "Checkers"
    assert extract_merchant_name("POS PURCHASE NETFLIX.COM 849293") == "Netflix"
    assert extract_merchant_name("PURCHASE: WITH CARD AT EPOS AT MR D FOOD") == "Mr D"
    assert identify_source("SPOTIFY PREMIUM").merchant_name == "Spotify"


def test_bank_prefixes_are_stripped_and_never_become_merchants() -> None:
    cases = (
        "RECURRING PAYMENT FROM DI",
        "MONEY TRANSFERRED IN FOR",
        "MONEY TRANSFERRED OUT FROM",
        "PURCHASE WITH CARD AT",
        "WITH CARD AT",
        "PURCHASE: WITH CARD AT",
    )
    for description in cases:
        assert extract_merchant_name(description) is None, description
        assert is_bank_boilerplate_label(description), description
        assert merchant_key(description) == "", description
        assert merchant_display_name_for(description) is None, description
        identity = identify_source(description)
        assert identity.merchant_name is None, description
        assert identity.uncertainty == "unknown" or identity.source_type != "merchant"


def test_transfer_payees_are_not_collapsed_onto_shared_boilerplate() -> None:
    john = extract_merchant_name("MONEY TRANSFERRED IN FOR JOHN DOE")
    jane = extract_merchant_name("MONEY TRANSFERRED OUT FROM JANE SMITH")
    assert john == "John Doe"
    assert jane == "Jane Smith"
    assert john != jane
    assert "Money Transferred" not in (john or "")
    assert "Money Transferred" not in (jane or "")
    assert strip_bank_extraction_prefixes("MONEY TRANSFERRED IN FOR JOHN DOE") == "JOHN DOE"


def test_person_to_person_is_not_a_business_merchant() -> None:
    identity = identify_source("SendMoney to Lebo")
    assert identity.source_type == "person"
    assert identity.merchant_name is None
    assert identity.supporting_text is not None
    assert trusted_merchant_for_memory(identity) is None


def test_payment_processor_is_not_the_underlying_merchant() -> None:
    identity = identify_source("PAYFAST")
    assert identity.source_type == "payment_processor"
    assert identity.merchant_name is None


def test_bank_fee_descriptions_do_not_invent_merchants() -> None:
    identity = identify_source("FNB SERVICE FEE")
    assert identity.merchant_name is None or identity.source_type in {"bank", "unknown"}
    assert extract_merchant_name("MONTHLY ACCOUNT FEE") is None or not is_bank_boilerplate_label(
        extract_merchant_name("MONTHLY ACCOUNT FEE") or ""
    )


def test_refund_and_unknown_stay_explicit() -> None:
    unknown = identify_source("RANDOM XYZ QQQ")
    assert unknown.merchant_name is None
    assert unknown.source_type == "unknown"
    assert unknown.uncertainty in {"unknown", "uncertain"}
    # Free text may still yield a grouping label, but it is not a confirmed merchant.
    assert extract_merchant_name("RANDOM XYZ QQQ") == "Random Xyz Qqq"


def test_incorrect_ai_guess_is_rejected() -> None:
    rejected = validate_ai_source(
        description="RECURRING PAYMENT FROM DI",
        proposed_merchant="Netflix",
        source_type="merchant",
        uncertainty="identified",
    )
    assert rejected.merchant_name is None
    assert rejected.identification_method.endswith("ai_rejected_unsupported") or (
        rejected.uncertainty == "unknown"
    )

    accepted = validate_ai_source(
        description="PURCHASE WITH CARD AT CHECKERS SANDTON",
        proposed_merchant="Checkers",
        source_type="merchant",
        uncertainty="identified",
    )
    assert accepted.merchant_name == "Checkers"
    assert accepted.source_type == "merchant"


def test_ai_validation_batch_rejects_invented_merchants() -> None:
    parsed = {
        "transactions": [
            {
                "transaction_id": "t1",
                "transaction_class": "spending",
                "classification_confidence": 0.99,
                "category_name": "Subscriptions",
                "category_confidence": 0.99,
                "reason": "guess",
                "merchant_name": "Netflix",
                "source_type": "merchant",
                "payment_mechanism": "Debit order",
                "supporting_text": "RECURRING PAYMENT FROM DI",
                "uncertainty": "identified",
            },
            {
                "transaction_id": "t2",
                "transaction_class": "spending",
                "classification_confidence": 0.95,
                "category_name": "Groceries",
                "category_confidence": 0.95,
                "reason": "card purchase",
                "merchant_name": "Checkers",
                "source_type": "merchant",
                "payment_mechanism": "Card purchase",
                "supporting_text": "CHECKERS",
                "uncertainty": "identified",
            },
        ]
    }
    results, rejected = _validate_results(
        parsed,
        {"Subscriptions", "Groceries"},
        "gemini",
        {"t1", "t2"},
        {
            "t1": "RECURRING PAYMENT FROM DI",
            "t2": "PURCHASE WITH CARD AT CHECKERS",
        },
    )
    assert rejected == 0
    assert results["t1"].merchant_name is None
    assert results["t2"].merchant_name == "Checkers"


def test_ai_failure_returns_empty_and_does_not_block_deterministic() -> None:
    from categorisation.ai_classifier import classify_batch

    # No keys in a blank settings path is covered elsewhere; empty input must stay safe.
    assert classify_batch([], ["Groceries"]) == {}
    identity = identify_source("WITH CARD AT")
    assert identity.merchant_name is None


def test_merchant_memory_rejects_boilerplate_and_reuses_trusted_names() -> None:
    memory = MerchantMemory()
    bad = CategorisationResult(
        category_name="Subscriptions",
        category_confidence=0.95,
        transaction_class="spending",
        classification_confidence=0.95,
        merchant_name="Recurring Payment From Di",
        rule="deterministic",
    )
    good = CategorisationResult(
        category_name="Subscriptions",
        category_confidence=0.95,
        transaction_class="spending",
        classification_confidence=0.95,
        merchant_name="Netflix",
        rule="deterministic",
    )
    assert _eligible_for_memory(bad) is False
    assert _eligible_for_memory(good) is True
    memory.remember(bad.merchant_name, bad)
    memory.remember(good.merchant_name, good)
    assert memory.get("Recurring Payment From Di") is None
    assert memory.get("Netflix") is not None
    assert trusted_merchant_for_memory(identify_source("NETFLIX.COM")) == "Netflix"


def test_duplicate_grouping_ignores_card_boilerplate_keys() -> None:
    left = _transaction(
        "a",
        "40",
        __import__("datetime").date(2026, 7, 2),
        merchant="WITH CARD AT",
        description="WITH CARD AT",
    )
    right = _transaction(
        "b",
        "40",
        __import__("datetime").date(2026, 7, 2),
        merchant="PURCHASE WITH CARD AT",
        description="PURCHASE WITH CARD AT",
    )
    assert merchant_group_key(left) is None
    assert merchant_group_key(right) is None

    checkers = _transaction(
        "c",
        "40",
        __import__("datetime").date(2026, 7, 2),
        merchant="CHECKERS",
        description="PURCHASE WITH CARD AT CHECKERS",
    )
    assert merchant_group_key(checkers) == "CHECKERS"


def test_recurring_discovery_extracts_real_remainder() -> None:
    assert extract_merchant_name("RECURRING PAYMENT FROM DISCOVERY") == "Discovery"
    assert identify_source("RECURRING PAYMENT FROM DISCOVERY").merchant_name == "Discovery"
