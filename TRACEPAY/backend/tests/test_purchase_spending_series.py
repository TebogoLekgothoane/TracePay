"""Purchase-spending series exclude transfers, savings, and bank fees."""

from datetime import date
from decimal import Decimal

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction

_SPENDING_BEHAVIOURS = {
    "spending_increase",
    "spending_decrease",
    "category_growth",
    "category_decline",
    "merchant_spend_increase",
    "merchant_spend_decrease",
}
_NON_PURCHASE_SUBJECTS = {"Transfers", "Savings", "Salary", "Bank Fees", "Investment"}


def _classified(
    transaction_id: str,
    amount: str,
    when: date,
    description: str,
    transaction_type: str = "debit",
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


def _describes_non_purchase_as_spending(behaviours) -> list[str]:
    labels = ("transfer", "savings", "salary", "bank fee", "fixed deposit", "goalsave")
    titles = []
    for observation in behaviours.observations:
        if observation.behavior_type not in _SPENDING_BEHAVIOURS:
            continue
        subject = observation.evidence.get("subject")
        title = observation.title.lower()
        if subject in _NON_PURCHASE_SUBJECTS or any(label in title for label in labels):
            titles.append(observation.title)
    return titles


def test_goalsave_only_does_not_create_a_spending_increase() -> None:
    transactions = [
        _classified("goalsave-7", "1000", date(2026, 7, 26), "Money transferred out from GoalSave"),
        _classified("goalsave-8", "1000", date(2026, 8, 26), "Money transferred out from GoalSave"),
        _classified("goalsave-9", "8000", date(2026, 9, 30), "Money transferred out from GoalSave"),
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"internal_transfer"}
    snapshot, behaviours, leaks = _analyse(transactions)
    behaviour_types = {item.behavior_type for item in behaviours.observations}

    assert snapshot.spending_profile.total_spending is None
    assert snapshot.spending_profile.transfer_total == Decimal("10000")
    assert [month.total_outflow for month in snapshot.months] == [Decimal("0"), Decimal("0"), Decimal("0")]
    assert "Transfers" not in {item.category_name for item in snapshot.categories}
    assert "spending_increase" not in behaviour_types
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}
    assert _describes_non_purchase_as_spending(behaviours) == []


def test_fixed_deposit_increase_is_not_a_spending_escalation() -> None:
    transactions = [
        _classified("deposit-7", "2000", date(2026, 7, 1), "FIXED DEPOSIT CONTRIBUTION"),
        _classified("deposit-8", "2000", date(2026, 8, 1), "FIXED DEPOSIT CONTRIBUTION"),
        _classified("deposit-9", "9000", date(2026, 9, 30), "FIXED DEPOSIT CONTRIBUTION"),
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"savings"}
    snapshot, behaviours, leaks = _analyse(transactions)

    assert snapshot.spending_profile.total_spending is None
    assert snapshot.spending_profile.savings_total == Decimal("13000")
    assert [month.total_outflow for month in snapshot.months] == [Decimal("0"), Decimal("0"), Decimal("0")]
    assert "Savings" not in {item.category_name for item in snapshot.categories}
    assert "spending_increase" not in {item.behavior_type for item in behaviours.observations}
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}
    assert _describes_non_purchase_as_spending(behaviours) == []


def test_increasing_bank_fees_stay_on_the_fee_path() -> None:
    transactions = [
        _classified("fee-7", "20", date(2026, 7, 2), "MONTHLY ACCOUNT FEE"),
        _classified("fee-8", "20", date(2026, 8, 2), "MONTHLY ACCOUNT FEE"),
        _classified("fee-9", "80", date(2026, 9, 30), "MONTHLY ACCOUNT FEE"),
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"bank_fee"}
    snapshot, behaviours, leaks = _analyse(transactions)
    behaviour_types = {item.behavior_type for item in behaviours.observations}
    fee_leak = next(item for item in leaks.leaks if item.leak_type == "bank_fee_leak")

    assert snapshot.spending_profile.total_spending is None
    assert snapshot.fees.bank_fee_total == Decimal("120")
    assert [month.bank_fee_total for month in snapshot.months] == [
        Decimal("20"),
        Decimal("20"),
        Decimal("80"),
    ]
    assert [month.total_outflow for month in snapshot.months] == [Decimal("0"), Decimal("0"), Decimal("0")]
    assert "Bank Fees" not in {item.category_name for item in snapshot.categories}
    assert "fee_accumulation" in behaviour_types
    assert "spending_increase" not in behaviour_types
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}
    assert fee_leak.estimated_monthly_impact == Decimal("60")
    assert _describes_non_purchase_as_spending(behaviours) == []


def test_combined_statement_spending_counts_purchases_only() -> None:
    transactions = [
        _classified("salary-7", "22000", date(2026, 7, 25), "SALARY ACME", "credit"),
        _classified("salary-8", "22000", date(2026, 8, 25), "SALARY ACME", "credit"),
        _classified("salary-9", "22000", date(2026, 9, 30), "SALARY ACME", "credit"),
        _classified("goalsave-7", "1000", date(2026, 7, 26), "Money transferred out from GoalSave"),
        _classified("goalsave-8", "1000", date(2026, 8, 26), "Money transferred out from GoalSave"),
        _classified("goalsave-9", "8000", date(2026, 9, 30), "Money transferred out from GoalSave"),
        _classified("deposit-7", "2000", date(2026, 7, 1), "FIXED DEPOSIT CONTRIBUTION"),
        _classified("deposit-8", "2000", date(2026, 8, 1), "FIXED DEPOSIT CONTRIBUTION"),
        _classified("deposit-9", "9000", date(2026, 9, 30), "FIXED DEPOSIT CONTRIBUTION"),
        _classified("netflix-7", "199", date(2026, 7, 5), "NETFLIX"),
        _classified("netflix-8", "199", date(2026, 8, 5), "NETFLIX"),
        _classified("netflix-9", "199", date(2026, 9, 5), "NETFLIX"),
        _classified("fee-7", "65", date(2026, 7, 2), "MONTHLY ACCOUNT FEE"),
        _classified("fee-8", "65", date(2026, 8, 2), "MONTHLY ACCOUNT FEE"),
        _classified("fee-9", "65", date(2026, 9, 2), "MONTHLY ACCOUNT FEE"),
        _classified("shop-7", "100", date(2026, 7, 10), "CHECKERS"),
        _classified("shop-8", "100", date(2026, 8, 10), "CHECKERS"),
        _classified("shop-9", "400", date(2026, 9, 28), "CHECKERS"),
    ]
    snapshot, behaviours, leaks = _analyse(transactions)
    spending_increase = next(
        item for item in behaviours.observations if item.behavior_type == "spending_increase"
    )
    escalation = next(item for item in leaks.leaks if item.leak_type == "spending_escalation_leak")
    subscription = next(item for item in leaks.leaks if item.leak_type == "subscription_leak")

    assert snapshot.spending_profile.total_spending == Decimal("1197")
    assert snapshot.spending_profile.spending_by_category == {
        "Subscriptions": Decimal("597"),
        "Groceries": Decimal("600"),
    }
    assert snapshot.spending_profile.transfer_total == Decimal("10000")
    assert snapshot.spending_profile.savings_total == Decimal("13000")
    assert snapshot.fees.bank_fee_total == Decimal("195")
    assert snapshot.income.income_transaction_count == 3
    assert [month.total_outflow for month in snapshot.months] == [
        Decimal("299"),
        Decimal("299"),
        Decimal("599"),
    ]
    assert {item.category_name for item in snapshot.categories} == {"Subscriptions", "Groceries"}
    assert spending_increase.evidence["change_amount"] == Decimal("300")
    assert escalation.estimated_monthly_impact == Decimal("300")
    assert subscription.evidence["finding_focus"] == "subscription_review"
    assert _describes_non_purchase_as_spending(behaviours) == []


def test_genuine_purchase_increase_still_triggers_spending_escalation() -> None:
    transactions = [
        _classified("shop-7", "100", date(2026, 7, 10), "CHECKERS"),
        _classified("shop-8", "100", date(2026, 8, 10), "CHECKERS"),
        _classified("shop-9", "400", date(2026, 9, 30), "CHECKERS"),
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"spending"}
    snapshot, behaviours, leaks = _analyse(transactions)
    spending_increase = next(
        item for item in behaviours.observations if item.behavior_type == "spending_increase"
    )
    escalation = next(item for item in leaks.leaks if item.leak_type == "spending_escalation_leak")

    assert snapshot.spending_profile.total_spending == Decimal("600")
    assert [month.total_outflow for month in snapshot.months] == [
        Decimal("100"),
        Decimal("100"),
        Decimal("400"),
    ]
    assert spending_increase.evidence["change_amount"] == Decimal("300")
    assert escalation.estimated_monthly_impact == Decimal("300")
