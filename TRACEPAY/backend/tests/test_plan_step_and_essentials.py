"""A plan upgrade is told apart from a one-off purchase; essentials are never 'unusual'."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from tests.test_leak_detection import _detect, _transaction

LATER = _transaction("later", "420", date(2026, 11, 3), merchant="CHECKERS", category="Groceries")


def _apple(rows):
    return [
        _transaction(f"a{i}", amount, when, merchant="APPLE", category="Subscriptions")
        for i, (amount, when) in enumerate(rows)
    ]


def _finding(transactions):
    return next(
        (
            leak
            for leak in _detect([*transactions, LATER]).leaks
            if leak.leak_type == "subscription_leak" and leak.evidence.get("merchant_key") == "APPLE"
        ),
        None,
    )


ICLOUD = [("14.99", date(2026, month, 26)) for month in range(5, 10)]
OTHER_PURCHASES = [("49.99", date(2026, 6, 9)), ("29.99", date(2026, 7, 21)), ("129.00", date(2026, 8, 4))]


def test_a_higher_charge_one_billing_cycle_later_is_a_possible_plan_upgrade() -> None:
    """R14.99 monthly, then R54.68 on the same day of the next month: more storage."""
    upgrade = [("54.68", date(2026, 10, 26))]
    leak = _finding(_apple([*ICLOUD, *upgrade, *OTHER_PURCHASES]))
    assert leak is not None
    assert leak.evidence["price_change_focus"] == "plan_step_up"
    assert leak.evidence["plan_change_possible"] is True
    assert "your own upgrade" in leak.evidence["plan_change_note"]
    assert leak.evidence["headline_impact_basis"] == "price_increase"
    # The rise is 54.68 - 14.99, and the plan's real cost today is the new price.
    assert leak.estimated_monthly_impact == Decimal("39.69")
    assert leak.evidence["service_cost_monthly"] == Decimal("54.68")


def test_a_higher_charge_that_is_not_one_cycle_later_is_not_a_price_rise() -> None:
    """The same R14.99 plan and a R179.99 purchase 10 days after the last plan charge."""
    leak = _finding(_apple([*ICLOUD, ("179.99", date(2026, 10, 6)), *OTHER_PURCHASES]))
    assert leak is not None
    assert "plan_change_possible" not in leak.evidence
    assert leak.evidence["headline_impact_basis"] == "recurring_cost"
    assert leak.estimated_monthly_impact == Decimal("14.99")


def test_a_big_grocery_shop_is_never_an_unusual_transaction() -> None:
    shops = [
        _transaction(f"g{i}", "300", date(2026, 7, 1 + i * 3), merchant="CHECKERS", category="Groceries")
        for i in range(6)
    ]
    big = _transaction("big", "963.76", date(2026, 8, 20), merchant="CHECKERS", category="Groceries")
    result = _detect([*shops, big, LATER])
    assert "irregular_transaction_leak" not in {leak.leak_type for leak in result.leaks}
    assert not [m for m in result.near_misses if m.leak_type == "irregular_transaction_leak"]


def test_a_large_non_essential_purchase_is_still_flagged() -> None:
    shops = [
        _transaction(f"s{i}", "300", date(2026, 7, 1 + i * 3), merchant=f"SHOP{i}", category="Shopping")
        for i in range(6)
    ]
    big = _transaction("big", "963.76", date(2026, 8, 20), merchant="BIGSHOP", category="Shopping")
    assert "irregular_transaction_leak" in {leak.leak_type for leak in _detect([*shops, big, LATER]).leaks}
