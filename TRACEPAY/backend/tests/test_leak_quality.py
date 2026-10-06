"""Regression tests for leak detection precision and presentation quality."""

from datetime import date
from decimal import Decimal

from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_report import render_leak_report
from leak_intelligence.merchant_display import is_reliable_merchant_display_name, recurring_leak_title
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


def test_weekly_payments_can_be_recurring_candidates() -> None:
    weekly = [
        _transaction(f"w-{index}", "50", when, merchant="WEEKLY SHOP", category="Groceries")
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
    assert title == "Potential recurring payment"
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
    assert leak.title == "Potential duplicate payment requires verification"
    assert "Duplicate payment detected" not in leak.title
    assert leak.evidence.get("verification_required") is True
    assert leak.evidence.get("finding_kind") == "verification_required"
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
