"""Synthetic intelligence scenarios stay on the canonical transaction model.

Detection assertions compare the existing pipeline with each scenario's expected
outcome. They do not change detectors when a scenario disagrees with them.
"""

import json
from datetime import date
from decimal import Decimal

import pytest

from leak_intelligence.models import FeatureTransaction
from tests.intelligence_dataset import (
    DATASET_ROOT,
    SYNTHETIC_USER_ID,
    catalogue_coverage_rows,
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
    assert len(scenarios) >= 16
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
            if transaction.categorisation.transaction_class == "income":
                assert transaction.transaction_type == "credit"
            else:
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


def test_fi003_immediate_payment_fee_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-003-immediate-payment-fee-overuse")
    mismatch = expectation_mismatch(scenario, evaluate_intelligence_scenario(scenario))
    assert mismatch is None, mismatch


def test_fi034_cash_dependency_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-034-cash-dependency")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "cash_dependency"
    )
    assert observation.evidence["finding_focus"] == "cash_dependency"
    assert observation.evidence["reliance_backed"] is True
    assert observation.evidence["cash_withdrawal_count"] == 3
    assert observation.evidence["cash_withdrawal_total"] == Decimal("600.00")
    assert observation.evidence["spending_total"] == Decimal("600.00")
    assert observation.evidence["cash_withdrawal_share"] == Decimal("1")
    assert observation.evidence["atm_fee_count"] == 3
    assert observation.evidence["atm_fee_total"] == Decimal("60.00")
    assert observation.description == (
        "Cash withdrawals represent a meaningful share of observed spending."
    )
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "cash_usage_leak")
    assert leak.evidence["finding_focus"] == "atm_withdrawal_fee_stacking"

    negative = load_intelligence_scenario("FI-034-no-cash-withdrawals")
    negative_evaluation = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_evaluation) is None
    assert "cash_dependency" not in negative_evaluation.behavior_types

    impulse = evaluate_intelligence_scenario(
        load_intelligence_scenario("FI-031-impulse-spending-pattern")
    )
    assert "cash_dependency" not in impulse.behavior_types
    payday = evaluate_intelligence_scenario(
        load_intelligence_scenario("FI-033-payday-spending-pattern")
    )
    assert "payday_spending_pattern" in payday.behavior_types
    assert "cash_dependency" not in payday.behavior_types


def test_fi035_airtime_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-035-airtime-inefficiency")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "airtime_data_leak")
    assert leak.evidence["finding_focus"] == "airtime_inefficiency"
    assert leak.evidence["airtime_transaction_count"] == 7
    assert leak.evidence["airtime_total"] == Decimal("460.00")
    assert leak.evidence["merchant_key"] == "MTN"
    assert leak.description.startswith(
        "Airtime spending increased over the analysed period and may warrant review."
    )
    assert "subscription_leak" not in evaluation.leak_types

    negative = load_intelligence_scenario("FI-035-minimal-airtime")
    negative_evaluation = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_evaluation) is None
    assert "airtime_data_leak" not in negative_evaluation.leak_types


def test_fi036_data_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-036-mobile-data-inefficiency")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "airtime_data_leak")
    assert leak.evidence["finding_focus"] == "data_inefficiency"
    assert leak.evidence["data_transaction_count"] == 5
    assert leak.evidence["data_total"] == Decimal("625.00")
    assert leak.evidence["merchant_key"] == "VODACOM"
    assert leak.description.startswith(
        "Mobile data spending increased over the analysed period and may warrant review."
    )
    assert all(
        item.evidence.get("finding_focus") != "airtime_inefficiency" for item in evaluation.leaks.leaks
    )
    assert "subscription_leak" not in evaluation.leak_types
    negative = load_intelligence_scenario("FI-036-flat-mobile-data")
    negative_evaluation = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_evaluation) is None
    assert "recurring_payment_leak" not in negative_evaluation.leak_types
    assert "subscription_leak" not in negative_evaluation.leak_types


def test_fi037_ride_hailing_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-037-ride-hailing-dependency")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "transport_spending_leak")
    assert leak.evidence["finding_focus"] == "ride_hailing_dependency"
    assert leak.evidence["ride_hailing_transaction_count"] == 4
    assert leak.evidence["ride_hailing_total"] == Decimal("600.00")
    assert leak.evidence["merchant_key"] == "UBER"
    assert leak.description.startswith(
        "Ride-hailing spending increased over the analysed period and may warrant review."
    )
    assert "subscription_leak" not in evaluation.leak_types

    single = load_intelligence_scenario("FI-037-single-ride-hail")
    single_evaluation = evaluate_intelligence_scenario(single)
    assert expectation_mismatch(single, single_evaluation) is None
    assert all(
        item.evidence.get("finding_focus") != "ride_hailing_dependency"
        for item in single_evaluation.leaks.leaks
    )


def test_fi038_food_delivery_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-038-food-delivery-dependency")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "food_spending_leak")
    assert leak.evidence["finding_focus"] == "food_delivery_dependency"
    assert leak.evidence["food_delivery_transaction_count"] == 7
    assert leak.evidence["food_delivery_total"] == Decimal("1560.00")
    assert leak.evidence["merchant_key"] == "UBER EATS"
    assert leak.description.startswith(
        "Food delivery spending increased over the analysed period and may warrant review."
    )
    assert "subscription_leak" not in evaluation.leak_types
    assert all(
        item.evidence.get("finding_focus") != "ride_hailing_dependency" for item in evaluation.leaks.leaks
    )

    single = load_intelligence_scenario("FI-038-single-food-delivery")
    single_evaluation = evaluate_intelligence_scenario(single)
    assert expectation_mismatch(single, single_evaluation) is None


def test_fi039_merchant_price_increase_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-039-merchant-price-increase")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert observation.evidence["finding_focus"] == "merchant_price_increase"
    assert observation.evidence["merchant_key"] == "STEERS"
    assert observation.evidence["first_amount"] == Decimal("120.00")
    assert observation.evidence["latest_amount"] == Decimal("220.00")
    assert observation.evidence["change_amount"] == Decimal("80.00")
    assert observation.evidence["observation_count"] == 3
    assert "subscription_leak" not in evaluation.leak_types
    assert "food_spending_leak" not in evaluation.leak_types

    flat = load_intelligence_scenario("FI-039-flat-merchant-prices")
    flat_evaluation = evaluate_intelligence_scenario(flat)
    assert expectation_mismatch(flat, flat_evaluation) is None


def test_fi032_weekend_spike_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-032-weekend-spending-spike")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "weekend_spending_pattern"
    )
    assert observation.evidence["finding_focus"] == "weekend_spending_spike"
    assert observation.evidence["weekend_transaction_count"] == 6
    assert observation.evidence["dated_spending_transaction_count"] == 12
    assert observation.evidence["weekend_spending_total"] == Decimal("2100.00")
    assert observation.evidence["weekday_spending_total"] == Decimal("600.00")
    assert observation.description == (
        "Spending was concentrated on weekends during the analysed period."
    )
    assert "impulse_spending_pattern" not in {
        item.evidence.get("finding_focus") for item in evaluation.behaviours.observations
    }
    assert evaluation.leak_types == ()

    impulse = evaluate_intelligence_scenario(
        load_intelligence_scenario("FI-031-impulse-spending-pattern")
    )
    assert "weekend_spending_spike" not in {
        item.evidence.get("finding_focus") for item in impulse.behaviours.observations
    }
    assert "impulse_spending_pattern" not in {
        item.evidence.get("finding_focus") for item in impulse.behaviours.observations
    }


def test_fi033_payday_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-033-payday-spending-pattern")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "payday_spending_pattern"
    )
    assert observation.evidence["finding_focus"] == "payday_spending_pattern"
    assert observation.evidence["income_event_count"] == 3
    assert observation.evidence["income_event_dates"] == [
        date(2026, 7, 25),
        date(2026, 8, 25),
        date(2026, 9, 25),
    ]
    assert observation.evidence["eligible_spending_transaction_count"] == 11
    assert observation.evidence["post_income_spending_transaction_count"] == 9
    assert observation.evidence["window_days"] == 3
    assert observation.evidence["post_income_spending_total"] == Decimal("4050.00")
    assert observation.description == (
        "Spending was concentrated shortly after income was received during the analysed period."
    )
    assert "spending_increase" not in evaluation.behavior_types
    focuses = {
        item.evidence.get("finding_focus") for item in evaluation.behaviours.observations
    }
    assert "weekend_spending_spike" in focuses
    assert "impulse_spending_pattern" not in focuses
    # Payday fixtures use grocery/shopping cadence; that is not a recurring-bill signal.
    assert "recurring_payment_pattern" not in evaluation.behavior_types

    even_scenario = load_intelligence_scenario("FI-033-even-spending-across-month")
    even = evaluate_intelligence_scenario(even_scenario)
    assert expectation_mismatch(even_scenario, even) is None
    assert "payday_spending_pattern" not in even.behavior_types

    impulse = evaluate_intelligence_scenario(
        load_intelligence_scenario("FI-031-impulse-spending-pattern")
    )
    assert "payday_spending_pattern" not in {
        item.evidence.get("finding_focus") for item in impulse.behaviours.observations
    }


def test_fi031_shopping_spike_is_not_an_impulse_finding() -> None:
    scenario = load_intelligence_scenario("FI-031-impulse-spending-pattern")
    assert scenario.spec.case_kind == "negative"
    assert scenario.spec.enforce_expectation is True
    assert scenario.spec.expected.detected is False
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    assert "spending_increase" not in evaluation.behavior_types
    focuses = {
        item.evidence.get("finding_focus")
        for item in evaluation.behaviours.observations
    }
    assert "impulse_spending_pattern" not in focuses
    # Adjacent-day same-amount shopping is a legitimate repeat, not a duplicate pattern.
    assert "duplicate_payment_pattern" not in evaluation.behavior_types
    assert "food_spending_leak" not in evaluation.leak_types


def test_fi031_stable_shopping_does_not_increase() -> None:
    scenario = load_intelligence_scenario("FI-031-stable-shopping")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    assert "spending_increase" not in evaluation.behavior_types


def test_fi030_convenience_store_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-030-convenience-store-leakage")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.evidence.get("finding_focus") == "convenience_store_spending"
    )
    assert observation.behavior_type == "spending_habit_pattern"
    assert observation.evidence.get("merchant_key") == "SPAR EXPRESS"
    leak = next(
        item
        for item in evaluation.leaks.leaks
        if item.leak_type == "convenience_store_leak"
    )
    assert leak.evidence.get("finding_focus") == "convenience_store_spending"
    assert leak.evidence.get("merchant_key") == "SPAR EXPRESS"
    assert leak.evidence.get("convenience_store_transaction_count") == 10
    assert "food_spending_leak" not in evaluation.leak_types
    assert "unnecessary" in observation.description


def test_fi028_coffee_spending_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-028-coffee-spending-pattern")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "coffee_spending_leak"
    )
    assert leak.evidence["finding_focus"] == "coffee_spending_habit"
    assert leak.evidence["coffee_transaction_count"] == 8
    assert leak.evidence["coffee_total_amount"] == Decimal("394.00")
    assert leak.evidence["merchant_key"] == "SEATTLE COFFEE"
    assert "subscription_leak" not in evaluation.leak_types
    assert "food_spending_leak" not in evaluation.leak_types

    negative = load_intelligence_scenario("FI-028-occasional-coffee")
    negative_eval = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_eval) is None
    assert "coffee_spending_leak" not in negative_eval.leak_types


def test_fi024_duplicate_debit_orders_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-024-duplicate-debit-orders")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item
        for item in evaluation.leaks.leaks
        if item.leak_type == "duplicate_debit_order_leak"
    )
    assert leak.evidence["finding_focus"] == "duplicate_debit_order"
    assert leak.evidence["merchant_key"] == "OUTSURANCE"
    assert leak.evidence["candidate_amount"] == Decimal("850.00")
    assert leak.evidence["recurring_debit_order_months"] == 3
    assert leak.evidence["verification_required"] is True
    assert "duplicate_payment_leak" not in evaluation.leak_types

    negative = load_intelligence_scenario("FI-024-separate-policies-not-duplicate")
    negative_eval = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_eval) is None
    assert "duplicate_debit_order_leak" not in negative_eval.leak_types


def test_fi017_duplicate_streaming_services_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-017-duplicate-streaming-services")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item
        for item in evaluation.leaks.leaks
        if item.leak_type == "duplicate_streaming_leak"
    )
    assert leak.evidence["finding_focus"] == "duplicate_streaming_services"
    assert leak.evidence["streaming_subcategory"] == "video_streaming"
    assert leak.evidence["active_streaming_service_count"] == 2
    assert set(leak.evidence["streaming_merchants"]) == {"NETFLIX", "SHOWMAX"}
    assert leak.evidence["combined_monthly_streaming_spend"] == Decimal("298.00")
    assert leak.evidence["overlapping_month_count"] == 3

    negative = load_intelligence_scenario("FI-017-mixed-video-and-music-not-duplicate")
    negative_eval = evaluate_intelligence_scenario(negative)
    assert expectation_mismatch(negative, negative_eval) is None
    assert "duplicate_streaming_leak" not in negative_eval.leak_types


def test_fi029_fast_food_scenario_is_food_spending_not_coffee() -> None:
    scenario = load_intelligence_scenario("FI-029-fast-food-escalation")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    assert "food_spending_leak" in evaluation.leak_types
    assert "spending_habit_pattern" not in evaluation.behavior_types


def test_fi026_irregular_debit_order_is_not_a_frequency_change() -> None:
    scenario = load_intelligence_scenario("edge-irregular-debit-order-interval")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    assert "frequency_change_pattern" not in evaluation.behavior_types


def test_fi025_increased_debit_order_amounts_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-025-increased-debit-order-amounts")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert observation.evidence.get("finding_focus") == "debit_order_amount_increase"
    assert observation.evidence.get("merchant_key") == "CITY OF JHB"
    assert "overcharging" in observation.description.lower()


def test_fi023_debit_order_zombie_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-023-debit-order-zombie-gym")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item
        for item in evaluation.leaks.leaks
        if item.leak_type == "unknown_recurring_payment"
    )
    assert leak.evidence.get("finding_focus") == "debit_order_review"
    assert leak.title == "Potential debit order at Virgin Active that may warrant review"
    assert "unused" not in leak.description.lower()


def test_fi018_subscription_price_creep_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-018-subscription-price-creep")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    observation = next(
        item
        for item in evaluation.behaviours.observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert observation.evidence.get("finding_focus") == "subscription_price_creep"
    assert observation.evidence.get("merchant_key") == "NETFLIX"
    assert "official price change" in observation.description.lower()


def test_fi016_forgotten_subscription_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-016-forgotten-showmax-subscription")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "subscription_leak"
    )
    assert leak.evidence.get("finding_focus") == "subscription_review"
    assert "forgotten" not in leak.description.lower()


def test_fi015_monthly_banking_fee_trend_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-015-monthly-banking-fee-trend")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "bank_fee_leak"
    )
    assert leak.evidence.get("finding_focus") == "monthly_banking_fee_trend"
    assert leak.evidence.get("completed_month_count") == 3
    assert leak.evidence.get("fee_change_amount") is not None


def test_fi013_sms_banking_charges_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-013-sms-banking-charges")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "bank_fee_leak"
    )
    assert leak.evidence.get("finding_focus") == "sms_banking"
    assert "recurring_payment_leak" not in evaluation.leak_types


def test_fi005_balance_enquiry_charges_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-005-balance-enquiry-charges")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "bank_fee_leak"
    )
    assert leak.evidence.get("finding_focus") == "atm_balance_enquiry"
    assert "recurring_payment_leak" not in evaluation.leak_types


def test_fi004_atm_withdrawal_fee_stacking_scenario_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-004-atm-withdrawal-fee-stacking")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(
        item for item in evaluation.leaks.leaks if item.leak_type == "cash_usage_leak"
    )
    assert leak.evidence.get("finding_focus") == "atm_withdrawal_fee_stacking"
    assert leak.evidence.get("atm_fee_count") == 3
    assert "recurring_payment_leak" not in evaluation.leak_types


def test_fi042_recurring_card_fee_change_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-042-recurring-card-fee-change")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "recurring_merchant_fee_change"
    assert leak.evidence["card_fee_transaction_count"] == 3
    assert leak.evidence["previous_amount"] == Decimal("30.00")
    assert leak.evidence["current_amount"] == Decimal("45.00")
    assert leak.evidence["change_percentage"] == Decimal("50")
    assert leak.evidence["months_compared"] == 3
    assert "merchant_price_increase" not in {
        item.evidence.get("finding_focus") for item in evaluation.behaviours.observations
    }
    assert "duplicate_payment_leak" not in evaluation.leak_types

    flat = load_intelligence_scenario("FI-042-flat-card-fee")
    flat_evaluation = evaluate_intelligence_scenario(flat)
    assert expectation_mismatch(flat, flat_evaluation) is None


def test_fi040_duplicate_merchant_payment_matches_pipeline() -> None:
    scenario = load_intelligence_scenario("FI-040-duplicate-merchant-payment")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    leak = next(item for item in evaluation.leaks.leaks if item.leak_type == "duplicate_payment_leak")
    assert leak.evidence["finding_focus"] == "duplicate_merchant_payment"
    assert leak.evidence["merchant_key"] == "WOOLWORTHS"
    assert leak.evidence["candidate_amount"] == Decimal("186.40")
    assert leak.evidence["transaction_count_in_group"] == 2
    assert leak.evidence["group_total"] == Decimal("372.80")
    assert leak.evidence["observed_date"] == "2026-07-18"
    assert leak.evidence["date_span_days"] == 0
    assert "transaction_ids" not in leak.evidence
    assert "fraud" not in leak.description.lower()
    assert "price_increase_pattern" not in evaluation.behavior_types
    assert "subscription_leak" not in evaluation.leak_types

    lookalike = load_intelligence_scenario("next-day-lookalike-payment")
    lookalike_evaluation = evaluate_intelligence_scenario(lookalike)
    assert expectation_mismatch(lookalike, lookalike_evaluation) is None
    assert all(
        item.evidence.get("finding_focus") != "duplicate_merchant_payment"
        for item in lookalike_evaluation.leaks.leaks
    )


def test_fi054_duplicate_charges_use_the_existing_duplicate_payment() -> None:
    scenario = load_intelligence_scenario("FI-054-duplicate-charges-same-day")
    evaluation = evaluate_intelligence_scenario(scenario)
    mismatch = expectation_mismatch(scenario, evaluation)
    assert mismatch is None, mismatch
    duplicates = [
        item for item in evaluation.leaks.leaks if item.leak_type == "duplicate_payment_leak"
    ]
    assert len(duplicates) == 1
    leak = duplicates[0]
    assert leak.evidence["finding_focus"] == "duplicate_merchant_payment"
    assert leak.evidence["merchant_key"] == "CNA"
    assert leak.evidence["candidate_amount"] == Decimal("250.00")
    assert leak.evidence["transaction_count_in_group"] == 2
    assert leak.evidence["group_total"] == Decimal("500.00")
    assert leak.evidence["observed_date"] == "2026-07-14"
    assert leak.evidence["date_span_days"] == 0
    assert "transaction_ids" not in leak.evidence
    assert "fraud" not in leak.description.lower()
    assert all(
        item.evidence.get("finding_focus") != "duplicate_charge" for item in evaluation.leaks.leaks
    )

    consecutive = load_intelligence_scenario("FI-054-no-duplicate-charge")
    consecutive_evaluation = evaluate_intelligence_scenario(consecutive)
    assert expectation_mismatch(consecutive, consecutive_evaluation) is None
    assert all(
        item.evidence.get("finding_focus") != "duplicate_merchant_payment"
        for item in consecutive_evaluation.leaks.leaks
    )


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
    [
        scenario.scenario_id
        for scenario in load_all_intelligence_scenarios()
        if scenario.spec.enforce_expectation
    ],
)
def test_enforced_scenario_expectation_matches_current_pipeline(scenario_id: str) -> None:
    scenario = load_intelligence_scenario(scenario_id)
    mismatch = expectation_mismatch(scenario, evaluate_intelligence_scenario(scenario))
    assert mismatch is None, mismatch


def test_catalogue_scenarios_evaluate_without_error() -> None:
    for scenario in load_all_intelligence_scenarios():
        evaluation = evaluate_intelligence_scenario(scenario)
        assert evaluation.leaks.user_id == SYNTHETIC_USER_ID


def test_catalogue_coverage_is_recorded() -> None:
    scenarios = load_all_intelligence_scenarios()
    rows = catalogue_coverage_rows()
    assert len(rows) == len(scenarios)
    enforced = {
        scenario.scenario_id
        for scenario in scenarios
        if scenario.spec.enforce_expectation
    }
    mismatches = [
        row.mismatch for row in rows if row.scenario_id in enforced and row.mismatch
    ]
    assert mismatches == []
    gaps = json.loads((DATASET_ROOT / "coverage_gaps.json").read_text(encoding="utf-8"))
    deferred = next(item for item in gaps["deferred"] if item["fi_id"] == "FI-031")
    assert deferred["status"] == "DEFERRED"
    assert "impulse intent" in deferred["reason"]
    covered = next(
        item for item in gaps["covered_by_another_item"] if item["fi_id"] == "FI-054"
    )
    assert covered["covered_by"] == "FI-040"
    assert gaps["untitled_ids"]
    assert all("name" not in item for item in gaps["untitled_ids"])
