"""Reusable, user-scoped financial feature extraction.

This module describes transaction patterns. It deliberately makes no leak,
duplicate-confirmation, recommendation, or affordability decisions.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from statistics import pvariance

from .common import ZERO, amount_of, merchant_group_key, month_key
from .models import (
    AmountTrend,
    CashFeatures,
    CategoryFeature,
    ConfidenceSupport,
    DuplicateCandidate,
    FeeFeatures,
    FeatureTransaction,
    FinancialFeatureSnapshot,
    IncomeFeatures,
    MerchantFeature,
    MonthlyFeature,
    PaydaySpendingFeatures,
    RecurrenceFeature,
    WeekendSpendingFeatures,
)
from .service import build_spending_profile

HIGH_CONFIDENCE = 0.85
RECURRENCE_MIN_OBSERVATIONS = 3
TREND_MIN_OBSERVATIONS = 3
PAYDAY_MIN_OBSERVATIONS = 3
DUPLICATE_DATE_WINDOW_DAYS = 1
AMOUNT_TOLERANCE = Decimal("0.01")
CASH_WITHDRAWAL_CATEGORIES = {"Cash Withdrawal", "Cash Withdrawals", "ATM Cash Withdrawal"}


def build_financial_features(
    user_id: str,
    transactions: list[FeatureTransaction],
) -> FinancialFeatureSnapshot:
    """Build one user's financial observations from already categorised data."""
    if not user_id:
        raise ValueError("A user id is required for financial feature calculation.")
    active = _active_user_transactions(user_id, transactions)
    dates = [item.transaction_date for item in active if item.transaction_date is not None]
    return FinancialFeatureSnapshot(
        user_id=user_id,
        transaction_count=len(active),
        date_start=min(dates) if dates else None,
        date_end=max(dates) if dates else None,
        spending_profile=build_spending_profile(active),
        merchants=_merchant_features(active),
        categories=_category_features(active),
        months=_monthly_features(active),
        fees=_fee_features(active),
        cash=_cash_features(active),
        weekend=_weekend_features(active),
        payday=_payday_spending_features(active),
        income=_income_features(active),
        duplicate_candidates=_duplicate_candidates(active),
    )


def _active_user_transactions(
    user_id: str, transactions: list[FeatureTransaction]
) -> list[FeatureTransaction]:
    active: list[FeatureTransaction] = []
    for transaction in transactions:
        if transaction.user_id and transaction.user_id != user_id:
            raise ValueError("Transactions from multiple users cannot be combined.")
        if not transaction.is_duplicate:
            active.append(transaction)
    return active


def _confidence_support(transactions: list[FeatureTransaction]) -> ConfidenceSupport:
    high = sum(item.categorisation.classification_confidence >= HIGH_CONFIDENCE for item in transactions)
    return ConfidenceSupport(
        supporting_transaction_count=len(transactions),
        high_confidence_transaction_count=high,
        low_confidence_transaction_count=len(transactions) - high,
    )


def _variance(values: list[Decimal], minimum: int = 2) -> Decimal | None:
    if len(values) < minimum:
        return None
    return Decimal(str(pvariance(values)))


def _average(values: list[Decimal], minimum: int = 1) -> Decimal | None:
    if len(values) < minimum:
        return None
    return sum(values, ZERO) / Decimal(len(values))


def _intervals(transactions: list[FeatureTransaction]) -> list[Decimal]:
    dates = sorted({item.transaction_date for item in transactions if item.transaction_date is not None})
    return [Decimal((later - earlier).days) for earlier, later in zip(dates, dates[1:])]


def _frequency(transactions: list[FeatureTransaction]) -> Decimal | None:
    dates = [item.transaction_date for item in transactions if item.transaction_date is not None]
    if len(dates) < 2:
        return None
    return Decimal(len(transactions)) / Decimal((max(dates) - min(dates)).days + 1)


def _monthly_amounts(
    transactions: list[FeatureTransaction],
) -> tuple[dict[str, Decimal], dict[str, int]]:
    totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    counts: defaultdict[str, int] = defaultdict(int)
    for item in transactions:
        if (month := month_key(item)) is not None:
            totals[month] += amount_of(item)
            counts[month] += 1
    return dict(totals), dict(counts)


def _amount_trend(transactions: list[FeatureTransaction]) -> AmountTrend | None:
    dated = sorted((item for item in transactions if item.transaction_date is not None), key=lambda item: item.transaction_date)
    if len(dated) < TREND_MIN_OBSERVATIONS:
        return None
    previous = [amount_of(item) for item in dated[:-1]]
    average_previous = _average(previous)
    latest = amount_of(dated[-1])
    if average_previous in (None, ZERO):
        return None
    change = latest - average_previous
    return AmountTrend(
        first_amount=amount_of(dated[0]),
        latest_amount=latest,
        average_previous_amount=average_previous,
        amount_change=change,
        percentage_change=(change / average_previous) * Decimal("100"),
    )


def _monthly_trend(monthly_totals: dict[str, Decimal]) -> Decimal | None:
    values = [monthly_totals[key] for key in sorted(monthly_totals)]
    if len(values) < 2:
        return None
    previous_average = _average(values[:-1])
    if previous_average in (None, ZERO):
        return None
    return ((values[-1] - previous_average) / previous_average) * Decimal("100")


def _monthly_frequency_trend(monthly_counts: dict[str, int]) -> Decimal | None:
    values = [monthly_counts[key] for key in sorted(monthly_counts)]
    if len(values) < 2:
        return None
    previous_average = sum(values[:-1]) / Decimal(len(values) - 1)
    if previous_average == ZERO:
        return None
    return ((Decimal(values[-1]) - previous_average) / previous_average) * Decimal("100")


def _recurrence(transactions: list[FeatureTransaction]) -> RecurrenceFeature:
    amounts = [amount_of(item) for item in transactions]
    intervals = _intervals(transactions)
    feature = RecurrenceFeature(
        observation_count=len(transactions),
        average_interval_days=_average(intervals, minimum=1),
        interval_variance=_variance(intervals),
        average_amount=_average(amounts),
        amount_variance=_variance(amounts),
    )
    if len(transactions) < RECURRENCE_MIN_OBSERVATIONS or len(intervals) < 2:
        return feature
    average_interval = feature.average_interval_days
    average_amount = feature.average_amount
    if average_interval in (None, ZERO) or average_amount in (None, ZERO):
        return feature
    interval_cv = (feature.interval_variance or ZERO).sqrt() / average_interval
    amount_cv = (feature.amount_variance or ZERO).sqrt() / average_amount
    if average_interval <= Decimal("400") and interval_cv <= Decimal("0.15") and amount_cv <= Decimal("0.10"):
        feature.recurrence_strength = "high"
    elif average_interval <= Decimal("400") and interval_cv <= Decimal("0.35") and amount_cv <= Decimal("0.25"):
        feature.recurrence_strength = "medium"
    else:
        feature.recurrence_strength = "low"
    return feature


def _merchant_features(transactions: list[FeatureTransaction]) -> list[MerchantFeature]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if (key := merchant_group_key(item)) is not None:
            groups[key].append(item)
    features = []
    for merchant, items in groups.items():
        amounts = [amount_of(item) for item in items]
        monthly_totals, monthly_counts = _monthly_amounts(items)
        dated = [item.transaction_date for item in items if item.transaction_date is not None]
        features.append(
            MerchantFeature(
                merchant_name=merchant,
                merchant_transaction_count=len(items),
                merchant_total_amount=sum(amounts, ZERO),
                merchant_average_amount=_average(amounts) or ZERO,
                merchant_min_amount=min(amounts),
                merchant_max_amount=max(amounts),
                merchant_amount_variance=_variance(amounts),
                merchant_first_transaction_date=min(dated) if dated else None,
                merchant_last_transaction_date=max(dated) if dated else None,
                merchant_average_interval_days=_average(_intervals(items), minimum=1),
                merchant_transaction_frequency=_frequency(items),
                merchant_monthly_totals=monthly_totals,
                merchant_monthly_transaction_count=monthly_counts,
                merchant_amount_trend=_amount_trend(items),
                merchant_frequency_trend=_monthly_frequency_trend(monthly_counts),
                recurrence=_recurrence(items),
                confidence_support=_confidence_support(items),
            )
        )
    return sorted(features, key=lambda feature: (-feature.merchant_total_amount, feature.merchant_name))


def _category_features(transactions: list[FeatureTransaction]) -> list[CategoryFeature]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if category := item.categorisation.category_name:
            groups[category].append(item)
    features = []
    for category, items in groups.items():
        amounts = [amount_of(item) for item in items]
        monthly_totals, monthly_counts = _monthly_amounts(items)
        features.append(
            CategoryFeature(
                category_name=category,
                category_transaction_count=len(items),
                category_total_amount=sum(amounts, ZERO),
                category_average_amount=_average(amounts) or ZERO,
                category_monthly_total=monthly_totals,
                category_monthly_transaction_count=monthly_counts,
                category_trend=_monthly_trend(monthly_totals),
                confidence_support=_confidence_support(items),
            )
        )
    return sorted(features, key=lambda feature: (-feature.category_total_amount, feature.category_name))


def _monthly_features(transactions: list[FeatureTransaction]) -> list[MonthlyFeature]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if (month := month_key(item)) is not None:
            groups[month].append(item)
    features = []
    for month, items in sorted(groups.items()):
        category_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
        merchant_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
        for item in items:
            value = amount_of(item)
            if category := item.categorisation.category_name:
                category_totals[category] += value
            if merchant := merchant_group_key(item):
                merchant_totals[merchant] += value
        features.append(
            MonthlyFeature(
                month=month,
                total_income=sum((amount_of(item) for item in items if item.categorisation.transaction_class == "income"), ZERO),
                total_outflow=sum(
                    (
                        amount_of(item)
                        for item in items
                        if item.transaction_type == "debit"
                        or (item.transaction_type is None and item.categorisation.transaction_class != "income")
                    ),
                    ZERO,
                ),
                transaction_count=len(items),
                category_totals=dict(category_totals),
                merchant_totals=dict(merchant_totals),
                bank_fee_total=sum((amount_of(item) for item in items if item.categorisation.transaction_class == "bank_fee"), ZERO),
                cash_withdrawal_total=sum((amount_of(item) for item in items if _is_cash_withdrawal(item)), ZERO),
                subscription_total=sum((amount_of(item) for item in items if item.categorisation.category_name == "Subscriptions"), ZERO),
                transfer_total=sum(
                    (amount_of(item) for item in items if item.categorisation.transaction_class in {"internal_transfer", "person_to_person"}),
                    ZERO,
                ),
            )
        )
    return features


def _fee_subtype(transaction: FeatureTransaction) -> str | None:
    if transaction.categorisation.transaction_class != "bank_fee":
        return None
    description = transaction.description.upper()
    if "ATM FEE" in description:
        return "atm"
    if "IMMEDIATE PAYMENT" in description:
        return "immediate_payment"
    if "SMS" in description or "NOTIFICATION" in description:
        return "sms"
    if "ACCOUNT" in description or "MONTHLY FEE" in description:
        return "account"
    if "TRANSACTION FEE" in description:
        return "transaction"
    return None


def _fee_features(transactions: list[FeatureTransaction]) -> FeeFeatures:
    fees = [item for item in transactions if item.categorisation.transaction_class == "bank_fee"]
    amounts = [amount_of(item) for item in fees]
    totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in fees:
        if subtype := _fee_subtype(item):
            totals[subtype] += amount_of(item)
    return FeeFeatures(
        bank_fee_transaction_count=len(fees),
        bank_fee_total=sum(amounts, ZERO),
        bank_fee_average=_average(amounts),
        atm_fee_total=totals["atm"] or None,
        transaction_fee_total=totals["transaction"] or None,
        account_fee_total=totals["account"] or None,
        sms_fee_total=totals["sms"] or None,
        immediate_payment_fee_total=totals["immediate_payment"] or None,
    )


def _is_cash_withdrawal(transaction: FeatureTransaction) -> bool:
    return (
        transaction.categorisation.category_name in CASH_WITHDRAWAL_CATEGORIES
        or transaction.categorisation.rule == "description:cash-withdrawal"
    )


def _cash_features(transactions: list[FeatureTransaction]) -> CashFeatures:
    withdrawals = [item for item in transactions if _is_cash_withdrawal(item)]
    atm_fees = [item for item in transactions if _fee_subtype(item) == "atm"]
    withdrawal_amounts = [amount_of(item) for item in withdrawals]
    return CashFeatures(
        cash_withdrawal_count=len(withdrawals),
        cash_withdrawal_total=sum(withdrawal_amounts, ZERO),
        atm_fee_count=len(atm_fees),
        atm_fee_total=sum((amount_of(item) for item in atm_fees), ZERO),
        average_withdrawal_amount=_average(withdrawal_amounts),
    )


def _weekend_features(transactions: list[FeatureTransaction]) -> WeekendSpendingFeatures:
    spending = [
        item
        for item in transactions
        if item.categorisation.transaction_class == "spending"
        and item.transaction_date is not None
    ]
    weekend = [item for item in spending if item.transaction_date.weekday() >= 5]
    spending_total = sum((amount_of(item) for item in spending), ZERO)
    weekend_total = sum((amount_of(item) for item in weekend), ZERO)
    return WeekendSpendingFeatures(
        dated_spending_transaction_count=len(spending),
        weekend_spending_transaction_count=len(weekend),
        dated_spending_total=spending_total,
        weekend_spending_total=weekend_total,
        weekend_spending_share=(
            weekend_total / spending_total if spending_total != ZERO else None
        ),
    )


def _payday_spending_features(
    transactions: list[FeatureTransaction],
    window_days: int = 3,
) -> PaydaySpendingFeatures:
    income_dates = sorted(
        {
            item.transaction_date
            for item in transactions
            if item.categorisation.transaction_class == "income"
            and item.transaction_date is not None
        }
    )
    spending = [
        item
        for item in transactions
        if item.categorisation.transaction_class == "spending"
        and item.transaction_date is not None
    ]
    eligible = [
        item
        for item in spending
        if any(income_date <= item.transaction_date for income_date in income_dates)
    ]
    post_income = [
        item
        for item in eligible
        if 0
        <= min(
            (item.transaction_date - income_date).days
            for income_date in income_dates
            if income_date <= item.transaction_date
        )
        <= window_days
    ]
    eligible_total = sum((amount_of(item) for item in eligible), ZERO)
    post_income_total = sum((amount_of(item) for item in post_income), ZERO)
    return PaydaySpendingFeatures(
        window_days=window_days,
        eligible_income_event_count=len(income_dates),
        eligible_spending_transaction_count=len(eligible),
        post_income_spending_transaction_count=len(post_income),
        eligible_spending_total=eligible_total,
        post_income_spending_total=post_income_total,
        post_income_spending_share=(
            post_income_total / eligible_total if eligible_total != ZERO else None
        ),
    )


def _income_features(transactions: list[FeatureTransaction]) -> IncomeFeatures:
    all_income = [
        item for item in transactions if item.categorisation.transaction_class == "income"
    ]
    income = sorted(
        (item for item in all_income if item.transaction_date is not None),
        key=lambda item: item.transaction_date,
    )
    amounts = [amount_of(item) for item in all_income]
    dates = [item.transaction_date for item in income]
    days_since: dict[str, int] = {}
    for item in sorted((item for item in transactions if item.transaction_date is not None), key=lambda item: item.transaction_date):
        prior = [income_date for income_date in dates if income_date <= item.transaction_date]
        if prior:
            days_since[item.transaction_id] = (item.transaction_date - prior[-1]).days
    intervals = [Decimal((later - earlier).days) for earlier, later in zip(dates, dates[1:])]
    estimated_interval = None
    if len(income) >= PAYDAY_MIN_OBSERVATIONS and len(intervals) >= 2:
        average_interval = _average(intervals)
        interval_variance = _variance(intervals)
        if average_interval not in (None, ZERO) and (interval_variance or ZERO).sqrt() / average_interval <= Decimal("0.20"):
            estimated_interval = average_interval
    return IncomeFeatures(
        income_transaction_count=len(all_income),
        income_total=sum(amounts, ZERO),
        last_income_date=dates[-1] if dates else None,
        average_income_amount=_average(amounts),
        estimated_payday_interval=estimated_interval,
        max_income_gap_days=max((int(interval) for interval in intervals), default=None),
        days_since_last_income=days_since,
    )


def _duplicate_candidates(
    transactions: list[FeatureTransaction],
) -> list[DuplicateCandidate]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if item.transaction_date is not None and (merchant := merchant_group_key(item)) is not None:
            groups[merchant].append(item)
    candidates = []
    for merchant, items in groups.items():
        items.sort(key=lambda item: (item.transaction_date, item.transaction_id))
        current: list[FeatureTransaction] = []
        for item in items:
            if not current:
                current = [item]
                continue
            previous = current[-1]
            same_amount = abs(amount_of(item) - amount_of(previous)) <= AMOUNT_TOLERANCE
            nearby = (item.transaction_date - previous.transaction_date).days <= DUPLICATE_DATE_WINDOW_DAYS
            if same_amount and nearby:
                current.append(item)
                continue
            if len(current) > 1:
                candidates.append(_candidate(merchant, current))
            current = [item]
        if len(current) > 1:
            candidates.append(_candidate(merchant, current))
    return candidates


def _candidate(
    merchant: str, transactions: list[FeatureTransaction]
) -> DuplicateCandidate:
    dates = [item.transaction_date for item in transactions if item.transaction_date is not None]
    return DuplicateCandidate(
        group_key=f"{merchant}:{dates[0].isoformat()}:{amount_of(transactions[0])}",
        merchant_name=merchant,
        amount=amount_of(transactions[0]),
        transaction_ids=[item.transaction_id for item in transactions],
        transaction_dates=dates,
    )
