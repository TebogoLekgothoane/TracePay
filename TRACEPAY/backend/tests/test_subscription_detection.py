"""Regression tests for subscription categorisation and recurrence eligibility."""

from __future__ import annotations

from datetime import date

from categorisation.classifier import classify_transaction
from leak_intelligence.engine import build_financial_features
from tests.test_leak_detection import _detect, _transaction


def test_chatgpt_description_is_subscription_category() -> None:
    result = classify_transaction("POS PURCHASE CHATGPT", "debit")
    assert result.category_name == "Subscriptions"
    assert result.transaction_class == "spending"
    assert result.merchant_name == "ChatGPT"


def test_openai_chatgpt_description_is_subscription_category() -> None:
    result = classify_transaction("RECURRING PAYMENT OPENAI CHATGPT", "debit")
    assert result.category_name == "Subscriptions"
    assert result.merchant_name == "ChatGPT"


def test_monthly_chatgpt_can_surface_subscription_leak() -> None:
    transactions = [
        _transaction(
            f"gpt-{index}",
            "199",
            when,
            merchant="CHATGPT",
            category="Subscriptions",
            description="POS PURCHASE CHATGPT",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    snapshot = build_financial_features("user-a", transactions)
    gpt = next(item for item in snapshot.merchants if item.merchant_name == "CHATGPT")
    assert gpt.recurrence.recurrence_strength in {"medium", "high"}
    assert "subscription_leak" in {item.leak_type for item in _detect(transactions).leaks}


def test_apple_app_store_short_interval_is_not_subscription_leak() -> None:
    transactions = [
        _transaction(
            f"apple-{index}",
            "357.47",
            when,
            merchant="APPLE",
            category="Subscriptions",
            description="APPLE.COM/BILL",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 10), date(2026, 7, 19), date(2026, 7, 28))
        )
    ]
    assert "subscription_leak" not in {item.leak_type for item in _detect(transactions).leaks}
