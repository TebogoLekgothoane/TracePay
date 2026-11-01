"""Duplicate-payment findings must not fire on routine same-day repeats."""

from __future__ import annotations

from datetime import date, time

import pytest

from tests.test_leak_detection import _detect, _transaction

DAY = date(2026, 7, 18)


def _later():
    return _transaction("later", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries")


def _flagged(transactions) -> bool:
    leaks = _detect([*transactions, _later()]).leaks
    return any(item.leak_type == "duplicate_payment_leak" for item in leaks)


def _pair(amount, merchant, category, *, times=(None, None), day=DAY, prefix="p", description=None):
    return [
        _transaction(
            f"{prefix}-{index}",
            amount,
            day,
            merchant=merchant,
            category=category,
            description=description or merchant,
            transaction_time=moment,
        )
        for index, moment in enumerate(times)
    ]


def test_purchases_hours_apart_are_two_purchases() -> None:
    fuel = _pair("500", "ENGEN", "Fuel", times=(time(8, 0), time(18, 5)))
    assert not _flagged(fuel)
    shopping = _pair("349", "TAKEALOT", "Shopping", times=(time(9, 0), time(15, 0)))
    assert not _flagged(shopping)


def test_charge_repeated_within_minutes_is_flagged() -> None:
    assert _flagged(_pair("349", "TAKEALOT", "Shopping", times=(time(12, 0), time(12, 2))))
    assert _flagged(_pair("62", "BOLT", "Transport", times=(time(9, 0), time(9, 3))))


@pytest.mark.parametrize(
    ("merchant", "category", "amount"),
    [
        ("VIDA E CAFFE", "Restaurants", "135"),
        ("KFC", "Fast Food", "189.90"),
        ("UBER", "Transport", "162"),
        ("ENGEN", "Fuel", "500"),
        ("VODACOM", "Airtime & Data", "150"),
    ],
)
def test_date_only_everyday_spend_is_not_a_duplicate(merchant, category, amount) -> None:
    assert not _flagged(_pair(amount, merchant, category))


def test_date_only_small_amounts_are_not_duplicates() -> None:
    assert not _flagged(_pair("89.90", "TAKEALOT", "Shopping"))


def test_date_only_triples_are_not_duplicates() -> None:
    triple = [
        _transaction(f"g-{index}", "249.90", DAY, merchant="PICK N PAY", category="Groceries")
        for index in range(3)
    ]
    assert not _flagged(triple)


def test_date_only_large_one_off_pair_is_still_flagged() -> None:
    assert _flagged(_pair("1299", "GAME", "Shopping"))
    assert _flagged(_pair("186.40", "WOOLWORTHS", "Groceries", prefix="w"))


@pytest.mark.parametrize("category", ["Transfers", "Cash Withdrawal", "Savings"])
def test_transfer_cash_and_savings_rows_are_not_duplicates(category) -> None:
    pair = _pair(
        "500", "CAPITEC", category, times=(time(10, 0), time(10, 1)), description="IB TRANSFER"
    )
    assert not _flagged(pair)


def test_same_day_repeat_that_happens_on_several_days_is_a_routine() -> None:
    commute = [
        *_pair("62", "BOLT", "Shopping", times=(time(7, 0), time(7, 5)), day=date(2026, 7, 14), prefix="a"),
        *_pair("62", "BOLT", "Shopping", times=(time(7, 0), time(7, 5)), day=date(2026, 7, 15), prefix="b"),
    ]
    assert not _flagged(commute)
    untimed = [
        *_pair("250", "TAKEALOT", "Shopping", day=date(2026, 7, 14), prefix="a"),
        *_pair("250", "TAKEALOT", "Shopping", day=date(2026, 7, 15), prefix="b"),
    ]
    assert not _flagged(untimed)


def test_rows_on_different_days_stay_separate() -> None:
    pair = [
        _transaction("a", "1299", date(2026, 7, 18), merchant="GAME", category="Shopping"),
        _transaction("b", "1299", date(2026, 7, 19), merchant="GAME", category="Shopping"),
    ]
    assert not _flagged(pair)
