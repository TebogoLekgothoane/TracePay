"""Price-rise impact, parallel mandates, evidence status and interest reporting."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import (
    _mandate_tokens,
    _parallel_mandate_amounts,
    build_financial_features,
)
from leak_intelligence.evidence_status import evidence_status_for
from tests.test_leak_detection import _detect, _transaction


def _leak(transactions, leak_type):
    return next(item for item in _detect(transactions).leaks if item.leak_type == leak_type)


def _subscription(amounts, merchant="NETFLIX"):
    return [
        _transaction(f"s{index}", amount, date(2026, index + 1, 5), merchant=merchant, category="Subscriptions")
        for index, amount in enumerate(amounts)
    ]


def _policies(months=(6, 7, 8, 9), policies=(("111", "450"), ("222", "380"))):
    return [
        _transaction(
            f"{ref}-{month}",
            amount,
            date(2026, month, 1),
            merchant="DISCOVERY INSURE",
            category="Insurance",
            description=f"DEBIT ORDER DISCOVERY INSURE POLICY {ref}",
        )
        for month in months
        for ref, amount in policies
    ]


# P1: price-rise impact is reported on its own, from the observed payments.
def test_price_creep_reports_the_increase_separately_from_the_whole_cost() -> None:
    leak = _leak(_subscription(["199", "199", "199", "249", "249", "299"]), "subscription_leak")
    evidence = leak.evidence
    assert evidence["original_recurring_amount"] == Decimal("199")
    assert evidence["current_recurring_amount"] == Decimal("299")
    assert evidence["price_increase_monthly"] == Decimal("100.00")
    assert evidence["price_increase_percentage"] == Decimal("50.25")
    assert evidence["price_increase_annual_estimate"] == Decimal("1200.00")
    assert evidence["price_increase_first_observed"] == date(2026, 4, 5)
    # Actual: 249 + 249 + 299 paid against 199 each.
    assert evidence["additional_paid_to_date"] == Decimal("200")
    assert evidence["impact_components_additive"] is False
    # The impact is the rise, not the whole subscription.
    assert leak.estimated_monthly_impact == Decimal("100.00")
    assert leak.estimated_annual_impact == Decimal("1200.00")
    assert leak.evidence["service_cost_monthly"] == Decimal("299.00")
    assert leak.evidence["headline_impact_basis"] == "price_increase"


def test_flat_subscription_has_no_price_rise_figures() -> None:
    leak = _leak(_subscription(["199"] * 4), "subscription_leak")
    assert "price_increase_monthly" not in leak.evidence
    assert leak.estimated_monthly_impact == Decimal("199.00")
    assert leak.evidence["headline_impact_basis"] == "recurring_cost"


def test_a_rise_below_the_materiality_floor_keeps_the_service_cost_headline() -> None:
    leak = _leak(_subscription(["199", "199", "199", "205", "205", "205"]), "subscription_leak")
    assert leak.evidence["headline_impact_basis"] == "recurring_cost"


def test_single_early_step_is_flagged_as_a_possible_introductory_price() -> None:
    def trend(amounts):
        snapshot = build_financial_features("user-a", _subscription(amounts, "SHOWMAX"))
        return snapshot.merchants[0].merchant_amount_trend

    assert trend(["29", "99", "99", "99"]).promotional_start_possible is True
    assert trend(["199", "199", "199", "249", "249", "299"]).promotional_start_possible is False
    assert trend(["99", "99", "99", "149"]).promotional_start_possible is False


# P2: separate mandates at one merchant are separate commitments.
def test_mandate_reference_is_read_after_the_full_keyword() -> None:
    assert _mandate_tokens("DEBIT ORDER DISCOVERY POLICY 111") == {"111"}
    assert _mandate_tokens("PMT ACCOUNT 5521") == {"5521"}


def test_parallel_policies_are_a_commitment_not_a_leak() -> None:
    transactions = _policies()
    leaks = _detect(transactions).leaks
    assert [item for item in leaks if item.evidence.get("finding_focus") == "debit_order_review"] == []
    snapshot = build_financial_features("user-a", transactions)
    observation = next(
        item
        for item in analyze_behaviour(snapshot).observations
        if item.behavior_type == "recurring_payment_pattern"
    )
    assert observation.evidence["parallel_mandate_count"] == 2
    assert observation.evidence["parallel_mandate_amounts"] == [Decimal("380"), Decimal("450")]
    assert observation.evidence["combined_monthly_commitment"] == Decimal("830")


def test_one_policy_still_gets_a_debit_order_review() -> None:
    leak = _leak(_policies(policies=(("111", "450"),)), "recurring_payment_leak")
    assert leak.estimated_monthly_impact == Decimal("450.00")


def test_a_reference_that_changes_every_payment_is_not_parallel_mandates() -> None:
    rotating = [
        _transaction(
            f"r{month}",
            "450",
            date(2026, month, 1),
            merchant="DISCOVERY INSURE",
            category="Insurance",
            description=f"DEBIT ORDER DISCOVERY INSURE POLICY {1000 + month}",
        )
        for month in (6, 7, 8, 9)
    ]
    assert _parallel_mandate_amounts(rotating, "DISCOVERY INSURE") == []


def test_one_policy_is_not_parallel_mandates() -> None:
    single = _policies(policies=(("111", "450"),))
    assert _parallel_mandate_amounts(single, "DISCOVERY INSURE") == []


# P3: evidence status comes from fixed rules over the finding's evidence.
@pytest.mark.parametrize(
    ("leak_type", "evidence", "confidence", "expected"),
    [
        ("bank_fee_leak", {"finding_focus": "immediate_payment_fee"}, 0.8, "confirmed"),
        ("bank_fee_leak", {}, 0.8, "likely"),
        ("subscription_leak", {"observation_count": 4}, 0.78, "likely"),
        ("subscription_leak", {"observation_count": 2}, 0.78, "possible"),
        ("subscription_leak", {"observation_count": 6}, 0.55, "possible"),
        ("recurring_payment_leak", {"observation_count": 5, "parallel_mandate_count": 2}, 0.9, "possible"),
        (
            "recurring_payment_leak",
            {"observation_count": 5, "finding_focus": "repeated_payments_detected"},
            0.9,
            "possible",
        ),
        ("duplicate_payment_leak", {"finding_kind": "verification_required"}, 0.7, "possible"),
        ("coffee_spending_leak", {"finding_kind": "spending_pattern"}, 0.8, "possible"),
        ("irregular_transaction_leak", {}, 0.8, "possible"),
    ],
)
def test_evidence_status_rules(leak_type, evidence, confidence, expected) -> None:
    status, reason = evidence_status_for(leak_type, evidence, confidence)
    assert status == expected
    assert reason


def test_every_detected_finding_carries_a_status_and_reason() -> None:
    results = [
        *_detect(_subscription(["199", "199", "199", "249"])).leaks,
        *_detect(_policies(policies=(("111", "450"),))).leaks,
    ]
    assert results
    for leak in results:
        assert leak.evidence["evidence_status"] in {"confirmed", "likely", "possible"}
        assert leak.evidence["evidence_status_reason"]


# P4: credit-card interest is recognised and reported as what was paid.
def test_credit_card_interest_is_classified_as_a_bank_fee() -> None:
    result = classify_transaction("CREDIT CARD INTEREST", "debit")
    assert result.transaction_class == "bank_fee"


def _fee_rows(description, amount, per_month=1):
    return [
        _transaction(
            f"f{month}-{index}-{description[:3]}",
            amount,
            date(2026, month, 2 + index if per_month > 1 else 28),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description=description,
        )
        for month in (6, 7, 8, 9)
        for index in range(per_month)
    ] + [_transaction("later", "50", date(2026, 10, 3), merchant="CHECKERS", category="Groceries")]


def test_interest_is_reported_as_paid_not_projected() -> None:
    leak = _leak(_fee_rows("CREDIT CARD INTEREST", "212"), "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "interest_charges"
    assert leak.evidence["impact_basis"] == "observed_history"
    assert leak.evidence["observed_total_paid"] == Decimal("848")
    assert leak.estimated_annual_impact is None
    assert leak.evidence["evidence_status"] == "confirmed"


def test_non_borrowing_fee_keeps_its_annual_estimate() -> None:
    leak = _leak(_fee_rows("IMMEDIATE PAYMENT FEE", "10", per_month=6), "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "immediate_payment_fee"
    assert leak.estimated_annual_impact == Decimal("720")


def _mixed_fee_rows(*kinds):
    rows = []
    for month in (6, 7, 8, 9):
        for index, (description, amount) in enumerate(kinds):
            rows.append(
                _transaction(
                    f"m{month}-{index}",
                    amount,
                    date(2026, month, 1 + index * 9),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description=description,
                )
            )
    rows.append(_transaction("later", "50", date(2026, 10, 3), merchant="CHECKERS", category="Groceries"))
    return rows


def test_interest_impact_is_the_interest_itself_not_every_fee_on_the_account() -> None:
    leak = _leak(
        _mixed_fee_rows(("MONTHLY ACCOUNT FEE", "69"), ("INTEREST CHARGED", "30")), "bank_fee_leak"
    )
    assert leak.evidence["finding_focus"] == "interest_charges"
    assert leak.estimated_monthly_impact == Decimal("30.00")
    assert leak.estimated_annual_impact is None


@pytest.mark.parametrize(
    "borrowing",
    [("INTEREST CHARGED", "150"), ("OVERDRAFT FEE", "150"), ("INSUFFICIENT FUNDS FEE", "150")],
)
def test_borrowing_costs_never_receive_an_annualised_figure(borrowing) -> None:
    leaks = [
        item
        for item in _detect(_mixed_fee_rows(("MONTHLY ACCOUNT FEE", "69"), borrowing)).leaks
        if item.leak_type == "bank_fee_leak"
    ]
    assert leaks
    for leak in leaks:
        if leak.evidence.get("impact_basis") == "observed_history":
            assert leak.estimated_annual_impact is None


def test_borrowing_costs_are_left_out_of_a_generic_fee_projection() -> None:
    leak = _leak(
        _mixed_fee_rows(
            ("MONTHLY ACCOUNT FEE", "69"), ("INTEREST CHARGED", "150"), ("OVERDRAFT FEE", "35")
        ),
        "bank_fee_leak",
    )
    assert leak.evidence.get("finding_focus") is None
    assert leak.evidence["borrowing_costs_excluded_from_annual_estimate"] is True
    assert leak.evidence["borrowing_cost_total_paid"] == Decimal("740")
    # Only the recurring account fee is projected: 69 * 12.
    assert leak.estimated_annual_impact == Decimal("828")


# P3: incorrect and insufficient evidence must not read as stronger than it is.
def test_two_subscription_payments_are_never_likely() -> None:
    leaks = _detect(_subscription(["199", "199"])).leaks
    for leak in leaks:
        assert leak.evidence["evidence_status"] != "confirmed"
        if leak.evidence.get("observation_count", 0) < 3:
            assert leak.evidence["evidence_status"] == "possible"


def test_low_confidence_classification_cannot_produce_a_confirmed_finding() -> None:
    rows = [
        _transaction(
            f"f{month}", "30", date(2026, month, 28), merchant=None, category="Bank Fees",
            transaction_class="bank_fee", description="INTEREST CHARGED", confidence=0.4,
        )
        for month in (6, 7, 8, 9)
    ]
    for leak in _detect(rows).leaks:
        assert leak.evidence["evidence_status"] != "confirmed" or leak.evidence.get("finding_focus")


def test_a_finding_built_from_a_single_window_is_only_possible() -> None:
    pair = [
        _transaction("a", "349", date(2026, 7, 18), merchant="TAKEALOT", category="Shopping"),
        _transaction("b", "349", date(2026, 7, 18), merchant="TAKEALOT", category="Shopping"),
        _transaction("later", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    for leak in _detect(pair).leaks:
        assert leak.evidence["evidence_status"] == "possible"


def test_unknown_leak_types_default_to_possible() -> None:
    status, _reason = evidence_status_for("weekend_spending_leak", {}, 0.95)
    assert status == "possible"
