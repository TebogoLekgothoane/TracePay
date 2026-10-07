"""Synthetic intelligence scenarios stay on the canonical transaction model.

Detection assertions compare the existing pipeline with each scenario's expected
outcome. They do not change detectors when a scenario disagrees with them.
"""

from datetime import date
from decimal import Decimal

import pytest

from leak_intelligence.models import FeatureTransaction
from tests.intelligence_dataset import (
    SYNTHETIC_USER_ID,
    evaluate_intelligence_scenario,
    expectation_mismatch,
    load_all_intelligence_scenarios,
    load_intelligence_scenario,
)

_CLASSES = {
    "spending",
    "income",
    "internal_transfer",
    "person_to_person",
    "savings",
    "investment",
    "bank_fee",
    "unknown",
}


def test_unknown_scenario_is_rejected() -> None:
    with pytest.raises(KeyError, match="Unknown intelligence scenario"):
        load_intelligence_scenario("FI-999-missing")


def test_scenarios_load_into_the_canonical_transaction_model() -> None:
    scenarios = load_all_intelligence_scenarios()
    assert len(scenarios) == 16
    seen_ids: set[str] = set()
    for scenario in scenarios:
        assert scenario.scenario_id not in seen_ids
        seen_ids.add(scenario.scenario_id)
        assert scenario.transactions
        assert scenario.user_id == SYNTHETIC_USER_ID
        for transaction in scenario.transactions:
            assert isinstance(transaction, FeatureTransaction)
            assert transaction.user_id == SYNTHETIC_USER_ID
            assert transaction.transaction_id
            assert isinstance(transaction.amount, Decimal)
            assert transaction.amount > 0
            assert isinstance(transaction.transaction_date, date)
            assert transaction.transaction_type == "debit"
            assert transaction.is_duplicate is False
            assert transaction.categorisation.transaction_class in _CLASSES
            assert transaction.categorisation.category_name
            assert 0 <= transaction.categorisation.category_confidence <= 1
            assert 0 <= transaction.categorisation.classification_confidence <= 1


def test_loader_is_deterministic() -> None:
    first = load_intelligence_scenario("FI-029-fast-food-escalation")
    second = load_intelligence_scenario("FI-029-fast-food-escalation")
    assert [item.transaction_id for item in first.transactions] == [
        item.transaction_id for item in second.transactions
    ]
    assert [item.amount for item in first.transactions] == [
        item.amount for item in second.transactions
    ]
    assert [item.transaction_date for item in first.transactions] == [
        item.transaction_date for item in second.transactions
    ]


def test_named_loader_returns_only_that_scenario() -> None:
    scenario = load_intelligence_scenario("FI-040-duplicate-merchant-payment")
    assert scenario.spec.fi_id == "FI-040"
    assert scenario.spec.case_kind == "positive"
    assert len(scenario.transactions) == 3
    assert {item.merchant_name for item in scenario.transactions} == {
        "WOOLWORTHS",
        "CHECKERS",
    }


@pytest.mark.parametrize(
    "scenario_id",
    [scenario.scenario_id for scenario in load_all_intelligence_scenarios()],
)
def test_scenario_expectation_matches_current_pipeline(scenario_id: str) -> None:
    scenario = load_intelligence_scenario(scenario_id)
    mismatch = expectation_mismatch(scenario, evaluate_intelligence_scenario(scenario))
    assert mismatch is None, mismatch
