from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from categorisation.models import CategorisationResult


@dataclass(frozen=True)
class FeatureTransaction:
    """An extracted transaction plus its existing categorisation result."""

    transaction_id: str
    user_id: str
    amount: Decimal
    categorisation: CategorisationResult
    description: str = ""
    merchant_name: str | None = None
    transaction_date: date | None = None
    transaction_type: Literal["debit", "credit"] | None = None
    is_duplicate: bool = False


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


class ConfidenceSupport(BaseModel):
    supporting_transaction_count: int = 0
    high_confidence_transaction_count: int = 0
    low_confidence_transaction_count: int = 0


class AmountTrend(BaseModel):
    first_amount: Decimal | None = None
    latest_amount: Decimal | None = None
    average_previous_amount: Decimal | None = None
    amount_change: Decimal | None = None
    percentage_change: Decimal | None = None


class RecurrenceFeature(BaseModel):
    observation_count: int = 0
    average_interval_days: Decimal | None = None
    interval_variance: Decimal | None = None
    average_amount: Decimal | None = None
    amount_variance: Decimal | None = None
    recurrence_strength: Literal["none", "low", "medium", "high"] = "none"


class MerchantFeature(BaseModel):
    merchant_name: str
    merchant_transaction_count: int
    merchant_total_amount: Decimal
    merchant_average_amount: Decimal
    merchant_min_amount: Decimal
    merchant_max_amount: Decimal
    merchant_amount_variance: Decimal | None = None
    merchant_first_transaction_date: date | None = None
    merchant_last_transaction_date: date | None = None
    merchant_average_interval_days: Decimal | None = None
    merchant_transaction_frequency: Decimal | None = None
    merchant_monthly_totals: dict[str, Decimal] = Field(default_factory=dict)
    merchant_monthly_transaction_count: dict[str, int] = Field(default_factory=dict)
    merchant_category_transaction_count: dict[str, int] = Field(default_factory=dict)
    merchant_amount_trend: AmountTrend | None = None
    merchant_frequency_trend: Decimal | None = None
    recurrence: RecurrenceFeature
    confidence_support: ConfidenceSupport


class CategoryFeature(BaseModel):
    category_name: str
    category_transaction_count: int
    category_total_amount: Decimal
    category_average_amount: Decimal
    category_monthly_total: dict[str, Decimal] = Field(default_factory=dict)
    category_monthly_transaction_count: dict[str, int] = Field(default_factory=dict)
    category_trend: Decimal | None = None
    confidence_support: ConfidenceSupport


class MonthlyFeature(BaseModel):
    month: str
    total_income: Decimal = Decimal("0")
    total_outflow: Decimal = Decimal("0")
    transaction_count: int = 0
    outflow_transaction_count: int = 0
    category_totals: dict[str, Decimal] = Field(default_factory=dict)
    merchant_totals: dict[str, Decimal] = Field(default_factory=dict)
    bank_fee_total: Decimal = Decimal("0")
    cash_withdrawal_total: Decimal = Decimal("0")
    subscription_total: Decimal = Decimal("0")
    transfer_total: Decimal = Decimal("0")


class FeeFeatures(BaseModel):
    bank_fee_transaction_count: int = 0
    bank_fee_total: Decimal = Decimal("0")
    bank_fee_average: Decimal | None = None
    atm_fee_total: Decimal | None = None
    transaction_fee_total: Decimal | None = None
    account_fee_total: Decimal | None = None
    sms_fee_total: Decimal | None = None
    immediate_payment_fee_total: Decimal | None = None


class CashFeatures(BaseModel):
    cash_withdrawal_count: int = 0
    cash_withdrawal_total: Decimal = Decimal("0")
    atm_fee_count: int = 0
    atm_fee_total: Decimal = Decimal("0")
    average_withdrawal_amount: Decimal | None = None


class WeekendSpendingFeatures(BaseModel):
    """Spending totals by calendar grouping; no transaction descriptions retained."""

    dated_spending_transaction_count: int = 0
    weekend_spending_transaction_count: int = 0
    dated_spending_total: Decimal = Decimal("0")
    weekend_spending_total: Decimal = Decimal("0")
    weekend_spending_share: Decimal | None = None


class PaydaySpendingFeatures(BaseModel):
    """Aggregate spending within a neutral post-income observation window."""

    window_days: int = 3
    eligible_income_event_count: int = 0
    eligible_spending_transaction_count: int = 0
    post_income_spending_transaction_count: int = 0
    eligible_spending_total: Decimal = Decimal("0")
    post_income_spending_total: Decimal = Decimal("0")
    post_income_spending_share: Decimal | None = None


class IncomeFeatures(BaseModel):
    income_transaction_count: int = 0
    income_total: Decimal = Decimal("0")
    last_income_date: date | None = None
    average_income_amount: Decimal | None = None
    estimated_payday_interval: Decimal | None = None
    max_income_gap_days: int | None = None
    days_since_last_income: dict[str, int] = Field(default_factory=dict)


class DuplicateCandidate(BaseModel):
    group_key: str
    merchant_name: str
    amount: Decimal
    transaction_ids: list[str]
    transaction_dates: list[date]


class FinancialFeatureSnapshot(BaseModel):
    """A user-scoped collection of financial observations, never leak findings."""

    user_id: str
    transaction_count: int
    date_start: date | None = None
    date_end: date | None = None
    spending_profile: SpendingProfile
    merchants: list[MerchantFeature] = Field(default_factory=list)
    categories: list[CategoryFeature] = Field(default_factory=list)
    months: list[MonthlyFeature] = Field(default_factory=list)
    fees: FeeFeatures
    cash: CashFeatures
    weekend: WeekendSpendingFeatures
    payday: PaydaySpendingFeatures
    income: IncomeFeatures
    duplicate_candidates: list[DuplicateCandidate] = Field(default_factory=list)

