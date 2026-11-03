"""Findings are grouped as recoverable, worth reviewing or a commitment, never one total."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest

from leak_intelligence.finding_groups import value_group_for
from leak_intelligence.finding_overlap import summarise_impact
from leak_intelligence.leak_models import LeakType
from tests.test_leak_detection import _detect, _transaction


@pytest.mark.parametrize(
    ("leak_type", "expected"),
    [
        ("duplicate_payment_leak", "recoverable"),
        ("duplicate_debit_order_leak", "recoverable"),
        ("penalty_fee_leak", "recoverable"),
        ("bank_fee_leak", "recoverable"),
        ("subscription_leak", "review"),
        ("recurring_payment_leak", "review"),
        ("inactive_recurring_payment_leak", "review"),
        ("overlapping_cover_leak", "review"),
        ("irregular_transaction_leak", "review"),
        ("gambling_spending_leak", "commitment"),
        ("high_cost_credit_leak", "commitment"),
        ("recurring_transfer_leak", "commitment"),
        ("airtime_data_leak", "commitment"),
        ("coffee_spending_leak", "commitment"),
        ("weekend_spending_leak", "commitment"),
    ],
)
def test_each_type_lands_in_its_group(leak_type, expected) -> None:
    assert value_group_for(leak_type, {}) == expected


def test_borrowing_costs_are_not_an_avoidable_bank_fee() -> None:
    assert value_group_for("bank_fee_leak", {"finding_focus": "interest_charges"}) == "review"
    assert value_group_for("bank_fee_leak", {"finding_focus": "overdraft_fee_pattern"}) == "review"
    assert value_group_for("bank_fee_leak", {"finding_focus": "immediate_payment_fee"}) == "recoverable"


def test_a_type_the_mapping_does_not_know_never_claims_money_back() -> None:
    assert value_group_for("something_new_leak", {}) == "review"


def test_every_leak_type_has_an_explicit_group() -> None:
    from typing import get_args

    from leak_intelligence import finding_groups

    known = (
        finding_groups._RECOVERABLE
        | finding_groups._REVIEW
        | finding_groups._COMMITMENT
        | {"bank_fee_leak"}
    )
    assert set(get_args(LeakType)) <= known


def test_findings_carry_a_group_and_the_summary_keeps_groups_apart() -> None:
    transactions = [
        _transaction("dup-1", "1299", date(2026, 7, 18), merchant="GAME", category="Shopping", transaction_time=time(10, 0)),
        _transaction("dup-2", "1299", date(2026, 7, 18), merchant="GAME", category="Shopping", transaction_time=time(10, 2)),
        *[
            _transaction(f"netflix-{index}", "99", when, merchant="NETFLIX", category="Subscriptions")
            for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
        ],
        _transaction("later", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    result = _detect(transactions)
    by_type = {leak.leak_type: leak.value_group for leak in result.leaks}
    assert by_type["duplicate_payment_leak"] == "recoverable"
    assert by_type["subscription_leak"] == "review"

    summary = summarise_impact(result.leaks)
    groups = summary.by_group
    assert groups["recoverable"].one_time == Decimal("1299")
    assert groups["recoverable"].recurring_monthly == Decimal("0")
    assert groups["review"].recurring_monthly == Decimal("99")
    assert all(item.value_group for item in summary.findings)
