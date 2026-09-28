from datetime import date
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.service import build_spending_profile


def _result(**overrides: object) -> CategorisationResult:
    payload: dict[str, object] = {
        "category_name": "Groceries",
        "category_confidence": 0.9,
        "transaction_class": "spending",
        "classification_confidence": 0.9,
        "merchant_name": "CHECKERS",
    }
    payload.update(overrides)
    return CategorisationResult.model_validate(payload)


def _transaction(
    transaction_id: str = "tx-1",
    amount: Decimal = Decimal("50.00"),
    categorisation: CategorisationResult | None = None,
    description: str = "CHECKERS SANDTON",
    merchant_name: str | None = "CHECKERS",
    transaction_date: date | None = date(2026, 9, 1),
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        amount=amount,
        categorisation=categorisation or _result(),
        description=description,
        merchant_name=merchant_name,
        transaction_date=transaction_date,
    )


def test_empty_transactions_return_empty_profile() -> None:
    profile = build_spending_profile([])
    assert profile.number_of_transactions == 0
    assert profile.total_spending is None
    assert profile.spending_by_category == {}


def test_profile_uses_existing_categories_without_inventing_them() -> None:
    profile = build_spending_profile(
        [
            _transaction(),
            _transaction(
                transaction_id="tx-2",
                amount=Decimal("120.00"),
                categorisation=_result(category_name="Subscriptions", merchant_name="NETFLIX"),
                description="NETFLIX",
                merchant_name="NETFLIX",
                transaction_date=date(2026, 9, 2),
            ),
            _transaction(
                transaction_id="tx-3",
                amount=Decimal("2000.00"),
                categorisation=_result(
                    category_name="Salary",
                    transaction_class="income",
                    merchant_name=None,
                ),
                description="SALARY",
                merchant_name=None,
                transaction_date=date(2026, 9, 3),
            ),
        ]
    )

    assert profile.number_of_transactions == 3
    assert profile.total_income == Decimal("2000.00")
    assert profile.total_spending == Decimal("170.00")
    assert profile.spending_by_category["Groceries"] == Decimal("50.00")
    assert profile.spending_by_category["Subscriptions"] == Decimal("120.00")
    assert "Salary" not in profile.spending_by_category
    assert profile.subscription_spending_ratio == Decimal("120.00") / Decimal("170.00")
