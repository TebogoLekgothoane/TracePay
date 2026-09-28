from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from categorisation.models import CategorisationResult


@dataclass(frozen=True)
class FeatureTransaction:
    """An extracted transaction plus its existing categorisation result."""

    transaction_id: str
    amount: Decimal
    categorisation: CategorisationResult
    description: str = ""
    merchant_name: str | None = None
    transaction_date: date | None = None


class SpendingProfile(BaseModel):
    """Numerical features derived from one set of already categorised transactions."""

    # Basic totals describe the size and shape of the transaction set.
    total_income: Decimal | None = None
    total_spending: Decimal | None = None
    number_of_transactions: int = 0
    average_transaction_amount: Decimal | None = None
    median_transaction_amount: Decimal | None = None
    largest_transaction: Decimal | None = None
    smallest_transaction: Decimal | None = None

    # These maps describe where spending is going without inventing categories.
    spending_by_category: dict[str, Decimal] = Field(default_factory=dict)
    transaction_count_by_category: dict[str, int] = Field(default_factory=dict)
    spending_percentage_by_category: dict[str, Decimal] = Field(default_factory=dict)

    # Small payments and repeated merchants are useful leak signals later.
    small_transaction_count: int | None = None
    small_transaction_total: Decimal | None = None
    recurring_merchant_count: int | None = None
    recurring_payment_count: int | None = None

    # Existing transaction classes provide these totals.
    bank_fee_total: Decimal | None = None
    transfer_total: Decimal | None = None
    savings_total: Decimal | None = None
    cash_withdrawal_total: Decimal | None = None

    # Behavioural features are ratios or rates ready for later models.
    transaction_frequency: Decimal | None = None
    small_transaction_ratio: Decimal | None = None
    category_concentration: Decimal | None = None
    category_variability: Decimal | None = None
    food_spending_ratio: Decimal | None = None
    transport_spending_ratio: Decimal | None = None
    subscription_spending_ratio: Decimal | None = None
    bank_fee_ratio: Decimal | None = None
    cash_withdrawal_ratio: Decimal | None = None
    debt_payment_ratio: Decimal | None = None
    savings_ratio: Decimal | None = None

