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


def _days_apart(first, second, amount="1299", merchant="GAME", category="Shopping", prefix="d"):
    return [
        _transaction(f"{prefix}-a", amount, first, merchant=merchant, category=category),
        _transaction(f"{prefix}-b", amount, second, merchant=merchant, category=category),
    ]


def _leak_for(transactions):
    leaks = _detect([*transactions, _later()]).leaks
    return next((item for item in leaks if item.leak_type == "duplicate_payment_leak"), None)


def _misses(transactions):
    return {(item.merchant, item.reason_code) for item in _detect([*transactions, _later()]).near_misses}


def test_near_misses_say_why_a_look_alike_was_not_raised() -> None:
    assert ("TAKEALOT", "below_minimum_amount") in _misses(
        _days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="89.90", merchant="TAKEALOT")
    )
    assert ("GAME", "outside_day_window") in _misses(_days_apart(date(2026, 7, 12), date(2026, 7, 16)))
    routine = [
        *_days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="349", merchant="TAKEALOT"),
        _transaction("d-c", "349", date(2026, 8, 12), merchant="TAKEALOT", category="Shopping"),
    ]
    assert ("TAKEALOT", "repeated_routine") in _misses(routine)
    assert ("KFC", "everyday_spend") in _misses(
        _days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="500", merchant="KFC", category="Fast Food")
    )
    assert ("GAME", "everyday_spend") not in _misses(_days_apart(date(2026, 7, 12), date(2026, 7, 13)))


def test_a_raised_finding_is_not_also_a_near_miss() -> None:
    pair = _days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="500", merchant="TAKEALOT")
    assert _leak_for(pair) is not None
    assert not [
        item
        for item in _detect([*pair, _later()]).near_misses
        if item.merchant == "TAKEALOT" and item.leak_type == "duplicate_payment_leak"
    ]


def test_near_misses_name_a_merchant_and_amount_never_a_description() -> None:
    result = _detect([*_days_apart(date(2026, 7, 12), date(2026, 7, 16)), _later()])
    dumped = result.near_misses[0].model_dump()
    assert set(dumped) == {
        "leak_type", "reason_code", "reason", "merchant", "merchant_display_name", "amount", "dates",
    }


@pytest.mark.parametrize("gap", [1, 2, 3])
def test_a_large_identical_pair_a_few_days_apart_is_a_possible_duplicate(gap) -> None:
    leak = _leak_for(_days_apart(date(2026, 7, 12), date(2026, 7, 12 + gap), amount="210.50", merchant="TAKEALOT"))
    assert leak is not None
    assert leak.evidence["date_span_days"] == gap
    assert "near_day_window" in leak.evidence["match_basis"]
    assert leak.evidence["verification_required"] is True
    assert leak.evidence["evidence_status"] != "confirmed"
    assert leak.confidence <= 0.60
    assert float(leak.estimated_monthly_impact) == 210.50  # only the extra charge


def test_four_days_apart_is_not_a_duplicate() -> None:
    assert not _flagged(_days_apart(date(2026, 7, 12), date(2026, 7, 16)))


def test_near_day_pairs_below_r100_are_not_duplicates() -> None:
    assert not _flagged(_days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="89.90", merchant="TAKEALOT"))


@pytest.mark.parametrize(
    ("merchant", "category"),
    [("KFC", "Fast Food"), ("ENGEN", "Fuel"), ("UBER", "Transport"), ("VODACOM", "Airtime & Data")],
)
def test_near_day_everyday_spend_is_not_a_duplicate(merchant, category) -> None:
    assert not _flagged(_days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="500", merchant=merchant, category=category))


def test_a_third_identical_purchase_makes_it_a_routine_not_a_duplicate() -> None:
    routine = [
        *_days_apart(date(2026, 7, 12), date(2026, 7, 13), amount="349", merchant="TAKEALOT"),
        _transaction("d-c", "349", date(2026, 8, 12), merchant="TAKEALOT", category="Shopping"),
    ]
    assert not _flagged(routine)


def test_a_refund_between_the_pair_removes_the_duplicate_claim() -> None:
    pair = _days_apart(date(2026, 7, 12), date(2026, 7, 14), amount="500", merchant="TAKEALOT")
    refund = _transaction("refund", "500", date(2026, 7, 13), merchant="TAKEALOT", category="Shopping", transaction_type="credit")
    assert not _flagged([*pair, refund])


def test_a_same_day_duplicate_keeps_its_own_reading_when_a_near_day_pair_exists() -> None:
    same_day = _pair("1299", "GAME", "Shopping", prefix="s", day=date(2026, 7, 18))
    next_day = _transaction("n", "1299", date(2026, 7, 19), merchant="GAME", category="Shopping")
    leak = _leak_for([*same_day, next_day])
    assert leak is not None
    assert leak.evidence["date_span_days"] == 0
    assert "near_day_window" not in leak.evidence["match_basis"]
