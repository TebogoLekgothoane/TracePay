"""Rules explain what they passed over, and never change what they raise."""

from __future__ import annotations

from datetime import date

from leak_intelligence.near_misses import REASONS, build_near_miss
from tests.test_leak_detection import _detect, _transaction

LATER = _transaction("later", "420", date(2026, 10, 20), merchant="CHECKERS", category="Groceries")
MID = _transaction("mid", "150", date(2026, 9, 2), merchant="WOOLWORTHS", category="Groceries")


def _codes(transactions, leak_type=None):
    return {
        (item.leak_type, item.reason_code, item.merchant)
        for item in _detect(transactions).near_misses
        if leak_type is None or item.leak_type == leak_type
    }


def _shop(index, amount):
    return _transaction(
        f"o{index}", amount, date(2026, 7, 1 + index), merchant=f"SHOP{index}", category="Shopping"
    )


def test_an_outlier_just_under_three_times_is_a_near_miss_not_a_finding() -> None:
    transactions = [*[_shop(i, "300") for i in range(4)], _transaction(
        "big", "850", date(2026, 8, 20), merchant="BIGSHOP", category="Shopping"
    ), LATER]
    result = _detect(transactions)
    assert "irregular_transaction_leak" not in {leak.leak_type for leak in result.leaks}
    assert ("irregular_transaction_leak", "below_outlier_multiple", "BIGSHOP") in _codes(transactions)


def test_a_large_outlier_under_r500_says_so() -> None:
    transactions = [*[_shop(i, "100") for i in range(4)], _transaction(
        "big", "450", date(2026, 8, 20), merchant="BIGSHOP", category="Shopping"
    ), LATER]
    assert ("irregular_transaction_leak", "below_outlier_amount", "BIGSHOP") in _codes(transactions)


def test_an_ordinary_purchase_well_under_r500_is_not_listed() -> None:
    transactions = [*[_shop(i, "100") for i in range(4)], _transaction(
        "trip", "350", date(2026, 8, 20), merchant="CHECKERS", category="Shopping"
    ), LATER]
    assert not _codes(transactions, "irregular_transaction_leak")


def test_a_failed_steady_pattern_prints_the_numbers_behind_it() -> None:
    transactions = [
        _transaction(f"c{i}", "351.15", when, merchant="CURSOR", category="Subscriptions")
        for i, when in enumerate((date(2026, 8, 16), date(2026, 9, 2), date(2026, 10, 16)))
    ] + [LATER]
    miss = next(
        item
        for item in _detect(transactions).near_misses
        if item.reason_code == "recurrence_not_established"
    )
    assert "gaps average" in miss.reason and "vary by" in miss.reason and "different amounts" in miss.reason


def test_supermarket_repeats_are_not_explained_as_almost_recurring() -> None:
    transactions = [
        _transaction("a", "51.30", date(2026, 6, 3), merchant="PICK N PAY", category="Groceries"),
        _transaction("b", "51.30", date(2026, 7, 3), merchant="PICK N PAY", category="Groceries"),
        LATER,
    ]
    assert not _codes(transactions, "recurring_payment_leak")
    assert not _codes(transactions, "inactive_recurring_payment_leak")


def test_small_same_day_ride_pairs_are_not_listed() -> None:
    rides = [
        _transaction("a", "49", date(2026, 7, 7), merchant="BOLT", category="Transport"),
        _transaction("b", "49", date(2026, 7, 7), merchant="BOLT", category="Transport"),
    ]
    assert not _codes([*rides, MID, LATER], "duplicate_payment_leak")


def test_a_monthly_payment_not_yet_overdue_is_not_flagged_but_is_explained() -> None:
    transactions = [
        _transaction(f"n{i}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for i, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    transactions.append(LATER)
    result = _detect(transactions)
    assert "inactive_recurring_payment_leak" not in {leak.leak_type for leak in result.leaks}
    explained = [
        item for item in result.near_misses if item.reason_code == "still_within_expected_window"
    ]
    assert explained and "days ago" in explained[0].reason


def test_two_charges_then_silence_is_explained_as_too_few() -> None:
    transactions = [
        _transaction(f"n{i}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for i, when in enumerate((date(2026, 7, 3), date(2026, 8, 3)))
    ]
    transactions.append(LATER)
    assert ("inactive_recurring_payment_leak", "missing_needs_three_charges", "NETFLIX") in _codes(
        transactions
    )


def test_a_tiny_subscription_is_explained_as_below_the_minimum() -> None:
    transactions = [
        _transaction(f"n{i}", "8", when, merchant="TINYSUB", category="Subscriptions")
        for i, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    transactions.append(LATER)
    assert ("subscription_leak", "below_minimum_impact", "TINYSUB") in _codes(transactions)


def _fee(index, amount, month):
    return _transaction(
        f"f{index}", amount, date(2026, month, 5), merchant=None, category="Bank Fees",
        transaction_class="bank_fee", description="SMS NOTIFICATION FEE",
    )


def test_one_fee_is_explained_as_too_few() -> None:
    assert ("bank_fee_leak", "single_fee", None) in _codes([_fee(0, "35", 7), MID, LATER])


def test_tiny_fees_are_explained_as_too_small() -> None:
    fees = [_fee(i, "3", 7 + i) for i in range(3)]
    assert ("bank_fee_leak", "fees_too_small", None) in _codes([*fees, MID, LATER])


def test_a_raised_subscription_is_not_also_a_near_miss() -> None:
    transactions = [
        _transaction(f"n{i}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for i, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    transactions.append(LATER)
    assert not _codes(transactions, "subscription_leak")


def test_each_rule_is_capped_so_one_cannot_crowd_out_the_others() -> None:
    transactions = [_shop(i, "100") for i in range(4)]
    for index in range(12):
        transactions.append(
            _transaction(
                f"big{index}", str(300 + index), date(2026, 8, 1 + index), merchant=f"BIG{index}", category="Shopping"
            )
        )
    result = _detect([*transactions, LATER])
    irregular = [item for item in result.near_misses if item.leak_type == "irregular_transaction_leak"]
    assert len(irregular) <= 8


def test_every_reason_code_used_in_the_rules_has_text() -> None:
    """A missing code would raise inside a detector, so every one is checked up front."""
    import re
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent / "leak_intelligence"
    used: set[str] = set()
    for name in ("engine.py", "leak_engine.py"):
        source = (root / name).read_text(encoding="utf-8")
        used |= set(re.findall(r'\bmiss\(\s*(?:[a-z_]+,\s*)?"([a-z_]+)"', source))
        used |= set(re.findall(r'build_near_miss\(\s*"[a-z_]+",\s*"([a-z_]+)"', source))
        used |= set(re.findall(r'return "([a-z_]+)"', source[source.find("_implausible_duplicate_reason"):][:2500]))
        used |= set(re.findall(r'code, detail = "([a-z_]+)"', source))
    assert used, "no reason codes were found in the rules"
    assert used <= set(REASONS), f"reason codes without text: {sorted(used - set(REASONS))}"


def test_every_reason_has_text_and_the_factory_never_leaks_a_description() -> None:
    assert all(text.strip() for text in REASONS.values())
    miss = build_near_miss("bank_fee_leak", "single_fee", amount=1, dates=[date(2026, 7, 5)])
    assert set(miss.model_dump()) == {
        "leak_type", "reason_code", "reason", "merchant", "merchant_display_name", "amount", "dates",
    }
