"""Every finding says whether transactions back it; aggregate increases split their rows."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from leak_intelligence.leak_evidence import attach_supporting_transactions
from tests.benchmark.customers import build_customers
from tests.benchmark.noisy_customers import build_noisy_customers
from tests.benchmark.runner import run_pipeline
from tests.intelligence_dataset import load_all_intelligence_scenarios
from tests.test_leak_detection import _detect, _transaction

DATASETS = [
    *[(f"scenario:{item.scenario_id}", list(item.transactions), item.user_id) for item in load_all_intelligence_scenarios()],
    *[(f"customer:{item.name}", item.transactions, "user-a") for item in build_customers()],
    *[(f"noisy:{item.name}", item.transactions, "user-a") for item in build_noisy_customers()],
]


@pytest.mark.parametrize(("name", "transactions", "user"), DATASETS, ids=[item[0] for item in DATASETS])
def test_every_finding_reports_its_transaction_evidence(name, transactions, user) -> None:
    result = run_pipeline(transactions, user)
    known = {tx.transaction_id for tx in transactions}
    for leak in [*result.leaks, *result.explained_leaks]:
        state = leak.evidence.get("transaction_evidence")
        assert state in {"attached", "insufficient"}, (name, leak.leak_type)
        ids = {row.transaction_id for row in leak.supporting_transactions}
        assert ids <= known
        if state == "attached":
            assert ids and leak.supporting_transaction_count >= len(ids)
        else:
            assert not ids and leak.evidence.get("transaction_evidence_reason")


def test_no_finding_in_any_dataset_is_left_without_evidence() -> None:
    """Whatever the datasets contain, nothing is silently empty; today nothing is insufficient."""
    insufficient = set()
    for name, transactions, user in DATASETS:
        for leak in run_pipeline(transactions, user).leaks:
            if leak.evidence["transaction_evidence"] == "insufficient":
                insufficient.add((name, leak.leak_type))
    assert insufficient == set()


# Category growth carries its own rows, split into baseline and increase.
def _food_growth():
    rows = [
        _transaction(f"r{month}", str(amount), date(2026, month, 12), merchant="NANDOS", category="Restaurants")
        for month, amount in ((4, 200), (5, 200), (6, 200), (7, 500), (8, 200))
    ]
    rows += [
        _transaction(f"c{month}", "900", date(2026, month, 3), merchant="CHECKERS", category="Groceries")
        for month in (4, 5, 6, 7, 8)
    ]
    return rows


def test_category_growth_attaches_only_its_own_categorys_rows() -> None:
    rows = _food_growth()
    result = attach_supporting_transactions(_detect(rows), rows)
    growth = [leak for leak in result.leaks if leak.evidence.get("increase_rows") and leak.evidence.get("category_name")]
    assert growth, "the category increase must exist for this to test anything"
    leak = growth[0]
    attached = {row.transaction_id for row in leak.supporting_transactions}
    assert attached and all(item.startswith("r") for item in attached)  # no grocery rows
    assert leak.evidence["transaction_evidence"] == "attached"
    increase = leak.evidence["increase_rows"]
    assert all(item["category"] == leak.evidence["category_name"] for item in increase)
    assert {item["date"] for item in increase} == {"2026-07-12"}
    assert Decimal(str(increase[0]["amount"])) == Decimal("500")


# The mobile data layer keeps `evidence` and row dates untouched, so a consumer can tell
# baseline, current and increase rows apart from the payload alone (checked against the
# real mobile parser with tsx; this keeps the same classification rule under test here).
def classify_row(row, evidence):
    month = row.date.isoformat()[:7]
    increase = {(item["date"], Decimal(str(item["amount"]))) for item in evidence.get("increase_rows", [])}
    if (row.date.isoformat(), row.amount) in increase:
        return "increase"
    if month == evidence["current_period"]:
        return "current"
    if month in set(evidence["baseline_months"]):
        return "baseline"
    return "other"


def test_a_consumer_can_tell_baseline_current_and_increase_rows_apart() -> None:
    rows = _food_growth()
    result = attach_supporting_transactions(_detect(rows), rows)
    leak = next(item for item in result.leaks if item.evidence.get("increase_rows") and item.evidence.get("category_name"))
    kinds = {row.transaction_id: classify_row(row, leak.evidence) for row in leak.supporting_transactions}
    assert kinds["r7"] == "increase"
    assert {kinds["r4"], kinds["r5"], kinds["r6"]} == {"baseline"}
    assert "other" not in kinds.values()
