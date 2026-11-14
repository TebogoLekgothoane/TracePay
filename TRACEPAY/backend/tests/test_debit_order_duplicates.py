"""A repeated debit order is a duplicate whether or not its description says DEBIT ORDER."""

from datetime import date

from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from tests.test_leak_detection import _transaction

DUPLICATE_TYPES = {"duplicate_payment_leak", "duplicate_debit_order_leak"}


def _detect(transactions):
    snapshot = build_financial_features("user-a", transactions)
    return detect_leaks(snapshot, analyze_behaviour(snapshot))


def _filler():
    # Keeps the history long enough for the duplicate detectors to run.
    return _transaction("f", "80", date(2025, 4, 20), merchant="CHECKERS", category="Groceries")


def _pair(description, second_day, amount="446.50"):
    return [
        _transaction("d1", amount, date(2025, 3, 4), merchant="ELECTRIC CO", category="Utilities", description=description),
        _transaction("d2", amount, second_day, merchant="ELECTRIC CO", category="Utilities", description=description),
        _filler(),
    ]


def _duplicate_types(result):
    return {leak.leak_type for leak in result.leaks} & DUPLICATE_TYPES


def test_plain_wording_three_days_apart_is_control_and_is_flagged():
    assert _duplicate_types(_detect(_pair("ELECTRIC CO BILL", date(2025, 3, 7))))


def test_debit_order_wording_three_days_apart_is_flagged():
    result = _detect(_pair("DEBIT ORDER ELECTRIC CO", date(2025, 3, 7)))
    assert _duplicate_types(result), "same pair must not disappear because of the word DEBIT ORDER"


def test_debit_order_wording_on_the_same_day_is_flagged():
    result = _detect(_pair("DEBIT ORDER ELECTRIC CO", date(2025, 3, 4)))
    assert _duplicate_types(result)


def test_a_regular_monthly_debit_order_is_not_a_duplicate():
    monthly = [
        _transaction(
            f"m{m}", "49.37", date(2026, m, 5),
            merchant="ELECTRIC CO", category="Utilities", description="DEBIT ORDER ELECTRIC CO",
        )
        for m in range(1, 5)
    ]
    assert _duplicate_types(_detect(monthly + [_filler()])) == set()
