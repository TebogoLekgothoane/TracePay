"""Reusable, user-scoped financial feature extraction.

This module describes transaction patterns. It deliberately makes no leak,
duplicate-confirmation, recommendation, or affordability decisions.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Mapping
from statistics import median, pvariance

from .common import (
    ZERO,
    amount_of,
    is_purchase_reversal,
    is_purchase_spending_candidate,
    merchant_group_key,
    month_key,
)
from .import_quality import StatementImportQuality, resolve_coverage_observation_bounds
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
    IrregularCandidate,
    MerchantFeature,
    MonthlyFeature,
    NearMiss,
    PaydaySpendingFeatures,
    RecurrenceFeature,
    WeekendSpendingFeatures,
)
from .consolidation import order_chronologically
from .near_misses import build_near_miss
from .payee_candidates import (
    UNIDENTIFIED_GROUP_PREFIX,
    penalty_fee_candidates,
    person_payment_candidates,
    trial_conversion_candidates,
    unidentified_recurring_candidates,
    unidentified_signature,
)
from .subscription_detection import detect_subscriptions
from .subscription_llm import label_subscription_groups, merchant_resolver
from .recurrence_rules import (
    matches_plausible_recurring_interval,
    recurrence_strength_cap_for_interval,
)
from .service import ESSENTIAL_SPENDING_CATEGORIES, build_spending_profile

HIGH_CONFIDENCE = 0.85
RECURRENCE_MIN_OBSERVATIONS = 3
INTERVAL_STABILITY_CV = Decimal("0.15")
TREND_MIN_OBSERVATIONS = 3
PAYDAY_MIN_OBSERVATIONS = 3
# Same calendar day only. Adjacent-day matches are legitimate repeats, not duplicates.
DUPLICATE_DATE_WINDOW_DAYS = 0
# A double charge can post a day or two late. Pairs this far apart are weaker evidence
# than same-day ones, so they are only kept for larger, non-routine purchases.
NEAR_DAY_DUPLICATE_MAX_DAYS = 3
NEAR_DAY_DUPLICATE_MIN_AMOUNT = Decimal("100")
# Below this, a repeat that misses its minimum is not worth listing as a near miss.
NEAR_MISS_MIN_LISTED_AMOUNT = Decimal("50")
# Pairs just past the window are reported as near misses, never raised.
NEAR_DAY_DUPLICATE_REPORT_EXTRA_DAYS = 4
AMOUNT_TOLERANCE = Decimal("0.01")
_REFERENCE_TOKEN = re.compile(
    r"\b(?:REF|REFERENCE|AUTH|TRN|TXN)[\s:#-]*([A-Z0-9-]{4,})\b",
    re.IGNORECASE,
)
# Longer keywords first: "POL" would otherwise match inside "POLICY" and read
# the tail of the word ("ICY") as the policy number.
_MANDATE_TOKEN = re.compile(
    r"\b(?:POLICY|POL|CONTRACT|MANDATE|ACCOUNT|ACC|LOAN|PLAN|MEMBER|MEM)[\s:#-]*([A-Z0-9-]{2,})\b",
    re.IGNORECASE,
)
_DEBIT_ORDER_MARKERS = ("DEBIT ORDER", "ACB DEBIT", "NAEDO", "DEBICHECK", "MAGTAPE DEBIT")
_OBLIGATORY_SPEND_MARKERS = (
    "DEBIT ORDER",
    "NAEDO",
    "DEBICHECK",
    "MAGTAPE DEBIT",
    "RENT",
    "MORTGAGE",
    "HOME LOAN",
    "BOND",
    "MUNICIPAL",
    "LOAN REPAYMENT",
    "CREDIT CARD PAYMENT",
    "SCHOOL FEES",
    "TUITION",
)
_CONVENIENCE_STORE_PHRASES = (
    "SPAR EXPRESS",
    "KWIKSPAR",
    "QUICKSPAR",
    "FRESHSTOP",
    "FRESH STOP",
    "ON THE RUN",
    "ENGEN QUICKSHOP",
    "QUICKSHOP",
    "BP EXPRESS",
    "SHELL SELECT",
    "SASOL DELIGHT",
    "TOTAL BONJOUR",
    "PNP EXPRESS",
    "PICK N PAY EXPRESS",
    "WOOLWORTHS FOODSTOP",
    "FOODSTOP",
    "OK EXPRESS",
    "OK MINIMARK",
)
# Two collections this close can be one billing cycle collected twice. Monthly
# mandates move around month-end and weekends, and a mistaken second collection
# often lands on the next run (25th and the 1st), so monthly cadence allows more.
DEBIT_ORDER_DUPLICATE_MAX_SHIFT_DAYS = 5
DEBIT_ORDER_MONTHLY_DUPLICATE_MAX_SHIFT_DAYS = 10
MONTHLY_CADENCE_MIN_GAP_DAYS = 25
DEBIT_ORDER_MAX_AMOUNT_VARIANCE = Decimal("25.00")
DEBIT_ORDER_MAX_VARIANCE_RATIO = Decimal("0.10")
CASH_WITHDRAWAL_CATEGORIES = {"Cash Withdrawal", "Cash Withdrawals", "ATM Cash Withdrawal"}
# These stay in their own income, transfer, savings, and fee totals.
# They are not purchase spending and do not enter merchant-payment features.
_NON_PURCHASE_CLASSES = frozenset(
    {"income", "internal_transfer", "savings", "investment", "bank_fee"}
)


def build_financial_features(
    user_id: str,
    transactions: list[FeatureTransaction],
    *,
    statement_import_quality: list[StatementImportQuality] | None = None,
    account_observation_end: Mapping[str, date] | None = None,
) -> FinancialFeatureSnapshot:
    """Build one user's financial observations from already categorised data."""
    if not user_id:
        raise ValueError("A user id is required for financial feature calculation.")

    # Chronological, with a deterministic order for same-day rows. Rules that
    # take "latest" or "first" must not depend on how rows were extracted.
    active = order_chronologically(_active_user_transactions(user_id, transactions))
    dates = [item.transaction_date for item in active if item.transaction_date is not None]
    date_start = min(dates) if dates else None
    date_end = max(dates) if dates else None
    qualities = list(statement_import_quality or [])
    import_ids_by_month: dict[str, list[str]] = {}
    for item in active:
        month = month_key(item)
        if month is None or not item.statement_id:
            continue
        bucket = import_ids_by_month.setdefault(month, [])
        if item.statement_id not in bucket:
            bucket.append(item.statement_id)
    coverage_start, coverage_end = resolve_coverage_observation_bounds(
        date_start, date_end, qualities
    )
    same_day_duplicates = _duplicate_candidates(active)
    near_misses: list[NearMiss] = []
    near_day_duplicates = _near_day_duplicate_candidates(
        active, same_day_duplicates, near_misses
    )
    irregular = _irregular_candidates(active, near_misses)
    return FinancialFeatureSnapshot(
        user_id=user_id,
        transaction_count=len(active),
        date_start=date_start,
        date_end=date_end,
        coverage_observation_start=coverage_start,
        coverage_observation_end=coverage_end,
        spending_profile=build_spending_profile(active),
        merchants=_merchant_features(active),
        subscriptions=label_subscription_groups(
            detect_subscriptions(active, merchant_resolver=merchant_resolver())
        ),
        categories=_category_features(active),
        months=_monthly_features(active),
        fees=_fee_features(active),
        cash=_cash_features(active),
        weekend=_weekend_features(active),
        payday=_payday_spending_features(active),
        income=_income_features(active),
        duplicate_candidates=same_day_duplicates,
        near_day_duplicate_candidates=near_day_duplicates,
        near_misses=near_misses,
        irregular_candidates=irregular,
        trial_conversion_candidates=trial_conversion_candidates(active),
        unidentified_recurring_candidates=unidentified_recurring_candidates(active),
        penalty_fee_candidates=penalty_fee_candidates(active),
        person_payment_candidates=person_payment_candidates(active),
        statement_import_quality=qualities,
        import_ids_by_month=import_ids_by_month,
        account_observation_end=dict(account_observation_end or {}),
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


MAX_MISSED_CYCLES_PER_GAP = 3


def _fill_missed_cycles(intervals: list[Decimal]) -> tuple[list[Decimal], int]:
    """Read a gap of whole billing cycles as the cycles it spans, not as one slow payment.

    A missing statement month leaves a gap of two cycles (61 days between monthly
    payments), which would otherwise look like an unstable cadence. A gap is split
    only when it is close to a whole multiple of the usual interval, the usual
    interval is itself billing-like, and the series would stay mostly observed.
    """
    if len(intervals) < 3:
        return intervals, 0
    base = Decimal(str(median(intervals)))
    if base <= ZERO or not matches_plausible_recurring_interval(base):
        return intervals, 0
    filled: list[Decimal] = []
    missed = 0
    for gap in intervals:
        cycles = int((gap / base).to_integral_value())
        if (
            2 <= cycles <= MAX_MISSED_CYCLES_PER_GAP + 1
            and abs(gap - base * cycles) <= max(Decimal("4"), base * cycles * Decimal("0.15"))
        ):
            filled.extend([gap / cycles] * cycles)
            missed += cycles - 1
        else:
            filled.append(gap)
    # Many missing cycles means the data is too thin to call the series regular.
    if missed == 0 or missed > max(1, len(intervals) // 3):
        return intervals, 0
    # Filling must explain the gaps, not smooth a genuinely irregular series: every
    # other interval has to sit near the usual one too.
    tolerance = max(Decimal("5"), base * Decimal("0.20"))
    if any(abs(value - base) > tolerance for value in filled):
        return intervals, 0
    return filled, missed


INTRODUCTORY_MAX_SHARE = Decimal("0.60")
INTRODUCTORY_MIN_FOLLOWING = 3
INTRODUCTORY_FOLLOWING_CV = Decimal("0.10")


def _introductory_amount(amounts: list[Decimal]) -> Decimal | None:
    """A first payment far below a steady price that follows it (an introductory offer)."""
    if len(amounts) < INTRODUCTORY_MIN_FOLLOWING + 1:
        return None
    first, later = amounts[0], amounts[1:]
    typical = Decimal(str(median(later)))
    if typical <= ZERO or first >= typical * INTRODUCTORY_MAX_SHARE:
        return None
    average = _average(later)
    if average in (None, ZERO):
        return None
    if (_variance(later) or ZERO).sqrt() / average > INTRODUCTORY_FOLLOWING_CV:
        return None
    return first


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


def _monthly_max_amounts(transactions: list[FeatureTransaction]) -> dict[str, Decimal]:
    largest: dict[str, Decimal] = {}
    for item in transactions:
        month = month_key(item)
        if month is not None:
            largest[month] = max(largest.get(month, ZERO), amount_of(item))
    return largest


def _amount_trend(transactions: list[FeatureTransaction]) -> AmountTrend | None:
    dated = sorted(
        _without_same_day_amount_duplicates(
            [item for item in transactions if item.transaction_date is not None]
        ),
        key=lambda item: item.transaction_date,
    )
    if len(dated) < TREND_MIN_OBSERVATIONS:
        return None
    previous = [amount_of(item) for item in dated[:-1]]
    average_previous = _average(previous)
    latest = amount_of(dated[-1])
    if average_previous in (None, ZERO):
        return None
    change = latest - average_previous
    amounts = [amount_of(item) for item in dated]
    step_indexes = [
        index
        for index in range(1, len(amounts))
        if amounts[index] - amounts[index - 1] > AMOUNT_TOLERANCE
    ]
    first_increase_index = next(
        (
            index
            for index in range(1, len(amounts))
            if amounts[index] - amounts[0] > AMOUNT_TOLERANCE
        ),
        None,
    )
    additional_paid = (
        sum(
            (max(amount - amounts[0], ZERO) for amount in amounts[first_increase_index:]),
            ZERO,
        )
        if first_increase_index is not None
        else None
    )
    return AmountTrend(
        first_amount=amounts[0],
        latest_amount=latest,
        previous_amount=amounts[-2],
        increase_count=len(step_indexes),
        first_increase_date=(
            dated[first_increase_index].transaction_date
            if first_increase_index is not None
            else None
        ),
        additional_paid_to_date=additional_paid,
        promotional_start_possible=(
            len(step_indexes) == 1
            and first_increase_index is not None
            and first_increase_index <= 2
            and amounts[first_increase_index] >= amounts[0] * Decimal("1.5")
        ),
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
    dated_transactions = sorted(
        (
            item
            for item in transactions
            if item.transaction_date is not None and not is_purchase_reversal(item)
        ),
        key=lambda item: item.transaction_date,
    )
    amounts = [amount_of(item) for item in dated_transactions]
    intervals, missed_cycles = _fill_missed_cycles(_intervals(dated_transactions))
    introductory = _introductory_amount(amounts)
    observed_amounts = sorted(set(amounts))
    feature = RecurrenceFeature(
        first_date=dated_transactions[0].transaction_date if dated_transactions else None,
        last_date=dated_transactions[-1].transaction_date if dated_transactions else None,
        missed_cycle_count=missed_cycles,
        introductory_amount=introductory,
        observation_count=len(dated_transactions),
        average_interval_days=_average(intervals, minimum=1),
        median_interval_days=Decimal(str(median(intervals))) if intervals else None,
        interval_variance=_variance(intervals),
        average_amount=_average(amounts),
        typical_amount=Decimal(str(median(amounts))) if amounts else None,
        latest_amount=amounts[-1] if amounts else None,
        observed_amounts=observed_amounts,
        amount_variance=_variance(amounts),
    )
    if len(dated_transactions) < 2 or len(intervals) < 1:
        return feature
    shift = _billing_interval_shift(intervals)
    if shift is not None:
        feature.baseline_interval_days = shift["baseline_interval_days"]
        feature.current_interval_days = shift["current_interval_days"]
        feature.interval_change_days = shift["interval_change_days"]
        feature.baseline_interval_count = shift["baseline_interval_count"]
        feature.current_interval_count = shift["current_interval_count"]
    average_interval = feature.average_interval_days
    average_amount = feature.average_amount
    if average_interval in (None, ZERO) or average_amount in (None, ZERO):
        return feature
    interval_cv = (feature.interval_variance or ZERO).sqrt() / average_interval
    amount_cv = (feature.amount_variance or ZERO).sqrt() / average_amount
    if introductory is not None:
        # The introductory payment is judged apart: the price that followed is what
        # must be stable.
        later = amounts[1:]
        later_average = _average(later)
        if later_average not in (None, ZERO):
            amount_cv = (_variance(later) or ZERO).sqrt() / later_average
    if len(dated_transactions) == 2:
        if (
            matches_plausible_recurring_interval(feature.median_interval_days)
            and interval_cv <= Decimal("0.35")
            and amount_cv <= Decimal("0.25")
        ):
            feature.recurrence_strength = "medium"
        return feature
    if average_interval <= Decimal("400") and interval_cv <= INTERVAL_STABILITY_CV and amount_cv <= Decimal("0.10"):
        feature.recurrence_strength = recurrence_strength_cap_for_interval(
            average_interval, "high"
        )
    elif average_interval <= Decimal("400") and interval_cv <= Decimal("0.35") and amount_cv <= Decimal("0.25"):
        feature.recurrence_strength = recurrence_strength_cap_for_interval(
            average_interval, "medium"
        )
    elif (
        len(amounts) >= 3
        and average_interval <= Decimal("400")
        and interval_cv <= Decimal("0.35")
        and _coefficient_of_variation(amounts[:-1]) is not None
        and _coefficient_of_variation(amounts[:-1]) <= Decimal("0.10")
        and amounts[-1] > (_average(amounts[:-1]) or ZERO)
    ):
        feature.recurrence_strength = recurrence_strength_cap_for_interval(
            average_interval, "medium"
        )
    elif (
        average_interval <= Decimal("400")
        and interval_cv <= Decimal("0.35")
        and _is_stepped_price_rise(amounts)
    ):
        # A price that was raised once or twice is still one subscription.
        feature.recurrence_strength = recurrence_strength_cap_for_interval(
            average_interval, "medium"
        )
    else:
        feature.recurrence_strength = "low"
    return feature


# A foreign-priced plan drifts a few percent with the exchange rate, so one regular amount
# is any group of charges within this share of each other.
DOMINANT_AMOUNT_TOLERANCE = Decimal("0.08")
DOMINANT_SERIES_MIN_CHARGES = 3
DOMINANT_SERIES_MIN_SHARE = Decimal("0.25")


# A plan with an extra charge or two (a second seat, a top-up) still bills monthly most of
# the time. The gaps between charges need not be steady, but most of them must be monthly.
MONTHLY_GAP_DAYS = (25, 38)
MONTHLY_GAP_MIN_SHARE = Decimal("0.6")
MONTHLY_GAP_MIN_CHARGES = 4
MONTHLY_AMOUNT_MAX_SPREAD = Decimal("0.06")


def _bills_monthly_most_of_the_time(
    members: list[FeatureTransaction], feature: RecurrenceFeature
) -> bool:
    dates = sorted({item.transaction_date for item in members if item.transaction_date is not None})
    if len(members) < MONTHLY_GAP_MIN_CHARGES or len(dates) < MONTHLY_GAP_MIN_CHARGES:
        return False
    average_amount = feature.average_amount
    if not average_amount:
        return False
    amount_spread = (feature.amount_variance or ZERO).sqrt() / average_amount
    if amount_spread > MONTHLY_AMOUNT_MAX_SPREAD:
        return False
    gaps = [(later - earlier).days for earlier, later in zip(dates, dates[1:])]
    monthly = sum(1 for gap in gaps if MONTHLY_GAP_DAYS[0] <= gap <= MONTHLY_GAP_DAYS[1])
    return Decimal(monthly) / Decimal(len(gaps)) >= MONTHLY_GAP_MIN_SHARE


def _dominant_amount_series(items: list[FeatureTransaction]) -> list[RecurrenceFeature] | None:
    """Each steady cycle hidden inside a mix of charges, best first, or None.

    Cursor-style plans bill a fixed fee plus usage, and an app store bills several things
    through one name. Judged together the charges look irregular; one amount on its own
    often repeats monthly. The group must itself pass the normal steady-pattern test,
    have at least three charges, and be a real share of the merchant's charges.
    """
    amounts = sorted({amount_of(item) for item in items if amount_of(item) > ZERO})
    if len(items) < 4 or len(amounts) < 2:
        return None
    qualifying: list[tuple[tuple[int, bool], RecurrenceFeature]] = []
    for anchor in amounts:
        members = [
            item for item in items if abs(amount_of(item) - anchor) <= anchor * DOMINANT_AMOUNT_TOLERANCE
        ]
        if (
            len(members) < DOMINANT_SERIES_MIN_CHARGES
            or Decimal(len(members)) / Decimal(len(items)) < DOMINANT_SERIES_MIN_SHARE
        ):
            continue
        feature = _recurrence(members)
        if feature.recurrence_strength not in {"medium", "high"}:
            if not _bills_monthly_most_of_the_time(members, feature):
                continue
            feature = feature.model_copy(update={"recurrence_strength": "medium"})
        key = (feature.observation_count, feature.recurrence_strength == "high")
        qualifying.append((key, feature))
    if not qualifying:
        return None
    qualifying.sort(key=lambda entry: entry[0], reverse=True)
    # Overlapping groups around one price are the same series; a group at a clearly
    # different price is a second regular charge, kept as its own series.
    series: list[RecurrenceFeature] = []
    for _, feature in qualifying:
        typical = feature.typical_amount
        if typical is None:
            continue
        if all(
            abs(typical - (kept.typical_amount or ZERO)) > typical * DOMINANT_AMOUNT_TOLERANCE
            for kept in series
        ):
            series.append(feature)
    amounts = [feature.typical_amount for feature in series if feature.typical_amount is not None]
    return [
        feature.model_copy(
            update={
                "basis": "dominant_amount",
                "other_regular_amounts": sorted(a for a in amounts if a != feature.typical_amount),
            }
        )
        for feature in series
    ]


def _describe_amount_groups(items: list[FeatureTransaction]) -> str | None:
    """The merchant's most repeated amounts with the gaps between them, for tuning."""
    amounts = sorted({amount_of(item) for item in items if amount_of(item) > ZERO})
    groups: list[tuple[int, Decimal, list[FeatureTransaction]]] = []
    for anchor in amounts:
        members = [
            item for item in items if abs(amount_of(item) - anchor) <= anchor * DOMINANT_AMOUNT_TOLERANCE
        ]
        if len(members) >= 2:
            groups.append((len(members), anchor, members))
    groups.sort(key=lambda entry: (-entry[0], entry[1]))
    shown: list[str] = []
    seen: list[Decimal] = []
    for count, anchor, members in groups:
        if any(abs(anchor - other) <= anchor * DOMINANT_AMOUNT_TOLERANCE for other in seen):
            continue
        seen.append(anchor)
        gaps = ", ".join(str(int(gap)) for gap in _intervals(members)[:6]) or "same day"
        shown.append(f"R{anchor:.2f} x{count} (gaps in days: {gaps})")
        if len(shown) == 3:
            break
    return "; ".join(shown) or None


def _subscription_series(
    items: list[FeatureTransaction],
) -> tuple[RecurrenceFeature | None, list[RecurrenceFeature]]:
    """The merchant's main subscription cadence and any further regular series."""
    if not items:
        return None, []
    feature = _recurrence(items)
    # Only a series that fails as a whole is looked at again, so nothing that already
    # passes can change.
    if feature.recurrence_strength in {"none", "low"}:
        rescued = _dominant_amount_series(items)
        if rescued:
            return rescued[0], rescued[1:]
        return feature.model_copy(update={"series_note": _describe_amount_groups(items)}), []
    return feature, []


def _is_stepped_price_rise(amounts: list[Decimal]) -> bool:
    """True for a charge that only ever steps up and holds each price.

    Every earlier price must have been paid at least twice, so a run of random
    amounts is not mistaken for a price list. The latest price may be new.
    """
    if len(amounts) < 4:
        return False
    if any(later < earlier - AMOUNT_TOLERANCE for earlier, later in zip(amounts, amounts[1:])):
        return False
    if amounts[-1] - amounts[0] <= AMOUNT_TOLERANCE:
        return False
    run_lengths: list[int] = []
    run = 1
    for earlier, later in zip(amounts, amounts[1:]):
        if abs(later - earlier) <= AMOUNT_TOLERANCE:
            run += 1
        else:
            run_lengths.append(run)
            run = 1
    return all(length >= 2 for length in run_lengths)


def _billing_interval_shift(intervals: list[Decimal]) -> dict[str, Decimal | int] | None:
    """Return a stable earlier cadence and a stable later cadence when they differ.

    Each window must contain at least two intervals and stay within the same
    coefficient of variation used for high recurrence. A single unusual gap does
    not qualify, and neither window may be a 1–3 day spending interval.
    """
    if len(intervals) < 4:
        return None
    midpoint = len(intervals) // 2
    baseline = intervals[:midpoint]
    current = intervals[midpoint:]
    if len(baseline) < 2 or len(current) < 2:
        return None
    baseline_average = _average(baseline, minimum=2)
    current_average = _average(current, minimum=2)
    baseline_cv = _coefficient_of_variation(baseline)
    current_cv = _coefficient_of_variation(current)
    if (
        baseline_average in (None, ZERO)
        or current_average in (None, ZERO)
        or baseline_cv is None
        or current_cv is None
        or baseline_cv > INTERVAL_STABILITY_CV
        or current_cv > INTERVAL_STABILITY_CV
        or not matches_plausible_recurring_interval(baseline_average)
        or not matches_plausible_recurring_interval(current_average)
    ):
        return None
    change = current_average - baseline_average
    if abs(change) / baseline_average <= INTERVAL_STABILITY_CV:
        return None
    return {
        "baseline_interval_days": baseline_average,
        "current_interval_days": current_average,
        "interval_change_days": change,
        "baseline_interval_count": len(baseline),
        "current_interval_count": len(current),
    }


def _coefficient_of_variation(values: list[Decimal]) -> Decimal | None:
    average = _average(values, minimum=2)
    variance = _variance(values)
    if average in (None, ZERO) or variance is None:
        return None
    return variance.sqrt() / average


def _coffee_purchases(transactions: list[FeatureTransaction]) -> list[FeatureTransaction]:
    """Coffee purchases counted once per same-day, same-amount duplicate group."""
    coffee = [item for item in transactions if _is_coffee_transaction(item)]
    coffee.sort(key=lambda item: (item.transaction_date or date.min, item.transaction_id))
    unique: list[FeatureTransaction] = []
    previous: FeatureTransaction | None = None
    for item in coffee:
        if previous is not None and item.transaction_date and previous.transaction_date:
            same_amount = abs(amount_of(item) - amount_of(previous)) <= AMOUNT_TOLERANCE
            nearby = (item.transaction_date - previous.transaction_date).days <= DUPLICATE_DATE_WINDOW_DAYS
            if same_amount and nearby:
                previous = item
                continue
        unique.append(item)
        previous = item
    return unique


def _coffee_transaction_count(transactions: list[FeatureTransaction]) -> int:
    return len(_coffee_purchases(transactions))


def _coffee_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum((amount_of(item) for item in _coffee_purchases(transactions)), ZERO)


_AIRTIME_TOKENS = frozenset({"AIRTIME", "TALKTIME"})
_DATA_TOKENS = frozenset({"DATA", "BUNDLE", "BUNDLES"})


def _is_airtime_transaction(transaction: FeatureTransaction) -> bool:
    text = f"{transaction.merchant_name or ''} {transaction.description}".upper().replace("-", " ")
    tokens = text.split()
    return bool(_AIRTIME_TOKENS.intersection(tokens)) or "TALK TIME" in text


def _airtime_transaction_count(transactions: list[FeatureTransaction]) -> int:
    """Count airtime purchases once per same-day, same-amount duplicate group."""
    return len(
        _without_same_day_amount_duplicates(
            [item for item in transactions if _is_airtime_transaction(item)]
        )
    )


def _airtime_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum(
        (
            amount_of(item)
            for item in _without_same_day_amount_duplicates(
                [item for item in transactions if _is_airtime_transaction(item)]
            )
        ),
        ZERO,
    )


def _is_data_transaction(transaction: FeatureTransaction) -> bool:
    text = f"{transaction.merchant_name or ''} {transaction.description}".upper().replace("-", " ")
    tokens = text.split()
    return bool(_DATA_TOKENS.intersection(tokens)) and not _is_airtime_transaction(transaction)


def _data_transaction_count(transactions: list[FeatureTransaction]) -> int:
    return len(
        _without_same_day_amount_duplicates(
            [item for item in transactions if _is_data_transaction(item)]
        )
    )


def _data_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum(
        (
            amount_of(item)
            for item in _without_same_day_amount_duplicates(
                [item for item in transactions if _is_data_transaction(item)]
            )
        ),
        ZERO,
    )


def _is_ride_hailing_transaction(transaction: FeatureTransaction) -> bool:
    raw = f"{transaction.merchant_name or ''} {transaction.description}".upper()
    compact = raw.replace(" ", "").replace("-", "").replace("*", "")
    if "UBEREATS" in compact:
        return False
    tokens = raw.replace("-", " ").replace("*", " ").split()
    return "UBER" in tokens or "BOLT" in tokens


def _ride_hailing_transaction_count(transactions: list[FeatureTransaction]) -> int:
    return len(
        _without_same_day_amount_duplicates(
            [item for item in transactions if _is_ride_hailing_transaction(item)]
        )
    )


def _ride_hailing_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum(
        (
            amount_of(item)
            for item in _without_same_day_amount_duplicates(
                [item for item in transactions if _is_ride_hailing_transaction(item)]
            )
        ),
        ZERO,
    )


def _is_food_delivery_transaction(transaction: FeatureTransaction) -> bool:
    """Match the catalogue food-delivery merchants, not generic food or delivery words."""
    raw = f"{transaction.merchant_name or ''} {transaction.description}".upper()
    compact = raw.replace(" ", "").replace("-", "").replace("*", "")
    if "UBEREATS" in compact or "MRDFOOD" in compact:
        return True
    tokens = raw.replace("-", " ").replace("*", " ").split()
    return any(
        token == "MR" and tokens[index + 1] == "D" for index, token in enumerate(tokens[:-1])
    )


def _food_delivery_transaction_count(transactions: list[FeatureTransaction]) -> int:
    return len(
        _without_same_day_amount_duplicates(
            [item for item in transactions if _is_food_delivery_transaction(item)]
        )
    )


def _food_delivery_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum(
        (
            amount_of(item)
            for item in _without_same_day_amount_duplicates(
                [item for item in transactions if _is_food_delivery_transaction(item)]
            )
        ),
        ZERO,
    )


def _is_debit_order_transaction(transaction: FeatureTransaction) -> bool:
    description = (transaction.description or "").upper()
    if any(marker in description for marker in _DEBIT_ORDER_MARKERS):
        return True
    return (transaction.categorisation.rule or "").lower() == "debit_order"


def _is_obligatory_or_essential_spending(transaction: FeatureTransaction) -> bool:
    if _is_debit_order_transaction(transaction):
        return True
    description = (transaction.description or "").upper()
    if any(marker in description for marker in _OBLIGATORY_SPEND_MARKERS):
        return True
    if (
        _is_convenience_store_transaction(transaction)
        or _is_coffee_transaction(transaction)
        or _is_food_delivery_transaction(transaction)
        or _is_ride_hailing_transaction(transaction)
    ):
        return False
    category = (transaction.categorisation.category_name or "").strip()
    return category in ESSENTIAL_SPENDING_CATEGORIES or category == "Subscriptions"


def _is_salary_income_transaction(transaction: FeatureTransaction) -> bool:
    if transaction.categorisation.transaction_class != "income":
        return False
    if transaction.transaction_date is None or is_purchase_reversal(transaction):
        return False
    if transaction.categorisation.classification_confidence < 0.70:
        return False
    if amount_of(transaction) < Decimal("1000"):
        return False
    description = (transaction.description or "").upper()
    if "SALARY ADVANCE" in description:
        return False
    category = (transaction.categorisation.category_name or "").strip()
    rule = (transaction.categorisation.rule or "").strip().lower()
    return (
        category == "Salary"
        or rule == "merchant:salary"
        or "SALARY" in description
        or "PAYROLL" in description
    )


def _is_coffee_transaction(transaction: FeatureTransaction) -> bool:
    text = f"{transaction.merchant_name or ''} {transaction.description}".upper().replace("-", " ")
    tokens = set(text.split())
    if tokens & {"COFFEE", "STARBUCKS", "BOOTLEGGER", "BARISTA", "ESPRESSO"}:
        return True
    return "VIDA E CAFFE" in text or "VIDA E" in text or "SEATTLE COFFEE" in text


def _convenience_store_purchases(transactions: list[FeatureTransaction]) -> list[FeatureTransaction]:
    """Convenience-store purchases counted once per same-day, same-amount group."""
    purchases = [item for item in transactions if _is_convenience_store_transaction(item)]
    purchases.sort(key=lambda item: (item.transaction_date or date.min, item.transaction_id))
    unique: list[FeatureTransaction] = []
    previous: FeatureTransaction | None = None
    for item in purchases:
        if (
            previous is not None
            and item.transaction_date
            and previous.transaction_date
            and item.transaction_date == previous.transaction_date
            and abs(amount_of(item) - amount_of(previous)) <= AMOUNT_TOLERANCE
        ):
            previous = item
            continue
        unique.append(item)
        previous = item
    return unique


def _convenience_store_transaction_count(transactions: list[FeatureTransaction]) -> int:
    return len(_convenience_store_purchases(transactions))


def _convenience_store_total(transactions: list[FeatureTransaction]) -> Decimal:
    return sum((amount_of(item) for item in _convenience_store_purchases(transactions)), ZERO)


def _is_convenience_store_transaction(transaction: FeatureTransaction) -> bool:
    text = f"{transaction.merchant_name or ''} {transaction.description}".upper()
    compact = text.replace("-", " ").replace("'", "")
    if "7 ELEVEN" in compact or "SEVEN ELEVEN" in compact:
        return True
    return any(phrase in text for phrase in _CONVENIENCE_STORE_PHRASES)


def _merchant_features(transactions: list[FeatureTransaction]) -> list[MerchantFeature]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    failed_attempts: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if _is_failed_purchase_or_fee(item):
            if (failed_key := merchant_group_key(item)) is not None:
                failed_attempts[failed_key].append(item)
            continue
        if _excluded_from_purchase_spending(item):
            continue
        # A zero-value row (a trial record) is not a payment and must not
        # distort the amount or interval of the payments that follow it.
        if amount_of(item) == ZERO:
            continue
        if (key := merchant_group_key(item)) is not None:
            groups[key].append(item)
    features = []
    for merchant, items in groups.items():
        amounts = [amount_of(item) for item in items]
        monthly_totals, monthly_counts = _monthly_amounts(items)
        category_counts: defaultdict[str, int] = defaultdict(int)
        debit_order_count = 0
        insurance_count = 0
        for item in items:
            if category := item.categorisation.category_name:
                category_counts[category] += 1
            if _is_debit_order_transaction(item):
                debit_order_count += 1
            if _is_insurance_transaction(item):
                insurance_count += 1
        coffee_count = _coffee_transaction_count(items)
        coffee_total = _coffee_total(items)
        convenience_count = _convenience_store_transaction_count(items)
        convenience_total = _convenience_store_total(items)
        airtime_count = _airtime_transaction_count(items)
        data_purchases = [item for item in items if _is_data_transaction(item)]
        ride_purchases = [item for item in items if _is_ride_hailing_transaction(item)]
        delivery_purchases = [item for item in items if _is_food_delivery_transaction(item)]
        dated = [item.transaction_date for item in items if item.transaction_date is not None]
        recurrence_items = _without_duplicate_debit_order_echos(items)
        subscription_items = [
            item
            for item in items
            if _is_subscription_payment_candidate(item)
        ]
        subscription_recurrence_items = _without_duplicate_debit_order_echos(
            subscription_items
        )
        main_series, extra_series = _subscription_series(subscription_recurrence_items)
        features.append(
            MerchantFeature(
                merchant_name=merchant,
                account_ids=sorted({item.account_id for item in items if item.account_id}),
                last_account_id=next(
                    (item.account_id for item in reversed(items) if item.account_id), None
                ),
                merchant_transaction_count=len(items),
                merchant_total_amount=sum(amounts, ZERO),
                merchant_average_amount=_average(amounts) or ZERO,
                merchant_min_amount=min(amounts),
                merchant_max_amount=max(amounts),
                merchant_amount_variance=_variance(amounts),
                merchant_first_transaction_date=min(dated) if dated else None,
                merchant_last_transaction_date=max(dated) if dated else None,
                merchant_average_interval_days=_average(_intervals(recurrence_items), minimum=1),
                merchant_transaction_frequency=_frequency(items),
                merchant_monthly_totals=monthly_totals,
                merchant_monthly_transaction_count=monthly_counts,
                merchant_category_transaction_count=dict(category_counts),
                subscription_recurrence=main_series,
                extra_subscription_series=extra_series,
                failed_payment_attempt_count=len(failed_attempts.get(merchant, [])),
                failed_payment_attempt_amounts=sorted(
                    {amount_of(item) for item in failed_attempts.get(merchant, [])}
                ),
                debit_order_transaction_count=debit_order_count,
                parallel_mandate_amounts=_parallel_mandate_amounts(items, merchant),
                insurance_transaction_count=insurance_count,
                coffee_transaction_count=coffee_count,
                coffee_total_amount=coffee_total,
                convenience_store_transaction_count=convenience_count,
                convenience_store_total_amount=convenience_total,
                airtime_transaction_count=airtime_count,
                airtime_only=airtime_count > 0 and len([item for item in items if _is_airtime_transaction(item)]) == len(items),
                data_transaction_count=_data_transaction_count(items),
                data_only=len(data_purchases) == len(items) and len(items) > 0,
                ride_hailing_transaction_count=_ride_hailing_transaction_count(items),
                ride_hailing_only=len(ride_purchases) == len(items) and len(items) > 0,
                food_delivery_transaction_count=_food_delivery_transaction_count(items),
                food_delivery_only=len(delivery_purchases) == len(items) and len(items) > 0,
                merchant_amount_trend=_amount_trend(items),
                merchant_frequency_trend=_monthly_frequency_trend(monthly_counts),
                recurrence=_recurrence(recurrence_items),
                confidence_support=_confidence_support(items),
            )
        )
    return sorted(features, key=lambda feature: (-feature.merchant_total_amount, feature.merchant_name))


def _category_features(transactions: list[FeatureTransaction]) -> list[CategoryFeature]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if _excluded_from_purchase_spending(item):
            continue
        if category := item.categorisation.category_name:
            groups[category].append(item)
    features = []
    for category, items in groups.items():
        amounts = [amount_of(item) for item in items]
        monthly_totals, monthly_counts = _monthly_amounts(items)
        airtime_purchases = [item for item in items if _is_airtime_transaction(item)]
        data_purchases = [item for item in items if _is_data_transaction(item)]
        ride_purchases = [item for item in items if _is_ride_hailing_transaction(item)]
        delivery_purchases = [item for item in items if _is_food_delivery_transaction(item)]
        features.append(
            CategoryFeature(
                category_name=category,
                category_transaction_count=len(items),
                category_total_amount=sum(amounts, ZERO),
                category_average_amount=_average(amounts) or ZERO,
                category_monthly_total=monthly_totals,
                category_monthly_transaction_count=monthly_counts,
                category_monthly_max_amount=_monthly_max_amounts(items),
                category_trend=_monthly_trend(monthly_totals),
                confidence_support=_confidence_support(items),
                airtime_transaction_count=_airtime_transaction_count(items),
                airtime_total_amount=_airtime_total(items),
                airtime_only=len(airtime_purchases) == len(items) and len(items) > 0,
                data_transaction_count=_data_transaction_count(items),
                data_total_amount=_data_total(items),
                data_only=len(data_purchases) == len(items) and len(items) > 0,
                ride_hailing_transaction_count=_ride_hailing_transaction_count(items),
                ride_hailing_total_amount=_ride_hailing_total(items),
                ride_hailing_only=len(ride_purchases) == len(items) and len(items) > 0,
                food_delivery_transaction_count=_food_delivery_transaction_count(items),
                food_delivery_total_amount=_food_delivery_total(items),
                food_delivery_only=len(delivery_purchases) == len(items) and len(items) > 0,
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
            if _excluded_from_purchase_spending(item):
                continue
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
                    (amount_of(item) for item in items if _purchase_outflow(item)),
                    ZERO,
                ),
                transaction_count=len(items),
                outflow_transaction_count=sum(_purchase_outflow(item) for item in items),
                category_totals=dict(category_totals),
                merchant_totals=dict(merchant_totals),
                bank_fee_total=sum(
                    (
                        amount_of(item)
                        for item in items
                        if item.categorisation.transaction_class == "bank_fee"
                        and not is_purchase_reversal(item)
                    ),
                    ZERO,
                ),
                foreign_transaction_fee_total=sum(
                    (
                        amount_of(item)
                        for item in items
                        if _fee_subtype(item) == "foreign" and not is_purchase_reversal(item)
                    ),
                    ZERO,
                ),
                cash_withdrawal_total=sum(
                    (
                        amount_of(item)
                        for item in _without_same_day_amount_duplicates(
                            [
                                item
                                for item in items
                                if _is_cash_withdrawal(item) and not is_purchase_reversal(item)
                            ]
                        )
                    ),
                    ZERO,
                ),
                subscription_total=sum(
                    (
                        amount_of(item)
                        for item in items
                        if item.categorisation.category_name == "Subscriptions"
                        and not is_purchase_reversal(item)
                    ),
                    ZERO,
                ),
                transfer_total=sum(
                    (amount_of(item) for item in items if item.categorisation.transaction_class in {"internal_transfer", "person_to_person"}),
                    ZERO,
                ),
            )
        )
    return features


def _excluded_from_purchase_spending(transaction: FeatureTransaction) -> bool:
    """Return whether a row must stay out of purchase-spending features."""
    if is_purchase_reversal(transaction):
        return True
    transaction_class = transaction.categorisation.transaction_class or "unknown"
    if transaction_class in _NON_PURCHASE_CLASSES:
        return True
    if transaction_class in {"person_to_person", "transfer"}:
        return True
    category = (transaction.categorisation.category_name or "").strip()
    if transaction_class == "spending" and category in {
        "Transfers",
        "Savings",
        "Other Income",
        "Salary",
        "Income",
        "Bank Fees",
        "Cash Withdrawal",
        "Cash Withdrawals",
        "ATM Cash Withdrawal",
    }:
        return True
    return False


def _is_failed_purchase_or_fee(transaction: FeatureTransaction) -> bool:
    """Keep failed-payment fees out of subscription recurrence evidence.

    A statement can contain a bank fee for an unsuccessful purchase whose
    description also names the attempted merchant. That row is a real debit,
    but it is not a subscription charge for the named merchant.
    """
    description = (transaction.description or "").upper()
    rule = (transaction.categorisation.rule or "").lower()
    return (
        rule == "description:service-fee"
        or "INSUFFICIENT FUNDS" in description
        or "UNSUCCESSFUL" in description
        or "FAILED PURCHASE" in description
        or "FAILED PAYMENT" in description
        or "UNPAID ITEM" in description
        or "RETURNED ITEM" in description
        or " FEE" in description
        or " CHARGE" in description
    )


def _is_subscription_payment_candidate(transaction: FeatureTransaction) -> bool:
    """Return true only for successful merchant debits eligible for recurrence."""
    if is_purchase_reversal(transaction):
        return False
    if transaction.transaction_type not in {"debit", None}:
        return False
    if (transaction.categorisation.transaction_class or "unknown") != "spending":
        return False
    if _is_failed_purchase_or_fee(transaction):
        return False
    if _is_airtime_transaction(transaction) or _is_data_transaction(transaction):
        return False
    if (
        _is_ride_hailing_transaction(transaction)
        or _is_food_delivery_transaction(transaction)
    ):
        return False
    category = (transaction.categorisation.category_name or "").strip()
    if category != "Subscriptions":
        return False
    if category in {
        "Airtime & Data",
        "Transfers",
        "Savings",
        "Bank Fees",
        "Cash Withdrawal",
        "Cash Withdrawals",
        "ATM Cash Withdrawal",
    }:
        return False
    description = (transaction.description or "").upper()
    own_account_markers = (
        "OWN ACCOUNT",
        "MAIN ACCOUNT",
        "PRIMARY ACCOUNT",
        "TO SAVINGS",
        "FROM SAVINGS",
        "INTERNAL TRANSFER",
        "GOALSAVE",
        "GOAL SAVE",
    )
    return not any(marker in description for marker in own_account_markers)


def _purchase_outflow(transaction: FeatureTransaction) -> bool:
    """Return whether a row belongs in the purchase-spending outflow series."""
    if _excluded_from_purchase_spending(transaction):
        return False
    return transaction.transaction_type in {"debit", None}


def _fee_subtype(transaction: FeatureTransaction) -> str | None:
    if transaction.categorisation.transaction_class != "bank_fee":
        return None
    description = transaction.description.upper()
    # Failed-payment fees name the merchant that was attempted; the charge is
    # the bank's, so it is typed by the failure, not the merchant.
    if "UNSUCCESSFUL" in description and "INSUFFICIENT FUNDS" in description:
        return "insufficient_funds"
    if "CARD REPLACEMENT" in description or "REPLACEMENT CARD" in description:
        return "card_replacement"
    if "VAS" in description.split() and "FEE" in description:
        return "vas"
    if "BALANCE ENQUIRY" in description or "BALANCE INQUIRY" in description:
        return "balance_enquiry"
    tokens = set(description.replace(":", " ").replace("-", " ").split())
    if (
        "CASH WITHDRAWAL FEE" in description
        or "CASH WITHDRAWAL CHARGE" in description
        or ("ATM" in tokens and tokens & {"FEE", "FEES", "CHARGE", "CHARGES"})
    ):
        return "atm"
    if "IMMEDIATE PAYMENT" in description:
        return "immediate_payment"
    if "SMS" in description and (
        "FEE" in description or "NOTIFICATION" in description or "BANKING" in description
    ):
        return "sms"
    if "CARD FEE" in description:
        return "card"
    if (
        "INTEREST CHARGED" in description
        or "DEBIT INTEREST" in description
        or "OVERDRAFT INTEREST" in description
        or "INTEREST ON OVERDRAFT" in description
        or "CREDIT CARD INTEREST" in description
        or "INTEREST ON CREDIT CARD" in description
        or "INTEREST DEBIT" in description
        or "INTEREST CHARGE" in description
    ):
        return "interest"
    if "OVERDRAFT FEE" in description or "OVERDRAFT CHARGE" in description:
        return "overdraft"
    if (
        "INSUFFICIENT FUNDS FEE" in description
        or "INSUFFICIENT FUNDS CHARGE" in description
        or "NSF FEE" in description
        or "NSF CHARGE" in description
    ):
        return "insufficient_funds"
    if (
        "ACCOUNT" in description
        or "ADMIN FEE" in description
        or "ADMINISTRATION FEE" in description
        or "MANAGEMENT FEE" in description
        or "MAINTENANCE FEE" in description
        or "MONTHLY FEE" in description
        or "SERVICE CHARGE" in description
        or "SERVICE FEE" in description
        or "BANK CHARGE" in description
    ):
        return "account"
    if (
        "FOREIGN TRANSACTION FEE" in description
        or "INTERNATIONAL TRANSACTION FEE" in description
        or "CURRENCY CONVERSION FEE" in description
        or "FOREIGN EXCHANGE FEE" in description
    ):
        return "foreign"
    if "TRANSACTION FEE" in description or "PAYMENT FEE" in description:
        return "transaction"
    return None


def _fee_features(transactions: list[FeatureTransaction]) -> FeeFeatures:
    fees = [
        item
        for item in transactions
        if item.categorisation.transaction_class == "bank_fee" and not is_purchase_reversal(item)
    ]
    amounts = [amount_of(item) for item in fees]
    totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in fees:
        if subtype := _fee_subtype(item):
            totals[subtype] += amount_of(item)
    card_fees = _without_same_day_amount_duplicates(
        [item for item in fees if _fee_subtype(item) == "card"]
    )
    foreign_fees = _without_same_day_amount_duplicates(
        [item for item in fees if _fee_subtype(item) == "foreign"]
    )
    interest_charges = _without_same_day_amount_duplicates(
        [item for item in fees if _fee_subtype(item) == "interest"]
    )
    overdraft_fees = _without_same_day_amount_duplicates(
        [item for item in fees if _fee_subtype(item) == "overdraft"]
    )
    raw_insufficient_funds_fees = [
        item for item in fees if _fee_subtype(item) == "insufficient_funds"
    ]
    insufficient_funds_fees = _without_same_day_amount_duplicates(raw_insufficient_funds_fees)
    card_total = sum((amount_of(item) for item in card_fees), ZERO)
    foreign_total = sum((amount_of(item) for item in foreign_fees), ZERO)
    interest_total = sum((amount_of(item) for item in interest_charges), ZERO)
    overdraft_total = sum((amount_of(item) for item in overdraft_fees), ZERO)
    insufficient_funds_total = sum((amount_of(item) for item in insufficient_funds_fees), ZERO)
    return FeeFeatures(
        bank_fee_transaction_count=len(fees),
        bank_fee_total=sum(amounts, ZERO),
        bank_fee_average=_average(amounts),
        atm_fee_total=totals["atm"] or None,
        transaction_fee_total=totals["transaction"] or None,
        account_fee_total=totals["account"] or None,
        sms_fee_total=totals["sms"] or None,
        immediate_payment_fee_total=totals["immediate_payment"] or None,
        balance_enquiry_fee_total=totals["balance_enquiry"] or None,
        card_fee_total=card_total or None,
        card_fee_transaction_count=len(card_fees),
        card_fee_high_confidence_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in card_fees
        ),
        foreign_transaction_fee_total=foreign_total or None,
        foreign_transaction_fee_count=len(foreign_fees),
        foreign_transaction_fee_high_confidence_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in foreign_fees
        ),
        interest_charge_total=interest_total or None,
        interest_charge_count=len(interest_charges),
        interest_charge_high_confidence_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in interest_charges
        ),
        overdraft_fee_total=overdraft_total or None,
        overdraft_fee_count=len(overdraft_fees),
        overdraft_fee_high_confidence_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in overdraft_fees
        ),
        vas_fee_total=totals["vas"] or None,
        vas_fee_count=sum(1 for item in fees if _fee_subtype(item) == "vas"),
        card_replacement_fee_total=totals["card_replacement"] or None,
        card_replacement_fee_count=sum(1 for item in fees if _fee_subtype(item) == "card_replacement"),
        insufficient_funds_fee_total=insufficient_funds_total or None,
        insufficient_funds_fee_count=len(insufficient_funds_fees),
        insufficient_funds_fee_copies_removed=len(raw_insufficient_funds_fees) - len(insufficient_funds_fees),
        insufficient_funds_fee_high_confidence_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in insufficient_funds_fees
        ),
    )


def _is_insurance_transaction(transaction: FeatureTransaction) -> bool:
    if transaction.categorisation.category_name == "Insurance":
        return True
    return "INSURANCE" in transaction.description.upper()


def _is_cash_withdrawal(transaction: FeatureTransaction) -> bool:
    return (
        transaction.categorisation.category_name in CASH_WITHDRAWAL_CATEGORIES
        or transaction.categorisation.rule == "description:cash-withdrawal"
    )


def _cash_features(transactions: list[FeatureTransaction]) -> CashFeatures:
    withdrawals = _without_same_day_amount_duplicates(
        [
            item
            for item in transactions
            if _is_cash_withdrawal(item) and not is_purchase_reversal(item)
        ]
    )
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
    spending = _without_same_day_amount_duplicates(
        [
            item
            for item in transactions
            if item.categorisation.transaction_class == "spending"
            and item.transaction_date is not None
            and not is_purchase_reversal(item)
        ]
    )
    weekend = [item for item in spending if item.transaction_date.weekday() >= 5]
    spending_total = sum((amount_of(item) for item in spending), ZERO)
    weekend_total = sum((amount_of(item) for item in weekend), ZERO)
    weekday_total = spending_total - weekend_total

    weekend_calendar_days = 0
    weekday_calendar_days = 0
    if spending:
        start_date = min(item.transaction_date for item in spending if item.transaction_date is not None)
        end_date = max(item.transaction_date for item in spending if item.transaction_date is not None)
        for offset in range((end_date - start_date).days + 1):
            current_day = start_date + timedelta(days=offset)
            if current_day.weekday() >= 5:
                weekend_calendar_days += 1
            else:
                weekday_calendar_days += 1

    weekend_daily_avg = (
        weekend_total / Decimal(weekend_calendar_days)
        if weekend_calendar_days > 0
        else None
    )
    weekday_daily_avg = (
        weekday_total / Decimal(weekday_calendar_days)
        if weekday_calendar_days > 0
        else None
    )

    discretionary = [
        item
        for item in spending
        if not _is_obligatory_or_essential_spending(item)
        and item.categorisation.classification_confidence >= 0.75
    ]
    disc_weekend = [item for item in discretionary if item.transaction_date.weekday() >= 5]
    disc_weekday = [item for item in discretionary if item.transaction_date.weekday() < 5]
    disc_weekend_total = sum((amount_of(item) for item in disc_weekend), ZERO)
    disc_weekday_total = sum((amount_of(item) for item in disc_weekday), ZERO)
    disc_total = disc_weekend_total + disc_weekday_total
    disc_weekend_share = (
        disc_weekend_total / disc_total if disc_total != ZERO else None
    )
    disc_weekend_daily_avg = (
        disc_weekend_total / Decimal(weekend_calendar_days)
        if weekend_calendar_days > 0
        else None
    )
    disc_weekday_daily_avg = (
        disc_weekday_total / Decimal(weekday_calendar_days)
        if weekday_calendar_days > 0
        else None
    )
    active_weekends = {
        item.transaction_date.isocalendar()[:2]
        for item in disc_weekend
        if item.transaction_date is not None
    }
    weekend_monthly: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in weekend:
        if (m_key := month_key(item)) is not None:
            weekend_monthly[m_key] += amount_of(item)
    disc_weekend_monthly: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    cat_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    merch_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in disc_weekend:
        if (m_key := month_key(item)) is not None:
            disc_weekend_monthly[m_key] += amount_of(item)
        if cat := (item.categorisation.category_name or "").strip():
            cat_totals[cat] += amount_of(item)
        if merch := merchant_group_key(item):
            merch_totals[merch] += amount_of(item)
    top_categories = [
        k for k, _ in sorted(cat_totals.items(), key=lambda pair: (-pair[1], pair[0]))[:3]
    ]
    top_merchants = [
        k for k, _ in sorted(merch_totals.items(), key=lambda pair: (-pair[1], pair[0]))[:3]
    ]

    return WeekendSpendingFeatures(
        dated_spending_transaction_count=len(spending),
        weekend_spending_transaction_count=len(weekend),
        dated_spending_total=spending_total,
        weekend_spending_total=weekend_total,
        weekday_spending_total=weekday_total,
        weekend_spending_share=(
            weekend_total / spending_total if spending_total != ZERO else None
        ),
        weekend_calendar_days=weekend_calendar_days,
        weekday_calendar_days=weekday_calendar_days,
        weekend_daily_average=weekend_daily_avg,
        weekday_daily_average=weekday_daily_avg,
        discretionary_weekend_transaction_count=len(disc_weekend),
        discretionary_weekday_transaction_count=len(disc_weekday),
        discretionary_weekend_total=disc_weekend_total,
        discretionary_weekday_total=disc_weekday_total,
        discretionary_weekend_share=disc_weekend_share,
        discretionary_weekend_daily_average=disc_weekend_daily_avg,
        discretionary_weekday_daily_average=disc_weekday_daily_avg,
        active_weekend_count=len(active_weekends),
        weekend_monthly_totals=dict(weekend_monthly),
        discretionary_weekend_monthly_totals=dict(disc_weekend_monthly),
        top_weekend_categories=top_categories,
        top_weekend_merchants=top_merchants,
    )


def _without_same_day_amount_duplicates(
    transactions: list[FeatureTransaction],
) -> list[FeatureTransaction]:
    """Keep one transaction for each same-day, same-amount group.

    Prefer a confirmed merchant key. For fees and cash rows without a merchant,
    fall back to category/description so statement copies are not double-counted.
    """
    buckets: defaultdict[tuple[str, date], list[FeatureTransaction]] = defaultdict(list)
    kept: list[FeatureTransaction] = []
    for item in transactions:
        key = merchant_group_key(item)
        if key is None:
            category = (item.categorisation.category_name or "").strip().upper()
            description = (item.description or "").strip().upper()
            if category or description:
                key = f"{category}|{description}"
        if key is None or item.transaction_date is None:
            kept.append(item)
            continue
        buckets[(key, item.transaction_date)].append(item)
    for items in buckets.values():
        accepted: list[Decimal] = []
        for item in sorted(items, key=lambda current: current.transaction_id):
            amount = amount_of(item)
            if any(abs(amount - existing) <= AMOUNT_TOLERANCE for existing in accepted):
                continue
            accepted.append(amount)
            kept.append(item)
    return kept


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
    salary_dates = sorted(
        {
            item.transaction_date
            for item in transactions
            if _is_salary_income_transaction(item)
            and item.transaction_date is not None
        }
    )
    spending = _without_same_day_amount_duplicates(
        [
            item
            for item in transactions
            if item.categorisation.transaction_class == "spending"
            and item.transaction_date is not None
            and not is_purchase_reversal(item)
        ]
    )
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

    salary_eligible = [
        item
        for item in spending
        if any(salary_date <= item.transaction_date for salary_date in salary_dates)
    ]
    post_salary = [
        item
        for item in salary_eligible
        if 0
        <= min(
            (item.transaction_date - salary_date).days
            for salary_date in salary_dates
            if salary_date <= item.transaction_date
        )
        <= window_days
    ]
    salary_eligible_total = sum((amount_of(item) for item in salary_eligible), ZERO)
    post_salary_total = sum((amount_of(item) for item in post_salary), ZERO)
    post_salary_essential_items = [
        item for item in post_salary if _is_obligatory_or_essential_spending(item)
    ]
    post_salary_discretionary_items = [
        item
        for item in post_salary
        if not _is_obligatory_or_essential_spending(item)
        and item.categorisation.classification_confidence >= 0.75
    ]
    eligible_discretionary_items = [
        item
        for item in salary_eligible
        if not _is_obligatory_or_essential_spending(item)
        and item.categorisation.classification_confidence >= 0.75
    ]
    post_salary_essential_total = sum(
        (amount_of(item) for item in post_salary_essential_items), ZERO
    )
    post_salary_discretionary_total = sum(
        (amount_of(item) for item in post_salary_discretionary_items), ZERO
    )
    eligible_discretionary_total = sum(
        (amount_of(item) for item in eligible_discretionary_items), ZERO
    )
    outside_discretionary_total = max(
        ZERO, eligible_discretionary_total - post_salary_discretionary_total
    )
    post_salary_discretionary_share = (
        post_salary_discretionary_total / eligible_discretionary_total
        if eligible_discretionary_total != ZERO
        else None
    )
    cycles_with_disc_spike = 0
    for salary_date in salary_dates:
        if any(
            0 <= (item.transaction_date - salary_date).days <= window_days
            for item in post_salary_discretionary_items
            if item.transaction_date is not None
        ):
            cycles_with_disc_spike += 1

    cat_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    merch_totals: defaultdict[str, Decimal] = defaultdict(lambda: ZERO)
    for item in post_salary_discretionary_items:
        if cat := (item.categorisation.category_name or "").strip():
            cat_totals[cat] += amount_of(item)
        if merch := merchant_group_key(item):
            merch_totals[merch] += amount_of(item)
    top_categories = [
        k for k, _ in sorted(cat_totals.items(), key=lambda pair: (-pair[1], pair[0]))[:3]
    ]
    top_merchants = [
        k for k, _ in sorted(merch_totals.items(), key=lambda pair: (-pair[1], pair[0]))[:3]
    ]

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
        income_event_dates=list(income_dates),
        salary_event_count=len(salary_dates),
        salary_event_dates=list(salary_dates),
        post_salary_spending_total=post_salary_total,
        post_salary_discretionary_total=post_salary_discretionary_total,
        post_salary_essential_total=post_salary_essential_total,
        post_salary_spending_share=(
            post_salary_total / salary_eligible_total
            if salary_eligible_total != ZERO
            else None
        ),
        post_salary_discretionary_transaction_count=len(post_salary_discretionary_items),
        outside_salary_window_discretionary_total=outside_discretionary_total,
        post_salary_discretionary_share=post_salary_discretionary_share,
        salary_cycles_with_discretionary_spike=cycles_with_disc_spike,
        top_post_salary_discretionary_categories=top_categories,
        top_post_salary_discretionary_merchants=top_merchants,
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


def _mandate_tokens(description: str | None) -> set[str]:
    if not description:
        return set()
    tokens = {match.group(1).upper() for match in _MANDATE_TOKEN.finditer(description)}
    tokens.update(_reference_tokens(description))
    return tokens


def _debit_order_qualifier_words(description: str | None, merchant: str) -> set[str]:
    if not description:
        return set()
    cleaned = re.sub(r"[^A-Z0-9\s]", " ", description.upper())
    merchant_words = set(re.sub(r"[^A-Z0-9\s]", " ", merchant.upper()).split())
    ignored = {
        "DEBIT",
        "ORDER",
        "NAEDO",
        "DEBICHECK",
        "MAGTAPE",
        "PAYMENT",
        "COLLECTION",
        "MONTHLY",
        "SUBSCRIPTION",
        "INSURANCE",
        "PREMIUM",
        "REF",
        "REFERENCE",
        "AUTH",
        "TRN",
        "TXN",
        "POL",
        "POLICY",
        "CONTRACT",
        "MANDATE",
        "ACC",
        "ACCOUNT",
    } | merchant_words
    return {
        word
        for word in cleaned.split()
        if word.isalpha() and len(word) >= 3 and word not in ignored
    }


def _parallel_mandate_amounts(
    transactions: list[FeatureTransaction], merchant: str
) -> list[Decimal]:
    """Typical amount per mandate when a merchant debits several at once.

    A mandate counts only when it recurs on its own (two or more payments), so a
    reference that changes with every payment is not read as separate mandates.
    """
    groups: defaultdict[frozenset[str], list[Decimal]] = defaultdict(list)
    for item in transactions:
        if not _is_debit_order_transaction(item):
            continue
        signature = frozenset(
            _mandate_tokens(item.description)
            or _debit_order_qualifier_words(item.description, merchant)
        )
        if signature:
            groups[signature].append(amount_of(item))
    recurring = [amounts for amounts in groups.values() if len(amounts) >= 2]
    if len(recurring) < 2:
        return []
    return sorted(Decimal(str(median(amounts))) for amounts in recurring)


def _has_conflicting_debit_order_mandate(
    transactions: list[FeatureTransaction], merchant: str
) -> bool:
    mandate_sets = [_mandate_tokens(item.description) for item in transactions]
    non_empty_mandates = [tokens for tokens in mandate_sets if tokens]
    if len(non_empty_mandates) >= 2 and not set.intersection(*non_empty_mandates):
        return True
    qualifier_sets = [
        _debit_order_qualifier_words(item.description, merchant) for item in transactions
    ]
    non_empty_qualifiers = [words for words in qualifier_sets if words]
    if len(non_empty_qualifiers) >= 2 and len({frozenset(words) for words in non_empty_qualifiers}) > 1:
        return True
    return False


def _is_overlapping_statement_import_copy(
    transactions: list[FeatureTransaction],
) -> bool:
    if len(transactions) < 2:
        return False
    account_ids = {item.account_id for item in transactions if item.account_id}
    if len(account_ids) > 1:
        # Two statements of two different accounts are two real charges, not one
        # transaction printed twice by overlapping statements.
        return False
    statement_ids = [item.statement_id for item in transactions if item.statement_id]
    if len(statement_ids) != len(transactions):
        return False
    if len(set(statement_ids)) != len(transactions):
        return False
    dates = {item.transaction_date for item in transactions}
    amounts = {amount_of(item) for item in transactions}
    descriptions = {(item.description or "").strip().upper() for item in transactions}
    return len(dates) == 1 and len(amounts) == 1 and len(descriptions) <= 1


def _debit_order_similar_amount(first: Decimal, second: Decimal) -> bool:
    diff = abs(first - second)
    if diff <= AMOUNT_TOLERANCE:
        return True
    lower = min(first, second)
    upper = max(first, second)
    if lower < Decimal("20"):
        return False
    return diff <= min(
        DEBIT_ORDER_MAX_AMOUNT_VARIANCE,
        upper * DEBIT_ORDER_MAX_VARIANCE_RATIO,
    )


def _duplicate_shift_limit(debit_items: list[FeatureTransaction]) -> int:
    """Widest gap that still counts as the same billing cycle for this mandate.

    Judged from the typical gap between collections: a weekly or fortnightly
    mandate keeps the short window so its normal cadence is never read as a
    duplicate, and a monthly one gets the wider window.
    """
    dates = sorted(
        item.transaction_date for item in debit_items if item.transaction_date is not None
    )
    gaps = [(later - earlier).days for earlier, later in zip(dates, dates[1:]) if later != earlier]
    if len(gaps) >= 2 and median(gaps) >= MONTHLY_CADENCE_MIN_GAP_DAYS:
        return DEBIT_ORDER_MONTHLY_DUPLICATE_MAX_SHIFT_DAYS
    return DEBIT_ORDER_DUPLICATE_MAX_SHIFT_DAYS


def _without_duplicate_debit_order_echos(
    transactions: list[FeatureTransaction],
) -> list[FeatureTransaction]:
    """Exclude within-cycle duplicate debit-order echo collections from interval calculation."""
    debit_items = [
        item
        for item in transactions
        if item.transaction_date is not None and _is_debit_order_transaction(item)
    ]
    if len(debit_items) < 3:
        return transactions
    merchant = merchant_group_key(debit_items[0]) or ""
    debit_items.sort(key=lambda item: (item.transaction_date, item.transaction_id))
    shift_limit = _duplicate_shift_limit(debit_items)
    echo_ids: set[str] = set()
    kept_last: FeatureTransaction | None = None
    for item in debit_items:
        if kept_last is None or kept_last.transaction_date is None or item.transaction_date is None:
            kept_last = item
            continue
        days_apart = (item.transaction_date - kept_last.transaction_date).days
        if (
            0 <= days_apart <= shift_limit
            and _debit_order_similar_amount(amount_of(kept_last), amount_of(item))
            and not _has_conflicting_debit_order_mandate([kept_last, item], merchant)
        ):
            echo_ids.add(item.transaction_id)
            continue
        kept_last = item
    if not echo_ids:
        return transactions
    return [item for item in transactions if item.transaction_id not in echo_ids]


def _duplicate_candidates(
    transactions: list[FeatureTransaction],
) -> list[DuplicateCandidate]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if (
            item.categorisation.transaction_class in _NON_PURCHASE_CLASSES
            or item.categorisation.transaction_class == "person_to_person"
            or is_purchase_reversal(item)
        ):
            continue
        if item.transaction_date is None:
            continue
        if (merchant := merchant_group_key(item)) is not None:
            groups[merchant].append(item)
        elif (signature := unidentified_signature(item)) is not None:
            # An unfamiliar payee still gets duplicate checking, grouped by what its
            # description says; no merchant is named.
            groups[UNIDENTIFIED_GROUP_PREFIX + signature].append(item)
    candidates: list[DuplicateCandidate] = []
    for merchant, items in groups.items():
        items.sort(key=lambda item: (item.transaction_date, item.transaction_id))
        debit_items = [item for item in items if _is_debit_order_transaction(item)]
        debit_months = {month_key(item) for item in debit_items if month_key(item) is not None}
        debit_by_month: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
        for d_item in debit_items:
            if (m_key := month_key(d_item)) is not None:
                debit_by_month[m_key].append(d_item)
        months_with_multiple_debits = sum(
            1 for m_items in debit_by_month.values() if len(m_items) >= 2
        )

        emitted_tx_ids: set[str] = set()
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
                cand = _maybe_build_candidate(
                    merchant,
                    current,
                    transactions,
                    debit_items=debit_items,
                    debit_month_count=len(debit_months),
                    months_with_multiple_debits=months_with_multiple_debits,
                )
                if cand is not None:
                    candidates.append(cand)
                    emitted_tx_ids.update(cand.transaction_ids)
            current = [item]
        if len(current) > 1:
            cand = _maybe_build_candidate(
                merchant,
                current,
                transactions,
                debit_items=debit_items,
                debit_month_count=len(debit_months),
                months_with_multiple_debits=months_with_multiple_debits,
            )
            if cand is not None:
                candidates.append(cand)
                emitted_tx_ids.update(cand.transaction_ids)

        if (
            not merchant.startswith(UNIDENTIFIED_GROUP_PREFIX)
            and len(debit_months) >= 2
            and len(debit_items) >= 3
            and months_with_multiple_debits <= 1
        ):
            shift_limit = _duplicate_shift_limit(debit_items)
            idx = 0
            while idx < len(debit_items) - 1:
                first = debit_items[idx]
                second = debit_items[idx + 1]
                if (
                    first.transaction_id in emitted_tx_ids
                    or second.transaction_id in emitted_tx_ids
                    or first.transaction_date is None
                    or second.transaction_date is None
                ):
                    idx += 1
                    continue
                shift_days = (second.transaction_date - first.transaction_date).days
                if (
                    0 <= shift_days <= shift_limit
                    and _debit_order_similar_amount(amount_of(first), amount_of(second))
                ):
                    pair_group = [first, second]
                    cand = _maybe_build_candidate(
                        merchant,
                        pair_group,
                        transactions,
                        debit_items=debit_items,
                        debit_month_count=len(debit_months),
                        months_with_multiple_debits=months_with_multiple_debits,
                    )
                    if cand is not None:
                        candidates.append(cand)
                        emitted_tx_ids.update(cand.transaction_ids)
                        idx += 2
                        continue
                idx += 1
    return candidates


def _near_day_duplicate_candidates(
    transactions: list[FeatureTransaction],
    same_day_candidates: list[DuplicateCandidate],
    misses: list[NearMiss] | None = None,
) -> list[DuplicateCandidate]:
    """Exactly two identical purchases one to three days apart, from a known merchant.

    A card charge can post a day or two late, so a real double charge is not always
    same-day. The evidence is weaker, so this only keeps pairs that are not routine:
    a merchant and amount seen three or more times is a habit or a subscription, and a
    merchant with any same-day candidate is left to the same-day rules.
    """
    same_day_ids = {tx_id for item in same_day_candidates for tx_id in item.transaction_ids}
    same_day_merchants = {item.merchant_name for item in same_day_candidates}
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if (
            item.categorisation.transaction_class in _NON_PURCHASE_CLASSES
            or item.categorisation.transaction_class == "person_to_person"
            or item.transaction_date is None
            or item.transaction_type == "credit"
            or is_purchase_reversal(item)
            or _is_debit_order_transaction(item)
        ):
            continue
        if (merchant := merchant_group_key(item)) is not None:
            groups[merchant].append(item)

    candidates: list[DuplicateCandidate] = []
    for merchant, items in groups.items():
        if merchant in same_day_merchants:
            continue
        items.sort(key=lambda item: (item.transaction_date, item.transaction_id))
        for first, second in zip(items, items[1:]):
            gap = (second.transaction_date - first.transaction_date).days
            amount = amount_of(first)
            if (
                gap < 1
                or gap > NEAR_DAY_DUPLICATE_MAX_DAYS + NEAR_DAY_DUPLICATE_REPORT_EXTRA_DAYS
                or abs(amount_of(second) - amount) > AMOUNT_TOLERANCE
                or first.transaction_id in same_day_ids
                or second.transaction_id in same_day_ids
            ):
                continue

            def miss(code: str, detail: str | None = None) -> None:
                if misses is not None:
                    misses.append(
                        build_near_miss(
                            "duplicate_payment_leak",
                            code,
                            merchant=merchant,
                            amount=amount,
                            dates=[first.transaction_date, second.transaction_date],
                            detail=detail,
                        )
                    )

            if amount < NEAR_DAY_DUPLICATE_MIN_AMOUNT:
                # Tiny repeats (airtime, small snacks) are not worth a line in the list.
                if amount >= NEAR_MISS_MIN_LISTED_AMOUNT:
                    miss("below_minimum_amount", "Pairs a few days apart are only raised from R100.")
                continue
            if gap > NEAR_DAY_DUPLICATE_MAX_DAYS:
                miss("outside_day_window", f"These were {gap} days apart (the limit is three).")
                continue
            same_amount_count = sum(
                1 for other in items if abs(amount_of(other) - amount) <= AMOUNT_TOLERANCE
            )
            if same_amount_count != 2:
                miss("repeated_routine")
                continue
            candidate = _maybe_build_candidate(
                merchant,
                [first, second],
                transactions,
                debit_items=[],
                debit_month_count=0,
                months_with_multiple_debits=0,
            )
            if candidate is None:
                continue
            basis = [
                "near_day_window" if value == "billing_cycle_window" else value
                for value in candidate.match_basis
                if value != "close_timestamp"
            ]
            # Times of day on different days say nothing about a double charge.
            candidates.append(
                candidate.model_copy(
                    update={
                        "match_basis": basis,
                        "max_time_gap_minutes": None,
                        "min_time_gap_minutes": None,
                    }
                )
            )
    return candidates


def _irregular_candidates(
    transactions: list[FeatureTransaction],
    misses: list[NearMiss] | None = None,
) -> list[IrregularCandidate]:
    """Keep only explainable outliers; transfers and people are never leak candidates."""
    eligible = [
        item
        for item in transactions
        if item.transaction_date is not None
        and item.transaction_type != "credit"
        and is_purchase_spending_candidate(item)
        and _has_reliable_irregular_category(item)
        and amount_of(item) > ZERO
    ]
    amounts_by_category: defaultdict[str, list[Decimal]] = defaultdict(list)
    for item in eligible:
        category = item.categorisation.category_name or "Other"
        amounts_by_category[category].append(amount_of(item))
    candidates: list[IrregularCandidate] = []

    def miss(item: FeatureTransaction, code: str, detail: str | None = None) -> None:
        if misses is not None:
            misses.append(
                build_near_miss(
                    "irregular_transaction_leak",
                    code,
                    merchant=merchant_group_key(item),
                    amount=amount_of(item),
                    dates=[item.transaction_date],
                    detail=detail,
                )
            )

    for item in eligible:
        category = item.categorisation.category_name or "Other"
        amounts = amounts_by_category[category]
        if len(amounts) < 4:
            if amount_of(item) >= Decimal("500"):
                miss(item, "too_little_history", f"Only {len(amounts)} in {category}.")
            continue
        baseline_amounts = [
            amount_of(other)
            for other in eligible
            if other.transaction_id != item.transaction_id
            and (other.categorisation.category_name or "Other") == category
        ]
        if len(baseline_amounts) < 3:
            continue
        baseline = Decimal(str(median(baseline_amounts)))
        if baseline <= ZERO:
            continue
        multiple = amount_of(item) / baseline
        if multiple < Decimal("3") or amount_of(item) < Decimal("500"):
            if amount_of(item) >= Decimal("500") and multiple >= Decimal("2"):
                miss(item, "below_outlier_multiple", f"It is {multiple:.1f} times the usual {category} amount.")
            elif multiple >= Decimal("3") and amount_of(item) >= Decimal("400"):
                # Only a purchase close to the R500 line is worth listing; ordinary
                # grocery trips above three times the median would only add noise.
                miss(item, "below_outlier_amount")
            continue
        candidates.append(
            IrregularCandidate(
                transaction_id=item.transaction_id,
                merchant_name=merchant_group_key(item),
                amount=amount_of(item),
                transaction_date=item.transaction_date,
                transaction_time=item.transaction_time,
                transaction_description=item.description,
                transaction_type=item.transaction_type,
                category_name=category,
                category_transaction_count=len(amounts),
                baseline_sample_size=len(baseline_amounts),
                category_median_amount=baseline,
                difference_from_baseline=amount_of(item) - baseline,
                amount_multiple_of_category_median=multiple,
                reason="amount_outlier_for_category",
            )
        )
    return candidates


def _has_reliable_irregular_category(item: FeatureTransaction) -> bool:
    category = (item.categorisation.category_name or "").strip()
    if not category or category.casefold() == "other":
        return False
    if category in {
        "Transfers",
        "Savings",
        "Other Income",
        "Salary",
        "Income",
        "Bank Fees",
        "Cash Withdrawal",
        "Cash Withdrawals",
        "ATM Cash Withdrawal",
    }:
        return False
    # A big grocery shop, fuel fill or medical bill is a normal part of life, not an
    # unusual purchase worth a second look, whichever merchant it was made at.
    if category in ESSENTIAL_SPENDING_CATEGORIES:
        return False
    if (item.categorisation.rule or "").startswith("fallback"):
        return False
    return item.categorisation.category_confidence >= Decimal("0.70")


def _reference_tokens(description: str | None) -> set[str]:
    if not description:
        return set()
    return {match.group(1).upper() for match in _REFERENCE_TOKEN.finditer(description)}


def _maybe_build_candidate(
    merchant: str,
    transactions: list[FeatureTransaction],
    all_transactions: list[FeatureTransaction],
    *,
    debit_items: list[FeatureTransaction],
    debit_month_count: int,
    months_with_multiple_debits: int,
) -> DuplicateCandidate | None:
    if _is_overlapping_statement_import_copy(transactions):
        return None
    unidentified = merchant.startswith(UNIDENTIFIED_GROUP_PREFIX)
    is_debit_order = all(_is_debit_order_transaction(item) for item in transactions)
    if unidentified and is_debit_order:
        return None
    if is_debit_order:
        if months_with_multiple_debits >= 2:
            return None
        if _has_conflicting_debit_order_mandate(transactions, merchant):
            return None
    dates = [item.transaction_date for item in transactions if item.transaction_date is not None]
    amounts = [amount_of(item) for item in transactions]
    shift_days = (max(dates) - min(dates)).days if dates else 0
    amount_variance = (max(amounts) - min(amounts)) if amounts else ZERO
    descriptions = {
        (item.description or "").strip().upper()
        for item in transactions
        if (item.description or "").strip()
    }
    reference_sets = [_mandate_tokens(item.description) for item in transactions]
    non_empty_refs = [refs for refs in reference_sets if refs]
    shared_refs = False
    if len(non_empty_refs) >= 2:
        shared_refs = bool(set.intersection(*non_empty_refs))
    observed = dates[0] if dates else None
    latest_observed = dates[-1] if dates else None
    nearby_reversal = False
    if observed is not None and latest_observed is not None:
        group_ids = {item.transaction_id for item in transactions}
        max_date_window = 7 if is_debit_order else 0
        for item in all_transactions:
            if item.transaction_id in group_ids or item.transaction_date is None:
                continue
            if not (
                observed <= item.transaction_date <= latest_observed + timedelta(days=max_date_window)
            ):
                continue
            if is_debit_order:
                if not any(_debit_order_similar_amount(amount_of(item), amt) for amt in amounts):
                    continue
                item_merchant = merchant_group_key(item)
                if item_merchant is not None and item_merchant != merchant:
                    continue
            else:
                if abs(amount_of(item) - amounts[0]) > AMOUNT_TOLERANCE:
                    continue
            if is_purchase_reversal(item) or item.transaction_type == "credit":
                nearby_reversal = True
                break
    match_basis = [
        "merchant",
        "amount" if amount_variance <= AMOUNT_TOLERANCE else "similar_amount",
        "calendar_day" if shift_days == 0 else "billing_cycle_window",
    ]
    if is_debit_order:
        match_basis.append("debit_order_channel")
        if debit_month_count >= 2 and len(debit_items) >= 3:
            match_basis.append("recurring_history")
    if shared_refs:
        match_basis.append("shared_reference")
    if nearby_reversal:
        match_basis.append("nearby_reversal_or_refund")
    min_time_gap = _min_time_gap_minutes(transactions)
    if min_time_gap is not None and min_time_gap <= 15:
        match_basis.append("close_timestamp")
    representative_amount = max(amounts) if amounts else ZERO
    all_timed = all(item.transaction_time is not None for item in transactions)
    categories = {
        (item.categorisation.category_name or "").strip()
        for item in transactions
        if (item.categorisation.category_name or "").strip()
    }
    return DuplicateCandidate(
        description_signature=(
            merchant.removeprefix(UNIDENTIFIED_GROUP_PREFIX) if unidentified else None
        ),
        max_time_gap_minutes=_max_time_gap_minutes(transactions) if all_timed else None,
        category_name=next(iter(categories)) if len(categories) == 1 else None,
        group_key=f"{merchant}:{dates[0].isoformat()}:{representative_amount}",
        merchant_name=merchant,
        amount=representative_amount,
        transaction_ids=[item.transaction_id for item in transactions],
        transaction_dates=dates,
        high_confidence_transaction_count=sum(
            item.categorisation.classification_confidence >= HIGH_CONFIDENCE
            for item in transactions
        ),
        distinct_description_count=len(descriptions),
        shared_reference_tokens=shared_refs,
        nearby_reversal_or_refund=nearby_reversal,
        min_time_gap_minutes=min_time_gap,
        match_basis=match_basis,
        is_debit_order=is_debit_order,
        recurring_debit_order_count=len(debit_items) if is_debit_order else 0,
        recurring_debit_order_months=debit_month_count if is_debit_order else 0,
        billing_date_shift_days=shift_days,
        amount_variance=amount_variance,
    )


def _max_time_gap_minutes(transactions: list[FeatureTransaction]) -> int | None:
    times = sorted(
        item.transaction_time.hour * 3600
        + item.transaction_time.minute * 60
        + item.transaction_time.second
        for item in transactions
        if item.transaction_time is not None
    )
    if len(times) < 2:
        return None
    return max((times[idx + 1] - times[idx]) // 60 for idx in range(len(times) - 1))


def _min_time_gap_minutes(transactions: list[FeatureTransaction]) -> int | None:
    times = sorted(
        item.transaction_time.hour * 3600
        + item.transaction_time.minute * 60
        + item.transaction_time.second
        for item in transactions
        if item.transaction_time is not None
    )
    if len(times) < 2:
        return None
    return min((times[idx + 1] - times[idx]) // 60 for idx in range(len(times) - 1))
