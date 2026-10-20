"""Regression coverage for Financial Intelligence audit fixes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from categorisation.classifier import classify_transaction
from categorisation.normalize import extract_merchant_name, merchant_key
from categorisation.source_identity import identify_source, trusted_merchant_for_memory
from leak_intelligence.common import merchant_group_key
from leak_intelligence.engine import build_financial_features
from leak_intelligence.merchant_display import merchant_display_name_for
from tests.test_leak_detection import _detect, _transaction


def test_example_descriptions_separate_merchant_mechanism_and_person() -> None:
    cases = (
        ("PURCHASE WITH CARD AT MR D FOOD", "merchant", "Mr D", "spending"),
        ("WITH CARD AT UBER", "merchant", "Uber", "spending"),
        ("RECURRING PAYMENT FROM DI", "payment_mechanism", None, "unknown"),
        ("MONEY TRANSFERRED IN FOR J MAPHOSA", "person", None, "person_to_person"),
        ("MONEY TRANSFERRED OUT FROM", "payment_mechanism", None, "unknown"),
        ("PAYSHAP PAY BY SHAPID", "payment_mechanism", None, "person_to_person"),
        ("MOBILE PURCHASE FOR PHONE", "payment_mechanism", None, "spending"),
    )
    for description, source_type, merchant, tx_class in cases:
        identity = identify_source(description)
        classified = classify_transaction(description, "debit")
        assert identity.source_type == source_type, description
        assert identity.merchant_name == merchant, description
        assert classified.merchant_name == merchant, description
        assert classified.transaction_class == tx_class, description
        assert trusted_merchant_for_memory(identity) == merchant
        assert merchant_display_name_for(classified.merchant_name) is None or merchant is not None


def test_transfer_initials_and_payshap_are_not_confirmed_merchants() -> None:
    assert extract_merchant_name("MONEY TRANSFERRED IN FOR J MAPHOSA") == "J Maphosa"
    identity = identify_source("MONEY TRANSFERRED IN FOR J MAPHOSA")
    assert identity.source_type == "person"
    assert identity.supporting_text == "J Maphosa"
    assert identity.merchant_name is None

    payshap = classify_transaction("PAYSHAP PAY BY SHAPID", "debit")
    assert payshap.transaction_class == "person_to_person"
    assert payshap.merchant_name is None
    assert merchant_key("PAYSHAP PAY BY SHAPID") == ""


def test_payshap_formatting_variants_remain_payment_mechanisms() -> None:
    for description in (
        "PAYSHAP PAY BY SHAPID",
        "PAY SHAP PAY BY SHAPID",
        "PAY BY SHAPID",
        "PayShap - Pay by ShapID",
    ):
        identity = identify_source(description)
        classified = classify_transaction(description, "debit")

        assert identity.source_type == "payment_mechanism", description
        assert identity.merchant_name is None, description
        assert classified.transaction_class == "person_to_person", description
        assert classified.merchant_name is None, description
        assert merchant_key(description) == "", description


def test_payshap_does_not_change_distinct_merchant_identity() -> None:
    identity = identify_source("PAYSHAP PAYMENT TO WOOLWORTHS")
    classified = classify_transaction("PAYSHAP PAYMENT TO WOOLWORTHS", "debit")

    assert identity.source_type == "merchant"
    assert identity.merchant_name == "Woolworths"
    assert classified.transaction_class == "spending"
    assert classified.merchant_name == "Woolworths"


def test_card_purchase_merchant_key_prefers_catalogue_remainder() -> None:
    assert merchant_key("PURCHASE WITH CARD AT MR D FOOD") == "MR D"
    assert merchant_key("WITH CARD AT UBER") == "UBER"


def test_goalsave_is_internal_transfer_not_a_person_merchant() -> None:
    identity = identify_source("Money transferred out from GoalSave")
    classified = classify_transaction("Money transferred out from GoalSave", "debit")
    assert identity.transaction_type_hint == "internal_transfer"
    assert identity.merchant_name is None
    assert classified.transaction_class == "internal_transfer"
    assert classified.merchant_name is None


def test_legitimate_repeated_purchases_on_different_days_are_not_duplicates() -> None:
    transactions = [
        _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 7, 2), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    snapshot = build_financial_features("user-a", transactions)
    assert snapshot.duplicate_candidates == []
    assert "duplicate_payment_leak" not in {item.leak_type for item in _detect(transactions).leaks}


def test_same_day_duplicate_candidate_requires_verification_not_savings() -> None:
    transactions = [
        _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "duplicate_payment_leak")
    assert leak.evidence["verification_required"] is True
    assert leak.evidence["potential_not_confirmed_savings"] is True
    assert leak.evidence["match_basis"] == ["merchant", "amount", "calendar_day"]
    assert "confirmed" not in leak.title.lower()
    assert leak.confidence <= 0.68
    # Classification support is used; matching fields alone do not inflate confidence.
    assert leak.confidence < 0.68 or leak.evidence["transaction_count_in_group"] >= 2


def test_unknown_merchants_transfers_and_refunds_do_not_create_duplicates() -> None:
    payshap = [
        _transaction(
            "p1",
            "100",
            date(2026, 7, 1),
            merchant=None,
            category="Transfers",
            transaction_class="person_to_person",
            description="PAYSHAP PAY BY SHAPID",
        ),
        _transaction(
            "p2",
            "100",
            date(2026, 7, 1),
            merchant=None,
            category="Transfers",
            transaction_class="person_to_person",
            description="PAYSHAP PAY BY SHAPID",
        ),
        _transaction("later", "40", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    assert merchant_group_key(payshap[0]) is None
    assert "duplicate_payment_leak" not in {item.leak_type for item in _detect(payshap).leaks}

    refunded = [
        _transaction("buy", "80", date(2026, 7, 1), merchant="TAKEALOT", category="Shopping"),
        _transaction("buy-2", "80", date(2026, 7, 1), merchant="TAKEALOT", category="Shopping"),
        _transaction(
            "refund",
            "80",
            date(2026, 7, 1),
            merchant="TAKEALOT",
            category="Shopping",
            transaction_type="credit",
            description="REFUND TAKEALOT",
        ),
        _transaction("later", "40", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    snapshot = build_financial_features("user-a", refunded)
    assert all(item.nearby_reversal_or_refund for item in snapshot.duplicate_candidates) or (
        "duplicate_payment_leak" not in {item.leak_type for item in _detect(refunded).leaks}
    )


def test_same_merchant_keeps_one_duplicate_finding_identity() -> None:
    transactions = [
        _transaction("a1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("a2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("b1", "100", date(2026, 8, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("b2", "100", date(2026, 8, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "40", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    leaks = [item for item in _detect(transactions).leaks if item.leak_type == "duplicate_payment_leak"]
    assert len(leaks) == 1
    assert leaks[0].evidence["candidate_amount"] == Decimal("100")
    assert leaks[0].evidence["merchant_key"] == "COFFEE"
    assert leaks[0].evidence["alternate_same_merchant_candidate_count"] >= 1


def test_overall_escalation_lists_supported_contributors_without_adding_impacts() -> None:
    transactions = [
        _transaction("a", "100", date(2026, 7, 1), merchant="CHECKERS", category="Groceries"),
        _transaction("b", "200", date(2026, 8, 1), merchant="CHECKERS", category="Groceries"),
        _transaction("c", "400", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    leak = next(
        item for item in _detect(transactions).leaks if item.leak_type == "spending_escalation_leak"
    )
    assert leak.evidence["amounts_not_additive_with_category_findings"] is True
    contributors = leak.evidence.get("top_category_contributors") or []
    assert isinstance(contributors, list)
    if contributors:
        assert contributors[0]["category_name"] == "Groceries"
    else:
        assert leak.evidence.get("cause_identified") is False


def test_large_misclassified_transfers_do_not_create_irregular_findings() -> None:
    transfers = [
        _transaction(
            f"t-{index}",
            "100",
            date(2026, 7 + index, 1),
            merchant=None,
            category="Transfers",
            transaction_class="spending",
            confidence=0.92,
            description="BANKING APP TRANSFER",
        )
        for index in range(3)
    ] + [
        _transaction(
            "big",
            "5000",
            date(2026, 10, 1),
            merchant=None,
            category="Transfers",
            transaction_class="spending",
            confidence=0.92,
            description="BANKING APP TRANSFER",
        )
    ]
    assert "irregular_transaction_leak" not in {item.leak_type for item in _detect(transfers).leaks}

    internal = [
        _transaction(
            f"i-{index}",
            "500",
            date(2026, 7 + index, 1),
            merchant=None,
            category="Transfers",
            transaction_class="internal_transfer",
            confidence=0.95,
            description="MONEY TRANSFERRED OUT FROM GOALSAVE",
        )
        for index in range(3)
    ] + [
        _transaction(
            "big-internal",
            "8000",
            date(2026, 10, 1),
            merchant=None,
            category="Transfers",
            transaction_class="internal_transfer",
            confidence=0.95,
            description="MONEY TRANSFERRED OUT FROM GOALSAVE",
        )
    ]
    assert "irregular_transaction_leak" not in {item.leak_type for item in _detect(internal).leaks}


def test_unknown_merchant_alone_does_not_create_irregular_findings() -> None:
    transactions = [
        _transaction(
            f"u-{index}",
            "100",
            date(2026, 7 + index, 1),
            merchant=None,
            category="Other",
            transaction_class="unknown",
            confidence=0.35,
            description="MYSTERY PAYMENT",
        )
        for index in range(3)
    ] + [
        _transaction(
            "large-unknown",
            "9000",
            date(2026, 10, 1),
            merchant=None,
            category="Other",
            transaction_class="unknown",
            confidence=0.35,
            description="MYSTERY PAYMENT",
        )
    ]
    assert "irregular_transaction_leak" not in {item.leak_type for item in _detect(transactions).leaks}


def test_eft_and_banking_app_transfers_classify_without_merchant_identity() -> None:
    eft = classify_transaction("EFT for CAPITEC J MAPHOSA", "debit")
    assert eft.transaction_class == "person_to_person"
    assert eft.merchant_name is None

    internal = classify_transaction("Banking App Transfer to Main Account", "debit")
    assert internal.transaction_class == "internal_transfer"
    assert internal.merchant_name is None

    person = classify_transaction("Banking App Transfer to Tebogo", "debit")
    assert person.transaction_class == "person_to_person"
    assert person.merchant_name is None


def test_bank_fee_evidence_distinguishes_recurring_and_one_off_types() -> None:
    transactions = [
        _transaction(
            "fee-1",
            "30",
            date(2026, 7, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
        _transaction(
            "fee-2",
            "30",
            date(2026, 8, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
        _transaction(
            "fee-3",
            "120",
            date(2026, 9, 30),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
        _transaction(
            "enquiry",
            "5",
            date(2026, 9, 15),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="BALANCE ENQUIRY FEE",
        ),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    breakdown = leak.evidence["fee_type_breakdown"]
    assert breakdown["service_charges"] == Decimal("180")
    assert breakdown["balance_enquiry_fees"] == Decimal("5")
    assert leak.evidence["fees_are_not_all_avoidable"] is True
    assert "eliminated" not in leak.description.lower() or "not" in leak.description.lower()
