"""Recurring-payment detection must ignore income, own-account transfers, and savings."""

from datetime import date
from decimal import Decimal

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.merchant_display import is_reliable_merchant_display_name
from leak_intelligence.models import FeatureTransaction

_RECURRING_LEAK_TYPES = {
    "recurring_payment_leak",
    "subscription_leak",
    "unknown_recurring_payment",
}


def _classified(
    transaction_id: str,
    amount: str,
    when: date,
    description: str,
    transaction_type: str,
) -> FeatureTransaction:
    categorisation = classify_transaction(description, transaction_type)
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=categorisation.merchant_name,
        description=description,
        transaction_type=transaction_type,  # type: ignore[arg-type]
        categorisation=categorisation,
    )


def _analyse(transactions: list[FeatureTransaction]):
    snapshot = build_financial_features("user-a", transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    return snapshot, behaviours, leaks


def test_salary_credits_are_income_and_not_recurring_payments() -> None:
    transactions = [
        _classified("salary-1", "25000", date(2026, 7, 25), "SALARY ACME", "credit"),
        _classified("salary-2", "25000", date(2026, 8, 25), "SALARY ACME", "credit"),
        _classified("salary-3", "18000", date(2026, 9, 25), "SALARY ACME", "credit"),
        _classified("groceries", "400", date(2026, 8, 10), "CHECKERS", "debit"),
    ]
    assert {item.categorisation.transaction_class for item in transactions[:3]} == {"income"}
    snapshot, behaviours, leaks = _analyse(transactions)
    behaviour_types = {item.behavior_type for item in behaviours.observations}

    assert snapshot.spending_profile.total_spending == Decimal("400")
    assert snapshot.income.income_transaction_count == 3
    assert snapshot.income.estimated_payday_interval is not None
    assert "income_pattern" in behaviour_types
    assert "recurring_payment_pattern" not in behaviour_types
    assert _RECURRING_LEAK_TYPES.isdisjoint(item.leak_type for item in leaks.leaks)


def test_goalsave_transfers_are_not_recurring_payments() -> None:
    transactions = [
        _classified(
            f"goalsave-{month}",
            "2000",
            date(2026, month, 26),
            "Money transferred out from GoalSave",
            "debit",
        )
        for month in (7, 8, 9)
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"internal_transfer"}
    snapshot, behaviours, leaks = _analyse(transactions)

    assert snapshot.spending_profile.total_spending is None
    assert snapshot.spending_profile.transfer_total == Decimal("6000")
    assert "recurring_payment_pattern" not in {
        item.behavior_type for item in behaviours.observations
    }
    assert _RECURRING_LEAK_TYPES.isdisjoint(item.leak_type for item in leaks.leaks)


def test_fixed_deposit_contributions_are_not_recurring_payments() -> None:
    transactions = [
        _classified(
            f"deposit-{month}",
            "5000",
            date(2026, month, 1),
            "FIXED DEPOSIT CONTRIBUTION",
            "debit",
        )
        for month in (7, 8, 9)
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"savings"}
    snapshot, behaviours, leaks = _analyse(transactions)

    assert snapshot.spending_profile.total_spending is None
    assert snapshot.spending_profile.savings_total == Decimal("15000")
    assert "recurring_payment_pattern" not in {
        item.behavior_type for item in behaviours.observations
    }
    assert _RECURRING_LEAK_TYPES.isdisjoint(item.leak_type for item in leaks.leaks)


def test_netflix_debits_remain_a_recurring_subscription() -> None:
    transactions = [
        _classified(f"netflix-{month}", "199", date(2026, month, 5), "NETFLIX", "debit")
        for month in (7, 8, 9)
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"spending"}
    assert {item.categorisation.category_name for item in transactions} == {"Subscriptions"}
    snapshot, behaviours, leaks = _analyse(transactions)
    subscription = next(item for item in leaks.leaks if item.leak_type == "subscription_leak")

    assert snapshot.spending_profile.total_spending == Decimal("597")
    assert "recurring_payment_pattern" in {
        item.behavior_type for item in behaviours.observations
    }
    assert subscription.evidence["finding_focus"] == "subscription_review"
    assert subscription.estimated_monthly_impact > 0


def test_card_purchase_prefix_keeps_the_recognised_merchant_key() -> None:
    description = "PURCHASE: WITH CARD AT EPOS AT MR D FOOD"
    transactions = [
        _classified(f"mr-d-{index}", "174.70", when, description, "debit")
        for index, when in enumerate(
            (date(2026, 5, 18), date(2026, 6, 1), date(2026, 6, 15)),
            start=1,
        )
    ]
    checkers = _classified(
        "checkers",
        "40.00",
        date(2026, 6, 2),
        "PURCHASE: WITH CARD AT EPOS AT CHECKERS",
        "debit",
    )
    assert {item.description for item in transactions} == {description}
    assert {item.categorisation.category_name for item in transactions} == {"Fast Food"}
    assert {item.categorisation.rule for item in transactions} == {"merchant:food-delivery"}
    snapshot, behaviours, leaks = _analyse([*transactions, checkers])
    merchant_names = {item.merchant_name for item in snapshot.merchants}
    mr_d = next(item for item in snapshot.merchants if item.merchant_name == "MR D")

    assert "MR D" in merchant_names
    assert "CHECKERS" in merchant_names
    assert "WITH CARD AT" not in merchant_names
    assert mr_d.merchant_transaction_count == 3
    assert is_reliable_merchant_display_name("MR D")
    # Fast-food repeats are shopping cadence, not a recurring bill/subscription.
    assert "recurring_payment_leak" not in {item.leak_type for item in leaks.leaks}
    assert not any(
        item.behavior_type == "recurring_payment_pattern"
        and item.evidence.get("merchant_key") == "MR D"
        for item in behaviours.observations
    )
