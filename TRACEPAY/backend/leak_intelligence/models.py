from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from categorisation.models import CategorisationResult

from .import_quality import StatementImportQuality


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
    transaction_time: time | None = None
    transaction_type: Literal["debit", "credit"] | None = None
    is_duplicate: bool = False
    statement_id: str | None = None
    balance: Decimal | None = None
    # Provenance. All optional: rows imported before multi-account support, and
    # every existing caller, simply leave them unset.
    account_id: str | None = None
    bank_key: str | None = None
    account_last4: str | None = None
    currency: str | None = None
    reference: str | None = None
    value_date: date | None = None
    booking_date: date | None = None
    # high / medium / low when the extractor recorded it; None when unknown.
    date_confidence: str | None = None
    source_row: int | None = None
    dedupe_status: str = "unique"
    transfer_status: str = "none"
    transfer_pair_id: str | None = None
    transfer_fee_for: str | None = None
    reversal_of: str | None = None


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
    # The payment just before the latest one, and how many times the amount
    # stepped up along the way. A creep shows in these, not in the average.
    previous_amount: Decimal | None = None
    increase_count: int = 0
    average_previous_amount: Decimal | None = None
    amount_change: Decimal | None = None
    percentage_change: Decimal | None = None
    # When the amount first stepped above the opening amount, and what was paid
    # above that opening amount from then on (an actual figure, not a projection).
    first_increase_date: date | None = None
    additional_paid_to_date: Decimal | None = None
    # A single early step (within the first two payments) is more likely an
    # introductory price ending than a price rise.
    promotional_start_possible: bool = False


class RecurrenceFeature(BaseModel):
    observation_count: int = 0
    average_interval_days: Decimal | None = None
    median_interval_days: Decimal | None = None
    interval_variance: Decimal | None = None
    average_amount: Decimal | None = None
    typical_amount: Decimal | None = None
    latest_amount: Decimal | None = None
    observed_amounts: list[Decimal] = Field(default_factory=list)
    amount_variance: Decimal | None = None
    recurrence_strength: Literal["none", "low", "medium", "high"] = "none"
    # "dominant_amount" when the cadence was read from one regular amount inside a
    # mix of charges (a plan plus usage, or a card that bills several things).
    basis: Literal["all_charges", "dominant_amount"] = "all_charges"
    first_date: date | None = None
    last_date: date | None = None
    # Other amounts at the same merchant that also repeat on a steady cycle. Only the
    # chosen series is costed; these are named so nothing regular is hidden.
    other_regular_amounts: list[Decimal] = Field(default_factory=list)
    # The merchant's most repeated amounts and their gaps, when no steady series was found.
    series_note: str | None = None
    baseline_interval_days: Decimal | None = None
    current_interval_days: Decimal | None = None
    interval_change_days: Decimal | None = None
    baseline_interval_count: int = 0
    current_interval_count: int = 0
    # Whole billing cycles with no payment in the data (a missing statement month or
    # a skipped payment). Intervals are measured as if those cycles had been seen,
    # and the count is kept so the gap is never hidden.
    missed_cycle_count: int = 0
    # A first payment well below the price that followed (an introductory offer).
    introductory_amount: Decimal | None = None


class MerchantFeature(BaseModel):
    merchant_name: str
    # Accounts that were charged by this merchant (empty when the rows carry no
    # account). Lets rules reason about coverage on the accounts that matter.
    account_ids: list[str] = Field(default_factory=list)
    # Account of the most recent charge: where the next charge would appear.
    last_account_id: str | None = None
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
    # Subscription rows are kept separate from other activity at the same
    # merchant. A merchant can legitimately contain both a recurring service
    # charge and unrelated purchases, so merchant-wide recurrence is not a
    # safe proxy for the subscription amount or cadence.
    subscription_recurrence: RecurrenceFeature | None = None
    # Further regular amounts at this merchant (an iCloud plan beside another plan),
    # each judged and raised as its own series.
    extra_subscription_series: list[RecurrenceFeature] = Field(default_factory=list)
    failed_payment_attempt_count: int = 0
    failed_payment_attempt_amounts: list[Decimal] = Field(default_factory=list)
    debit_order_transaction_count: int = 0
    # Typical amount of each separate mandate or policy when the merchant is
    # debited under two or more of them, each recurring on its own.
    parallel_mandate_amounts: list[Decimal] = Field(default_factory=list)
    insurance_transaction_count: int = 0
    coffee_transaction_count: int = 0
    coffee_total_amount: Decimal = Decimal("0")
    convenience_store_transaction_count: int = 0
    convenience_store_total_amount: Decimal = Decimal("0")
    airtime_transaction_count: int = 0
    airtime_only: bool = False
    data_transaction_count: int = 0
    data_only: bool = False
    ride_hailing_transaction_count: int = 0
    ride_hailing_only: bool = False
    food_delivery_transaction_count: int = 0
    food_delivery_only: bool = False
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
    # The single largest purchase in each month, so a rise caused by one purchase
    # can be told apart from a broad rise in spending.
    category_monthly_max_amount: dict[str, Decimal] = Field(default_factory=dict)
    category_trend: Decimal | None = None
    confidence_support: ConfidenceSupport
    airtime_transaction_count: int = 0
    airtime_total_amount: Decimal = Decimal("0")
    airtime_only: bool = False
    data_transaction_count: int = 0
    data_total_amount: Decimal = Decimal("0")
    data_only: bool = False
    ride_hailing_transaction_count: int = 0
    ride_hailing_total_amount: Decimal = Decimal("0")
    ride_hailing_only: bool = False
    food_delivery_transaction_count: int = 0
    food_delivery_total_amount: Decimal = Decimal("0")
    food_delivery_only: bool = False


class MonthlyFeature(BaseModel):
    month: str
    total_income: Decimal = Decimal("0")
    total_outflow: Decimal = Decimal("0")
    transaction_count: int = 0
    outflow_transaction_count: int = 0
    # Outflow from rows with no class and no category: money TracePay cannot explain.
    unclassified_outflow: Decimal = Decimal("0")
    category_totals: dict[str, Decimal] = Field(default_factory=dict)
    merchant_totals: dict[str, Decimal] = Field(default_factory=dict)
    bank_fee_total: Decimal = Decimal("0")
    foreign_transaction_fee_total: Decimal = Decimal("0")
    cash_withdrawal_total: Decimal = Decimal("0")
    subscription_total: Decimal = Decimal("0")
    transfer_total: Decimal = Decimal("0")


class FeeFeatures(BaseModel):
    # Largest fee descriptions (digits stripped) as {"label", "count", "total"}.
    top_fee_sources: list[dict[str, object]] = Field(default_factory=list)
    bank_fee_transaction_count: int = 0
    bank_fee_total: Decimal = Decimal("0")
    bank_fee_average: Decimal | None = None
    atm_fee_total: Decimal | None = None
    transaction_fee_total: Decimal | None = None
    account_fee_total: Decimal | None = None
    sms_fee_total: Decimal | None = None
    immediate_payment_fee_total: Decimal | None = None
    balance_enquiry_fee_total: Decimal | None = None
    card_fee_total: Decimal | None = None
    card_fee_transaction_count: int = 0
    card_fee_high_confidence_count: int = 0
    foreign_transaction_fee_total: Decimal | None = None
    foreign_transaction_fee_count: int = 0
    foreign_transaction_fee_high_confidence_count: int = 0
    interest_charge_total: Decimal | None = None
    interest_charge_count: int = 0
    interest_charge_high_confidence_count: int = 0
    overdraft_fee_total: Decimal | None = None
    overdraft_fee_count: int = 0
    overdraft_fee_high_confidence_count: int = 0
    insufficient_funds_fee_total: Decimal | None = None
    insufficient_funds_fee_count: int = 0
    insufficient_funds_fee_high_confidence_count: int = 0
    insufficient_funds_fee_copies_removed: int = 0
    vas_fee_total: Decimal | None = None
    vas_fee_count: int = 0
    card_replacement_fee_total: Decimal | None = None
    card_replacement_fee_count: int = 0


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
    weekday_spending_total: Decimal = Decimal("0")
    weekend_spending_share: Decimal | None = None
    weekend_calendar_days: int = 0
    weekday_calendar_days: int = 0
    weekend_daily_average: Decimal | None = None
    weekday_daily_average: Decimal | None = None
    discretionary_weekend_transaction_count: int = 0
    discretionary_weekday_transaction_count: int = 0
    discretionary_weekend_total: Decimal = Decimal("0")
    discretionary_weekday_total: Decimal = Decimal("0")
    discretionary_weekend_share: Decimal | None = None
    discretionary_weekend_daily_average: Decimal | None = None
    discretionary_weekday_daily_average: Decimal | None = None
    active_weekend_count: int = 0
    weekend_monthly_totals: dict[str, Decimal] = Field(default_factory=dict)
    discretionary_weekend_monthly_totals: dict[str, Decimal] = Field(default_factory=dict)
    top_weekend_categories: list[str] = Field(default_factory=list)
    top_weekend_merchants: list[str] = Field(default_factory=list)


class PaydaySpendingFeatures(BaseModel):
    """Aggregate spending within a neutral post-income observation window."""

    window_days: int = 3
    eligible_income_event_count: int = 0
    eligible_spending_transaction_count: int = 0
    post_income_spending_transaction_count: int = 0
    eligible_spending_total: Decimal = Decimal("0")
    post_income_spending_total: Decimal = Decimal("0")
    post_income_spending_share: Decimal | None = None
    income_event_dates: list[date] = Field(default_factory=list)
    salary_event_count: int = 0
    salary_event_dates: list[date] = Field(default_factory=list)
    post_salary_spending_total: Decimal = Decimal("0")
    post_salary_discretionary_total: Decimal = Decimal("0")
    post_salary_essential_total: Decimal = Decimal("0")
    post_salary_spending_share: Decimal | None = None
    post_salary_discretionary_transaction_count: int = 0
    outside_salary_window_discretionary_total: Decimal = Decimal("0")
    post_salary_discretionary_share: Decimal | None = None
    salary_cycles_with_discretionary_spike: int = 0
    top_post_salary_discretionary_categories: list[str] = Field(default_factory=list)
    top_post_salary_discretionary_merchants: list[str] = Field(default_factory=list)


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
    high_confidence_transaction_count: int = 0
    distinct_description_count: int = 0
    shared_reference_tokens: bool = False
    nearby_reversal_or_refund: bool = False
    min_time_gap_minutes: int | None = None
    # Set when the payee is not a recognised merchant: rows are grouped by the
    # distinctive words of their description, and no merchant identity is claimed.
    description_signature: str | None = None
    # Widest gap between neighbouring rows; None unless every row has a time.
    max_time_gap_minutes: int | None = None
    category_name: str | None = None
    match_basis: list[str] = Field(default_factory=list)
    is_debit_order: bool = False
    recurring_debit_order_count: int = 0
    recurring_debit_order_months: int = 0
    billing_date_shift_days: int = 0
    amount_variance: Decimal = Decimal("0")


class NearMiss(BaseModel):
    """Something that looked like a finding but was not raised, and the plain reason why.

    For tuning the rules against real statements. It names a merchant, an amount and
    dates, never a description or a transaction id.
    """

    leak_type: str
    reason_code: str
    reason: str
    merchant: str | None = None
    merchant_display_name: str | None = None
    amount: Decimal
    dates: list[date] = Field(default_factory=list)


class TrialConversionCandidate(BaseModel):
    """A subscription whose first paid charge follows a recorded trial.

    Built only from rows that exist: a zero-value record or trial wording in a
    description. Without one of those no candidate is produced.
    """

    merchant_name: str
    trial_evidence: Literal["zero_value_record", "trial_wording"]
    trial_dates: list[date]
    trial_transaction_ids: list[str]
    paid_dates: list[date]
    paid_amounts: list[Decimal]
    paid_transaction_ids: list[str]
    days_from_trial_to_first_paid: int
    amount_stable: bool
    subscription_category: bool


class UnidentifiedRecurringCandidate(BaseModel):
    """Repeated payments to a payee the engine could not identify."""

    description_signature: str
    transaction_ids: list[str]
    dates: list[date]
    amounts: list[Decimal]
    median_interval_days: Decimal
    cadence: Literal["weekly", "fortnightly", "monthly", "bimonthly", "quarterly"]
    high_confidence_transaction_count: int = 0


class PersonPaymentCandidate(BaseModel):
    """Regular payments from the customer to the same recipient.

    The recipient is a one-way hash of the name and number tail the statement
    shows, plus a masked label, so the finding never carries the person's details.
    """

    recipient_key: str
    recipient_label: str
    transaction_ids: list[str]
    dates: list[date]
    amounts: list[Decimal]
    median_interval_days: Decimal
    cadence: Literal["weekly", "fortnightly", "monthly", "bimonthly", "quarterly"]
    amount_stable: bool


class PenaltyFeeCandidate(BaseModel):
    """Penalty charges a provider (not the bank) put on the statement.

    Built only from descriptions that say so: late-payment, reconnection,
    reinstatement or arrears wording. Why the payment was late is not known.
    """

    payee: str
    # True when the payee is a recognised merchant rather than a description signature.
    payee_is_merchant: bool
    wording: list[str]
    transaction_ids: list[str]
    dates: list[date]
    amounts: list[Decimal]


class IrregularCandidate(BaseModel):
    """A transaction that is unusual relative to the user's own history."""

    transaction_id: str
    merchant_name: str | None = None
    amount: Decimal
    transaction_date: date | None = None
    transaction_time: time | None = None
    transaction_description: str = ""
    transaction_type: Literal["debit", "credit"] | None = None
    category_name: str | None = None
    category_transaction_count: int = 0
    baseline_sample_size: int = 0
    category_median_amount: Decimal | None = None
    difference_from_baseline: Decimal | None = None
    amount_multiple_of_category_median: Decimal | None = None
    reason: str


class SubscriptionObservation(BaseModel):
    transaction_id: str
    transaction_date: date | None = None
    amount: Decimal
    outcome: Literal["successful", "failed", "fee", "reversal"]
    fee_amount: Decimal | None = None
    referenced_amount: Decimal | None = None


class SubscriptionGroup(BaseModel):
    """A deterministic merchant/product subscription candidate.

    This is deliberately separate from MerchantFeature: one merchant can bill
    multiple products at different prices and can also have unrelated spend.
    """

    merchant_name: str
    merchant_key: str
    product_key: str
    classification: Literal["fixed", "variable", "one_off"]
    cadence: Literal["weekly", "fortnightly", "monthly", "bimonthly", "quarterly", "biannual", "annual", "irregular"]
    status: Literal["active", "late", "failed_recently", "ended"] = "active"
    cadence_days: Decimal | None = None
    expected_day_of_month: int | None = None
    last_successful_charge: date | None = None
    next_expected_date: date | None = None
    late_payment_count: int = 0
    failed_payment_attempt_count: int = 0
    total_failure_fees: Decimal = Decimal("0")
    current_amount: Decimal | None = None
    amount_history: list[Decimal] = Field(default_factory=list)
    price_history: list[dict[str, object]] = Field(default_factory=list)
    estimated_monthly_cost: Decimal | None = None
    confidence: Literal["low", "medium", "high"] = "low"
    matched_transaction_ids: list[str] = Field(default_factory=list)
    successful_transaction_ids: list[str] = Field(default_factory=list)
    failed_transaction_ids: list[str] = Field(default_factory=list)
    observations: list[SubscriptionObservation] = Field(default_factory=list)
    # Added fields; everything above keeps its original meaning.
    canonical_name: str = ""
    successful_payment_count: int = 0
    price_changes: list[dict[str, object]] = Field(default_factory=list)
    late_payment_dates: list[date] = Field(default_factory=list)
    # Optional LLM label. It never changes amounts, dates, cadence or classes.
    ai_reason: str | None = None
    ai_model: str | None = None
    ai_prompt_version: str | None = None


class FinancialFeatureSnapshot(BaseModel):
    """A user-scoped collection of financial observations, never leak findings."""

    user_id: str
    transaction_count: int
    date_start: date | None = None
    date_end: date | None = None
    # Bounds used for opening/trailing completeness (may incorporate declared dates).
    coverage_observation_start: date | None = None
    coverage_observation_end: date | None = None
    spending_profile: SpendingProfile
    merchants: list[MerchantFeature] = Field(default_factory=list)
    subscriptions: list[SubscriptionGroup] = Field(default_factory=list)
    categories: list[CategoryFeature] = Field(default_factory=list)
    months: list[MonthlyFeature] = Field(default_factory=list)
    fees: FeeFeatures
    cash: CashFeatures
    weekend: WeekendSpendingFeatures
    payday: PaydaySpendingFeatures
    income: IncomeFeatures
    duplicate_candidates: list[DuplicateCandidate] = Field(default_factory=list)
    # Identical purchases a few days apart. Kept apart from the same-day candidates so
    # the stricter rules for them never change how a same-day duplicate is read.
    near_day_duplicate_candidates: list[DuplicateCandidate] = Field(default_factory=list)
    # Look-alikes the feature rules passed over before any finding was built.
    near_misses: list[NearMiss] = Field(default_factory=list)
    irregular_candidates: list[IrregularCandidate] = Field(default_factory=list)
    trial_conversion_candidates: list[TrialConversionCandidate] = Field(default_factory=list)
    unidentified_recurring_candidates: list[UnidentifiedRecurringCandidate] = Field(
        default_factory=list
    )
    penalty_fee_candidates: list[PenaltyFeeCandidate] = Field(default_factory=list)
    person_payment_candidates: list[PersonPaymentCandidate] = Field(default_factory=list)
    # Sanitised statement-import quality; never includes file content or descriptions.
    statement_import_quality: list[StatementImportQuality] = Field(default_factory=list)
    import_ids_by_month: dict[str, list[str]] = Field(default_factory=dict)
    # Last day each account's uploaded statements vouch for. Absence of a charge
    # after that day says nothing about the account.
    account_observation_end: dict[str, date] = Field(default_factory=dict)

