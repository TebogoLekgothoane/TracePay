"""Regression tests for leak detection precision and presentation quality."""

from datetime import date
from decimal import Decimal

from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import DETECTOR_VERSION, detect_leaks
from leak_intelligence.leak_keys import leak_fingerprint, subject_key
from leak_intelligence.leak_report import render_leak_report
from leak_intelligence.leak_scoring import leak_confidence
from leak_intelligence.merchant_display import (
    is_reliable_merchant_display_name,
    merchant_display_name_for,
    recurring_leak_title,
)
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from leak_intelligence.recurrence_rules import (
    is_implausibly_frequent_interval,
    matches_plausible_recurring_interval,
)
from tests.test_leak_detection import _detect, _transaction


def test_two_day_payments_are_not_recurring_leaks() -> None:
    history = [
        _transaction(f"shop-{index}", "200", when, merchant="SHOP", category="Groceries")
        for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 2)))
    ]
    chatgpt = [
        _transaction(f"gpt-{index}", "10", when, merchant="CHATGPT", category="Other")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 3), date(2026, 7, 5), date(2026, 7, 7))
        )
    ]
    transactions = history + chatgpt
    snapshot = build_financial_features("user-a", transactions)
    gpt = next(item for item in snapshot.merchants if item.merchant_name == "CHATGPT")
    assert is_implausibly_frequent_interval(gpt.recurrence.average_interval_days)
    assert gpt.recurrence.recurrence_strength != "high"
    recurring_types = {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
    }
    chatgpt_leaks = [
        item
        for item in _detect(transactions).leaks
        if item.leak_type in recurring_types and "CHATGPT" in item.title.upper()
    ]
    assert chatgpt_leaks == []
    assert gpt.recurrence.recurrence_strength not in {"medium", "high"}


def test_thirty_day_payments_can_be_recurring_candidates() -> None:
    monthly = [
        _transaction(f"m-{index}", "149", when, merchant="CLOUD HOST", category="Software")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    snapshot = build_financial_features("user-a", monthly)
    interval = snapshot.merchants[0].recurrence.average_interval_days
    assert interval is not None
    assert matches_plausible_recurring_interval(interval)
    leak_types = {item.leak_type for item in _detect(monthly).leaks}
    assert leak_types & {"recurring_payment_leak", "unknown_recurring_payment"}


def test_weekly_grocery_purchases_are_not_recurring_bills() -> None:
    weekly = [
        _transaction(f"w-{index}", "50", when, merchant="WEEKLY SHOP", category="Groceries")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 8), date(2026, 7, 15), date(2026, 7, 22))
        )
    ]
    snapshot = build_financial_features("user-a", weekly)
    assert matches_plausible_recurring_interval(snapshot.merchants[0].recurrence.average_interval_days)
    behaviours = analyze_behaviour(snapshot)
    assert not any(
        item.behavior_type == "recurring_payment_pattern" for item in behaviours.observations
    )
    assert "recurring_payment_leak" not in {item.leak_type for item in _detect(weekly).leaks}


def test_weekly_software_payments_can_be_recurring_candidates() -> None:
    weekly = [
        _transaction(f"w-{index}", "50", when, merchant="TOOL BOX", category="Software")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 8), date(2026, 7, 15), date(2026, 7, 22))
        )
    ]
    snapshot = build_financial_features("user-a", weekly)
    assert matches_plausible_recurring_interval(snapshot.merchants[0].recurrence.average_interval_days)
    behaviours = analyze_behaviour(snapshot)
    assert any(
        item.behavior_type == "recurring_payment_pattern" for item in behaviours.observations
    )


def test_statement_boilerplate_is_not_a_display_merchant() -> None:
    assert not is_reliable_merchant_display_name("ACCOUNT ID US FOR")
    assert not is_reliable_merchant_display_name("ZAR69.99 AMOUNT R69.99 REF")
    title = recurring_leak_title(subscription=False, merchant_name="ACCOUNT ID US FOR")
    assert title == "Unidentified recurring payment"
    assert "ACCOUNT" not in title


def test_subscription_requires_subscription_category_not_frequency_alone() -> None:
    frequent_other = [
        _transaction(f"x-{index}", "10", when, merchant="CHATGPT", category="Other")
        for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1)))
    ]
    assert "subscription_leak" not in {item.leak_type for item in _detect(frequent_other).leaks}


def test_duplicate_leak_is_verification_candidate_with_one_time_impact_label() -> None:
    duplicate = [
        _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    leak = next(item for item in _detect(duplicate).leaks if item.leak_type == "duplicate_payment_leak")
    assert leak.title == "Possible duplicate payment at Coffee — R50"
    assert "Duplicate payment detected" not in leak.title
    assert "confirmed" not in leak.title.lower()
    assert leak.evidence.get("verification_required") is True
    assert leak.evidence.get("finding_kind") == "verification_required"
    assert leak.evidence.get("finding_focus") == "duplicate_merchant_payment"
    assert "transaction_ids" not in leak.evidence
    report = render_leak_report(_detect(duplicate))
    assert "Potential amount:" in report
    assert "Monthly impact:" not in report.split("Potential amount:")[0] or "Potential amount:" in report


def test_leak_report_uses_potential_amount_for_one_time_only() -> None:
    duplicate = [
        _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    report = render_leak_report(_detect(duplicate))
    assert "Potential amount:" in report
    spending = [
        _transaction("a", "100", date(2026, 7, 1)),
        _transaction("b", "200", date(2026, 8, 1)),
        _transaction("c", "500", date(2026, 9, 30)),
    ]
    spending_report = render_leak_report(_detect(spending))
    assert "Monthly impact:" in spending_report


def test_reliable_merchant_appears_in_recurring_title() -> None:
    title = recurring_leak_title(subscription=False, merchant_name="NETFLIX")
    assert title == "Potential recurring payment at Netflix"


def test_bank_fee_ratio_evidence_stays_fraction_for_formatters() -> None:
    transactions = [
        _transaction("fee-1", "10", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-2", "20", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-3", "80", date(2026, 9, 30), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    ratio = leak.evidence.get("bank_fee_ratio")
    assert ratio is not None
    assert Decimal(str(ratio)) <= Decimal("1")


def test_woolworths_duplicate_display_name_does_not_change_detection() -> None:
    transactions = [
        _transaction(
            "wool-a",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS REF 123456789",
        ),
        _transaction(
            "wool-b",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS REF 123456789",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    snapshot = build_financial_features("user-a", transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    leak = next(item for item in leaks.leaks if item.leak_type == "duplicate_payment_leak")
    expected = leak_fingerprint(
        user_id="user-a",
        leak_type="duplicate_payment_leak",
        subject_key=subject_key("WOOLWORTHS"),
        detector_version=DETECTOR_VERSION,
    )
    assert leak.fingerprint == expected
    assert leak.leak_id == expected
    assert leak.evidence["merchant_key"] == "WOOLWORTHS"
    assert leak.evidence["merchant_display_name"] == "Woolworths"
    assert leak.evidence["observed_date"] == "2026-07-18"
    assert leak.evidence["transaction_count_in_group"] == 2
    assert leak.evidence["candidate_amount"] == Decimal("186.40")
    assert leak.estimated_monthly_impact == Decimal("186.40")
    assert leak.estimated_annual_impact is None
    assert leak.confidence == leak_confidence(
        support=None,
        observation_count=2,
        pattern_strength=Decimal("0.65"),
        ceiling=Decimal("0.68"),
    )
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == analysis.reasoning_id
    )
    assert recommendation.recommendation_type == "verify_potential_duplicate"
    assert "Woolworths" in leak.title
    assert "Woolworths" in analysis.title
    assert "Woolworths" in recommendation.title
    assert analysis.evidence["merchant_key"] == "WOOLWORTHS"
    assert analysis.evidence["merchant_display_name"] == "Woolworths"
    assert analysis.evidence["observed_date"] == "2026-07-18"
    assert analysis.evidence["verification_required"] is True
    assert analysis.evidence["potential_duplicate_amount"] == Decimal("186.40")
    assert analysis.evidence["matching_transaction_count"] == 2


def test_card_purchase_boilerplate_has_no_merchant_display_name() -> None:
    assert merchant_display_name_for("With Card At") is None
    assert merchant_display_name_for("WITH CARD AT") is None
    assert merchant_display_name_for("PURCHASE WITH CARD AT") is None
    assert merchant_display_name_for("WOOLWORTHS") == "Woolworths"
    transactions = [
        _transaction(
            "card-a",
            "40",
            date(2026, 7, 2),
            merchant="WITH CARD AT",
            description="WITH CARD AT",
        ),
        _transaction(
            "card-b",
            "40",
            date(2026, 7, 2),
            merchant="PURCHASE WITH CARD AT",
            description="PURCHASE WITH CARD AT",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS"),
    ]
    leaks = [
        item
        for item in _detect(transactions).leaks
        if item.leak_type == "duplicate_payment_leak"
    ]
    # Card-purchase boilerplate must not form a merchant group or display name.
    assert leaks == []
    assert merchant_display_name_for("WITH CARD AT") is None
    assert merchant_display_name_for("PURCHASE WITH CARD AT") is None
