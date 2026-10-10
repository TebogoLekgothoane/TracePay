"""Refunds, reversals, and cancellations are not purchases or duplicate payments."""

from datetime import date
from decimal import Decimal

from categorisation.classifier import classify_transaction
from categorisation.rules import PURCHASE_REVERSAL_RULE
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction


def _classified(
    transaction_id: str,
    amount: str,
    when: date,
    description: str,
    transaction_type: str,
    *,
    merchant: str | None = None,
) -> FeatureTransaction:
    categorisation = classify_transaction(description, transaction_type)
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant or categorisation.merchant_name,
        description=description,
        transaction_type=transaction_type,  # type: ignore[arg-type]
        categorisation=categorisation,
    )


def _analyse(transactions: list[FeatureTransaction]):
    snapshot = build_financial_features("user-a", transactions)
    leaks = detect_leaks(snapshot, analyze_behaviour(snapshot))
    return snapshot, leaks


def test_same_day_woolworths_refund_is_not_a_second_purchase() -> None:
    purchase = _classified("buy", "186.40", date(2026, 7, 18), "WOOLWORTHS", "debit", merchant="WOOLWORTHS")
    refund = _classified(
        "refund",
        "186.40",
        date(2026, 7, 18),
        "WOOLWORTHS REFUND",
        "credit",
        merchant="WOOLWORTHS",
    )
    later = _classified("later", "80", date(2026, 9, 30), "CHECKERS", "debit", merchant="CHECKERS")
    assert purchase.categorisation.transaction_class == "spending"
    assert purchase.categorisation.category_name == "Groceries"
    assert refund.categorisation.transaction_class == "unknown"
    assert refund.categorisation.category_name is None
    assert refund.categorisation.rule == PURCHASE_REVERSAL_RULE

    snapshot, leaks = _analyse([purchase, refund, later])
    assert snapshot.transaction_count == 3
    assert snapshot.spending_profile.total_spending == Decimal("266.40")
    assert snapshot.spending_profile.spending_by_category["Groceries"] == Decimal("266.40")
    assert snapshot.duplicate_candidates == []
    assert all(item.leak_type != "duplicate_payment_leak" for item in leaks.leaks)
    assert classify_transaction("WOOLWORTHS", "credit").category_name == "Groceries"
    assert classify_transaction("SALARY ACME", "credit").transaction_class == "income"


def test_reversal_credit_does_not_increase_spending_or_duplicate() -> None:
    purchase = _classified("buy", "250", date(2026, 7, 4), "WOOLWORTHS", "debit", merchant="WOOLWORTHS")
    reversal = _classified(
        "reversal",
        "250",
        date(2026, 7, 4),
        "REVERSAL WOOLWORTHS",
        "credit",
        merchant="WOOLWORTHS",
    )
    assert reversal.categorisation.rule == PURCHASE_REVERSAL_RULE
    snapshot, _leaks = _analyse([purchase, reversal])
    assert snapshot.transaction_count == 2
    assert snapshot.spending_profile.total_spending == Decimal("250")
    assert snapshot.duplicate_candidates == []


def test_cancelled_payment_is_not_classified_as_a_purchase() -> None:
    subscription = _classified("netflix", "199", date(2026, 8, 5), "NETFLIX", "debit", merchant="NETFLIX")
    cancelled = _classified(
        "cancelled",
        "199",
        date(2026, 8, 5),
        "CANCELLED NETFLIX",
        "credit",
        merchant="NETFLIX",
    )
    assert subscription.categorisation.category_name == "Subscriptions"
    assert subscription.categorisation.transaction_class == "spending"
    assert cancelled.categorisation.transaction_class == "unknown"
    assert cancelled.categorisation.category_name is None
    assert cancelled.categorisation.rule == PURCHASE_REVERSAL_RULE

    snapshot, _leaks = _analyse([subscription, cancelled])
    assert snapshot.transaction_count == 2
    assert snapshot.spending_profile.total_spending == Decimal("199")
    assert snapshot.spending_profile.spending_by_category["Subscriptions"] == Decimal("199")
    assert snapshot.duplicate_candidates == []


def test_same_day_equal_purchases_remain_duplicate_candidates() -> None:
    transactions = [
        _classified("kfc-a", "89.90", date(2026, 7, 4), "KFC", "debit", merchant="KFC"),
        _classified("kfc-b", "89.90", date(2026, 7, 4), "KFC", "debit", merchant="KFC"),
        _classified("later", "50", date(2026, 9, 4), "CHECKERS", "debit", merchant="CHECKERS"),
    ]
    snapshot, leaks = _analyse(transactions)
    assert len(snapshot.duplicate_candidates) == 1
    assert snapshot.duplicate_candidates[0].transaction_ids == ["kfc-a", "kfc-b"]
    assert any(item.leak_type == "duplicate_payment_leak" for item in leaks.leaks)
