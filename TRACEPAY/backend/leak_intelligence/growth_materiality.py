"""Is a category's rise a meaningful change or ordinary month-to-month movement?

A category-growth finding says spending in one category is higher than its
baseline. It is an observation about spending, never a confirmed loss. This
module decides whether the rise is worth showing: a few rand of drift, a single
purchase, a one-month spike, a shaky baseline or last year's same-month pattern
are not; a large, sustained, broad or essential-spending change is.

Thresholds are data, not code, so they can be tuned or compared. They are applied
only to the leak types listed in ``GROWTH_MATERIALITY``; other categories keep
their own, more specific rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Mapping

from .models import CategoryFeature

D = Decimal


@dataclass(frozen=True)
class GrowthMateriality:
    """Thresholds for one kind of category-growth finding."""

    # The ordinary bar: a rise must be at least this share of the baseline and this many rand.
    min_relative_percent: Decimal = D("15")
    min_absolute: Decimal = D("100")
    # Months of baseline before the comparison, and how many consecutive comparisons
    # (this month and those before it) must each show a rise.
    min_baseline_months: int = 3
    min_consecutive: int = 2
    # A rise that has held for this many consecutive comparisons is sustained, and then
    # needs only the lower relative bar (the rand floor still applies).
    sustained_consecutive: int = 3
    sustained_min_relative_percent: Decimal = D("10")
    # Essential spending (groceries, fuel, utilities...) keeps the pre-existing bar.
    essential_min_relative_percent: Decimal = D("10")
    essential_min_absolute: Decimal = D("50")
    # A step change (spending up by at least half and by at least twice the rand floor)
    # is evident without a long history or a second month to confirm it.
    step_change_min_relative_percent: Decimal = D("50")
    step_change_absolute_multiple: Decimal = D("2")
    # A rise this large in rand always counts, whatever its percentage or history.
    large_absolute: Decimal = D("500")
    # A baseline this unstable is not a baseline, unless it is simply trending upward.
    max_baseline_cv: Decimal = D("0.35")
    # One purchase that accounts for this share of the rise (with no broader activity).
    one_off_share: Decimal = D("0.60")
    # Extra purchases beyond the baseline count that make a rise broad-based.
    broad_extra_transactions: int = 3


@dataclass(frozen=True)
class GrowthAssessment:
    passes: bool
    # Why it passes (one basis) or why it does not (one or more reasons).
    basis: str | None
    reasons: tuple[str, ...]
    metrics: Mapping[str, object] = field(default_factory=dict)


#: Which category-growth findings are assessed, and with what. A leak type that is
#: absent (airtime and data, which has its own count and total rules) is untouched.
GROWTH_MATERIALITY: dict[str, GrowthMateriality] = {
    "food_spending_leak": GrowthMateriality(),
    "transport_spending_leak": GrowthMateriality(),
}


def _average(values: list[Decimal]) -> Decimal:
    return sum(values, D("0")) / D(len(values)) if values else D("0")


def _coefficient_of_variation(values: list[Decimal]) -> Decimal:
    if len(values) < 2:
        return D("0")
    mean = _average(values)
    if mean == 0:
        return D("0")
    variance = sum(((value - mean) ** 2 for value in values), D("0")) / D(len(values))
    return variance.sqrt() / mean


def _is_trending_up(values: list[Decimal]) -> bool:
    """Every month at least about as high as the one before (no more than 5% lower)."""
    return all(later >= earlier * D("0.95") for earlier, later in zip(values, values[1:]))


def assess_category_growth(
    feature: CategoryFeature,
    baseline_months: list[str],
    current_period: str,
    thresholds: GrowthMateriality,
    *,
    essential: bool,
) -> GrowthAssessment:
    totals = feature.category_monthly_total
    counts = feature.category_monthly_transaction_count
    largest = feature.category_monthly_max_amount
    baseline = [totals.get(month, D("0")) for month in baseline_months]
    current = totals.get(current_period, D("0"))
    baseline_average = _average(baseline)
    increase = current - baseline_average
    relative = (increase / baseline_average * D("100")) if baseline_average > 0 else D("0")

    # Each comparison in the run asks: was this month above the average of the months before it?
    series = [*baseline_months, current_period]
    consecutive = 0
    for index in range(len(series) - 1, 1, -1):
        earlier = [totals.get(month, D("0")) for month in series[:index]]
        mean = _average(earlier)
        rise = totals.get(series[index], D("0")) - mean
        if mean > 0 and rise >= D("50") and rise / mean * D("100") >= D("10"):
            consecutive += 1
        else:
            break

    baseline_counts = [D(counts.get(month, 0)) for month in baseline_months]
    extra_transactions = int(D(counts.get(current_period, 0)) - _average(baseline_counts))
    baseline_largest = _average([largest.get(month, D("0")) for month in baseline_months])
    one_purchase_rise = largest.get(current_period, D("0")) - baseline_largest
    single_share = (one_purchase_rise / increase) if increase > 0 else D("0")
    cv = _coefficient_of_variation(baseline)
    trending = _is_trending_up(baseline)

    year, _, month_number = current_period.partition("-")
    last_year = f"{int(year) - 1}-{month_number}" if year.isdigit() else ""
    seasonal = bool(
        last_year in totals
        and baseline_average > 0
        and totals[last_year] >= baseline_average * D("1.10")
    )

    metrics = {
        "baseline_month_count": len(baseline),
        "baseline_average": baseline_average,
        "current_amount": current,
        "absolute_increase": increase,
        "relative_increase_percent": relative,
        "consecutive_rising_comparisons": consecutive,
        "baseline_variation": cv,
        "baseline_trending_up": trending,
        "single_purchase_share_of_increase": single_share,
        "extra_transactions": extra_transactions,
        "same_month_last_year_elevated": seasonal,
        "essential_category": essential,
    }

    # Whatever else is true, a rise this large in rand is worth showing.
    if increase >= thresholds.large_absolute:
        return GrowthAssessment(True, "large_absolute_increase", (), metrics)

    step_change = (
        increase >= thresholds.min_absolute * thresholds.step_change_absolute_multiple
        and relative >= thresholds.step_change_min_relative_percent
    )
    metrics = {**metrics, "step_change": step_change}
    reasons: list[str] = []
    if len(baseline) < thresholds.min_baseline_months and not essential and not step_change:
        reasons.append("short_baseline")
    if cv > thresholds.max_baseline_cv and not trending:
        reasons.append("unstable_baseline")
    if seasonal:
        reasons.append("seasonal_repeat")
    broad = extra_transactions >= thresholds.broad_extra_transactions
    # "One purchase among others": with a single purchase a month there is nothing
    # to single out, and a rising monthly purchase is a trend, not a one-off.
    one_purchase_among_others = counts.get(current_period, 0) >= 2
    if one_purchase_among_others and single_share >= thresholds.one_off_share and not broad:
        reasons.append("single_purchase")
    sustained = consecutive >= thresholds.sustained_consecutive
    if consecutive < thresholds.min_consecutive and not broad and not essential and not step_change:
        reasons.append("temporary_spike")

    if essential:
        sized = (
            increase >= thresholds.essential_min_absolute
            and relative >= thresholds.essential_min_relative_percent
        )
        basis = "essential_spending"
    elif step_change:
        sized = True
        basis = "substantial_step_change"
    elif sustained:
        sized = (
            increase >= thresholds.min_absolute
            and relative >= thresholds.sustained_min_relative_percent
        )
        basis = "sustained_increase"
    else:
        sized = (
            increase >= thresholds.min_absolute and relative >= thresholds.min_relative_percent
        )
        basis = "broad_activity" if broad else "relative_and_absolute"
    if not sized:
        reasons.append(
            "below_rand_floor"
            if increase < (thresholds.essential_min_absolute if essential else thresholds.min_absolute)
            else "below_percentage_floor"
        )

    if reasons:
        return GrowthAssessment(False, None, tuple(reasons), metrics)
    return GrowthAssessment(True, basis, (), metrics)
