"""A regular monthly charge is found inside a mix of other charges from one merchant."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from tests.test_leak_detection import _detect, _transaction

LATER = _transaction("later", "420", date(2026, 10, 20), merchant="CHECKERS", category="Groceries")


def _charges(prefix, merchant, rows):
    return [
        _transaction(f"{prefix}{index}", amount, when, merchant=merchant, category="Subscriptions")
        for index, (amount, when) in enumerate(rows)
    ]


def _subscription(transactions, merchant):
    return next(
        (
            leak
            for leak in _detect([*transactions, LATER]).leaks
            if leak.leak_type == "subscription_leak" and leak.evidence.get("merchant_key") == merchant
        ),
        None,
    )


PLAN = [
    ("341.94", date(2026, 6, 16)),
    ("349.10", date(2026, 7, 16)),
    ("351.15", date(2026, 8, 16)),
    ("346.80", date(2026, 9, 16)),
    ("351.15", date(2026, 10, 16)),
]
USAGE = [
    ("88.00", date(2026, 6, 29)),
    ("210.50", date(2026, 7, 3)),
    ("54.20", date(2026, 8, 30)),
    ("132.00", date(2026, 9, 5)),
    ("19.99", date(2026, 10, 2)),
    ("77.70", date(2026, 7, 28)),
]


def test_a_plan_that_drifts_with_the_exchange_rate_is_found_among_usage_charges() -> None:
    leak = _subscription(_charges("p", "CURSOR", PLAN) + _charges("u", "CURSOR", USAGE), "CURSOR")
    assert leak is not None
    assert leak.evidence["recurrence_basis"] == "dominant_amount"
    assert "not counted" in leak.evidence["recurrence_basis_note"]
    # Only the regular charge is the cost; the usage charges are not added to it.
    assert Decimal("340") < leak.estimated_monthly_impact < Decimal("352")


def test_a_small_monthly_charge_is_found_among_one_off_app_purchases() -> None:
    icloud = _charges("i", "APPLE", [("14.99", date(2026, month, 16)) for month in range(6, 11)])
    apps = _charges(
        "a",
        "APPLE",
        [("49.99", date(2026, 6, 2)), ("129.00", date(2026, 7, 9)), ("29.99", date(2026, 8, 24)), ("49.99", date(2026, 9, 27))],
    )
    leak = _subscription(icloud + apps, "APPLE")
    assert leak is not None
    assert leak.estimated_monthly_impact == Decimal("14.99")


def test_each_regular_amount_at_one_merchant_is_its_own_finding_with_its_own_charges() -> None:
    from leak_intelligence.leak_evidence import attach_supporting_transactions

    small = _charges("s", "APPLE", [("14.99", date(2026, month, 16)) for month in range(6, 11)])
    large = _charges("l", "APPLE", [("165.00", date(2026, month, 5)) for month in range(6, 11)])
    noise = _charges("n", "APPLE", [("29.99", date(2026, 6, 25)), ("59.00", date(2026, 8, 30))])
    transactions = [*small, *large, *noise, LATER]
    result = attach_supporting_transactions(_detect(transactions), transactions)
    found = {
        leak.estimated_monthly_impact: leak
        for leak in result.leaks
        if leak.leak_type == "subscription_leak" and leak.evidence.get("merchant_key") == "APPLE"
    }
    assert set(found) == {Decimal("14.99"), Decimal("165.00")}
    # Different identities, and each shows only the charges that make up its own series.
    assert found[Decimal("14.99")].fingerprint != found[Decimal("165.00")].fingerprint
    for amount, leak in found.items():
        assert leak.supporting_transaction_count == 5
        assert {row.amount for row in leak.supporting_transactions} == {amount}


def test_a_different_purchase_at_the_same_merchant_is_not_a_price_rise() -> None:
    """R14.99 monthly plus one R179.99 purchase must not read as a R165 price rise."""
    icloud = _charges("i", "APPLE", [("14.99", date(2026, month, 16)) for month in range(5, 11)])
    gadget = _charges("g", "APPLE", [("179.99", date(2026, 10, 26)), ("49.99", date(2026, 7, 9)), ("29.99", date(2026, 8, 3))])
    leak = _subscription(icloud + gadget, "APPLE")
    assert leak is not None
    assert leak.estimated_monthly_impact == Decimal("14.99")
    assert leak.evidence["headline_impact_basis"] == "recurring_cost"
    assert leak.evidence["latest_amount"] != Decimal("179.99")


def test_a_rejected_same_day_pair_does_not_hide_the_subscription() -> None:
    """A pair the duplicate rules reject (different descriptions) must not suppress the plan."""
    plan = _charges("c", "CURSOR", [("341.94", date(2026, month, 16)) for month in range(6, 11)])
    pair = [
        _transaction("x1", "341.94", date(2026, 8, 30), merchant="CURSOR", category="Subscriptions", description="CURSOR PRO"),
        _transaction("x2", "341.94", date(2026, 8, 30), merchant="CURSOR", category="Subscriptions", description="CURSOR USAGE"),
    ]
    result = _detect([*plan, *pair, LATER])
    types = {leak.leak_type for leak in result.leaks if leak.evidence.get("merchant_key") == "CURSOR"}
    assert "subscription_leak" in types
    assert "duplicate_payment_leak" not in types


def test_a_deliberate_credit_upgrade_is_not_a_duplicate_and_does_not_hide_the_plan() -> None:
    """Cursor: the monthly plan, then on renewal day a credit upgrade for about the same
    amount under a different description, and a small top-up two days later."""
    plan = _charges("c", "CURSOR", [("341.94", date(2026, month, 16)) for month in range(6, 10)])
    renewal_day = [
        _transaction("r1", "341.94", date(2026, 10, 16), merchant="CURSOR", category="Subscriptions", description="CURSOR, AI POWERED IDE"),
        _transaction("r2", "341.94", date(2026, 10, 16), merchant="CURSOR", category="Subscriptions", description="CURSOR CREDITS UPGRADE"),
        _transaction("r3", "182.40", date(2026, 10, 18), merchant="CURSOR", category="Subscriptions", description="CURSOR CREDITS TOP-UP"),
    ]
    result = _detect([*plan, *renewal_day, LATER])
    types = {leak.leak_type for leak in result.leaks if leak.evidence.get("merchant_key") == "CURSOR"}
    assert "duplicate_payment_leak" not in types
    assert "subscription_leak" in types
    assert any(
        miss.reason_code == "different_descriptions" and miss.merchant == "CURSOR"
        for miss in result.near_misses
    )


def test_a_single_regular_series_is_still_one_finding() -> None:
    small = _charges("s", "APPLE", [("14.99", date(2026, month, 16)) for month in range(6, 11)])
    noise = _charges("n", "APPLE", [("29.99", date(2026, 6, 25)), ("59.00", date(2026, 8, 30)), ("129", date(2026, 7, 9))])
    result = _detect([*small, *noise, LATER])
    assert len([leak for leak in result.leaks if leak.leak_type == "subscription_leak"]) == 1


def test_a_failed_rescue_names_the_most_repeated_amounts() -> None:
    mixed = _charges(
        "m",
        "CURSOR",
        [
            ("351.15", date(2026, 8, 16)),
            ("351.15", date(2026, 10, 16)),
            ("341.94", date(2026, 9, 2)),
            ("88.00", date(2026, 9, 20)),
            ("210.50", date(2026, 7, 3)),
        ],
    )
    result = _detect([*mixed, LATER])
    miss = next(item for item in result.near_misses if item.reason_code == "recurrence_not_established")
    assert "Most repeated" in miss.reason and "gaps in days" in miss.reason


def test_a_plan_with_extra_charges_still_bills_monthly_most_of_the_time() -> None:
    # Gaps 28, 35, 38, 16, 6, 35 days: four of six are monthly, two are extra charges.
    days = [date(2026, 5, 7), date(2026, 6, 4), date(2026, 7, 9), date(2026, 8, 16), date(2026, 9, 1), date(2026, 9, 7), date(2026, 10, 12)]
    amounts = ["341.94", "341.94", "345.10", "341.94", "341.94", "341.94", "341.94"]
    plan = _charges("c", "CURSOR", list(zip(amounts, days)))
    usage = _charges("u", "CURSOR", [("88.00", date(2026, 6, 20)), ("19.99", date(2026, 9, 20))])
    leak = _subscription(plan + usage, "CURSOR")
    assert leak is not None
    assert leak.evidence["recurrence_basis"] == "dominant_amount"
    assert Decimal("340") < leak.estimated_monthly_impact < Decimal("346")


def test_the_same_amount_bunched_most_of_the_time_is_not_a_subscription() -> None:
    days = [date(2026, 5, 7), date(2026, 5, 13), date(2026, 5, 22), date(2026, 5, 27), date(2026, 6, 9), date(2026, 6, 14), date(2026, 8, 30)]
    bunched = _charges("b", "BUNCH", [("120.00", day) for day in days])
    other = _charges("o", "BUNCH", [("55.00", date(2026, 7, 1)), ("310.00", date(2026, 9, 2))])
    assert _subscription(bunched + other, "BUNCH") is None


def test_random_amounts_are_never_read_as_a_regular_series() -> None:
    random_amounts = _charges(
        "r",
        "MIXED",
        [
            ("40", date(2026, 6, 2)),
            ("120", date(2026, 6, 20)),
            ("75", date(2026, 7, 29)),
            ("200", date(2026, 8, 3)),
            ("55", date(2026, 9, 9)),
            ("310", date(2026, 10, 1)),
        ],
    )
    assert _subscription(random_amounts, "MIXED") is None


def test_a_cluster_that_is_not_monthly_is_not_a_subscription() -> None:
    # Same amount, but bunched in a few days: a spending burst, not a billing cycle.
    burst = _charges(
        "b",
        "BURSTY",
        [("99", date(2026, 8, day)) for day in (1, 2, 3, 4)] + [("250", date(2026, 9, 9)), ("37", date(2026, 10, 1))],
    )
    assert _subscription(burst, "BURSTY") is None


def test_a_series_that_already_passes_is_unchanged() -> None:
    netflix = _charges("n", "NETFLIX", [("99", date(2026, month, 3)) for month in (7, 8, 9)])
    leak = _subscription(netflix, "NETFLIX")
    assert leak is not None
    assert "recurrence_basis" not in leak.evidence
