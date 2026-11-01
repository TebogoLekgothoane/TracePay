"""Category-growth materiality: ordinary movement is not a finding, real change is."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from leak_intelligence.growth_materiality import (
    GROWTH_MATERIALITY,
    GrowthMateriality,
    assess_category_growth,
)
from leak_intelligence.models import CategoryFeature, ConfidenceSupport
from tests.test_leak_detection import _detect, _transaction

D = Decimal


def _month(year: int, month: int) -> tuple[int, int]:
    return year, month


def _spend(category, merchant, plan, *, confidence=0.95, closing=True, class_="spending"):
    """``plan`` maps (year, month) to the purchase amounts in that month.

    A closing purchase at another merchant in the month after the last one makes the
    last planned month a completed month, as it is in real statements.
    """
    rows = []
    for (year, month), amounts in plan.items():
        for index, amount in enumerate(amounts):
            rows.append(
                _transaction(
                    f"{merchant}-{year}{month:02d}-{index}", str(amount), date(year, month, 3 + index * 4),
                    merchant=merchant, category=category, confidence=confidence, transaction_class=class_,
                )
            )
    if closing:
        year, month = max(plan)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        rows.append(_transaction("closing", "50", date(year, month, 20), merchant="CHECKERS", category="Groceries"))
    return rows


def _months(start, count):
    year, month = start
    out = []
    for _ in range(count):
        out.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out


def _plan(amounts_by_month, start=(2026, 3)):
    return {key: value for key, value in zip(_months(start, len(amounts_by_month)), amounts_by_month)}


def _growth_types(rows):
    return {leak.leak_type for leak in _detect(rows).leaks}


def _feature(totals, counts=None, largest=None):
    keys = [f"2026-{index + 1:02d}" for index in range(len(totals))]
    return CategoryFeature(
        category_name="Restaurants",
        category_transaction_count=sum((counts or [1] * len(totals))),
        category_total_amount=sum(totals, D("0")),
        category_average_amount=D("0"),
        category_monthly_total={key: D(value) for key, value in zip(keys, totals)},
        category_monthly_transaction_count={key: value for key, value in zip(keys, counts or [1] * len(totals))},
        category_monthly_max_amount={key: D(value) for key, value in zip(keys, largest or totals)},
        confidence_support=ConfidenceSupport(
            supporting_transaction_count=10, high_confidence_transaction_count=10
        ),
    ), keys


def _assess(totals, counts=None, largest=None, *, essential=False, thresholds=None):
    feature, keys = _feature(totals, counts, largest)
    return assess_category_growth(
        feature, keys[:-1], keys[-1], thresholds or GrowthMateriality(), essential=essential
    )


# ------------------------------------------------------------------ negatives
def test_a_small_increase_is_not_a_finding() -> None:
    rows = _spend("Restaurants", "NANDOS", _plan([[300], [300], [300], [300], [330]]))
    assert "food_spending_leak" not in _growth_types(rows)


def test_a_large_percentage_on_an_insignificant_amount_is_not_a_finding() -> None:
    rows = _spend("Restaurants", "NANDOS", _plan([[40], [40], [40], [40], [90]]))  # +125%, +R50
    assert "food_spending_leak" not in _growth_types(rows)
    result = _assess([40, 40, 40, 40, 90])
    assert not result.passes and "below_rand_floor" in result.reasons


def test_one_large_purchase_among_ordinary_ones_is_not_a_trend() -> None:
    plan = _plan([[150, 150]] * 4 + [[150, 150, 400]])
    assert "food_spending_leak" not in _growth_types(_spend("Restaurants", "NANDOS", plan))
    result = _assess([300] * 4 + [700], counts=[2] * 4 + [3], largest=[150] * 4 + [400])
    assert "single_purchase" in result.reasons


def test_a_one_month_bump_is_a_temporary_spike() -> None:
    result = _assess([300] * 4 + [420])  # +R120 (40%), one comparison, not a step change
    assert not result.passes and "temporary_spike" in result.reasons


def test_an_unstable_baseline_is_not_a_baseline() -> None:
    plan = _plan([[100], [500], [120], [480], [700]])
    assert "food_spending_leak" not in _growth_types(_spend("Restaurants", "NANDOS", plan))
    result = _assess([100, 500, 120, 480, 700])
    assert "unstable_baseline" in result.reasons


def test_a_baseline_that_is_simply_trending_up_is_not_called_unstable() -> None:
    result = _assess([200, 300, 450, 700, 1100])
    assert "unstable_baseline" not in result.reasons


def test_a_missing_statement_month_leaves_too_little_history() -> None:
    # March and April, no May, then June and July: only June onward is contiguous.
    plan = {(2026, 3): [300], (2026, 4): [300], (2026, 6): [300], (2026, 7): [650]}
    assert "food_spending_leak" not in _growth_types(_spend("Restaurants", "NANDOS", plan))


def test_incomplete_classification_coverage_is_not_a_finding() -> None:
    rows = _spend("Restaurants", "NANDOS", _plan([[300], [300], [300], [300], [900]]), confidence=0.35)
    assert "food_spending_leak" not in _growth_types(rows)


def test_a_seasonal_repeat_is_not_a_finding() -> None:
    december_both_years = _plan(
        [[300]] * 2 + [[700]] + [[300]] * 11 + [[700]], start=(2025, 10)
    )
    assert max(december_both_years) == (2026, 12)
    seasonal = _spend("Restaurants", "NANDOS", december_both_years)
    assert "food_spending_leak" not in _growth_types(seasonal)

    # The same December, but last December was ordinary: nothing explains it as seasonal.
    first_time = _plan([[300]] * 15, start=(2025, 10))
    first_time[(2026, 12)] = [700]
    assert "food_spending_leak" in _growth_types(_spend("Restaurants", "NANDOS", first_time))


def test_the_seasonal_check_is_recorded_in_the_metrics() -> None:
    keys = ["2025-12"] + [f"2026-{month:02d}" for month in range(1, 13)]
    values = [700] + [300] * 11 + [700]  # December both years, ordinary in between
    feature, _ = _feature(values)
    feature = feature.model_copy(
        update={
            "category_monthly_total": {key: D(value) for key, value in zip(keys, values)},
            "category_monthly_transaction_count": {key: 1 for key in keys},
            "category_monthly_max_amount": {key: D(value) for key, value in zip(keys, values)},
        }
    )
    result = assess_category_growth(feature, keys[:-1], keys[-1], GrowthMateriality(), essential=False)
    assert result.metrics["same_month_last_year_elevated"] is True
    assert "seasonal_repeat" in result.reasons


# ------------------------------------------------------------------ preserved
def test_a_large_absolute_increase_counts_even_at_a_modest_percentage() -> None:
    result = _assess([4000, 4000, 4000, 4000, 4520])  # +13%, +R520
    assert result.passes and result.basis == "large_absolute_increase"
    plan = _plan([[4000]] * 4 + [[4520]])
    assert "food_spending_leak" in _growth_types(_spend("Restaurants", "NANDOS", plan))


def test_a_sustained_rise_needs_only_the_lower_percentage() -> None:
    sustained = _assess([1000, 1000, 1000, 1100, 1150, 1190])  # +13.3%, three rises in a row
    assert sustained.passes and sustained.basis == "sustained_increase"
    assert sustained.metrics["consecutive_rising_comparisons"] >= 3
    one_month = _assess([1000, 1000, 1000, 1000, 1000, 1133])  # same size, not sustained
    assert not one_month.passes


def test_a_meaningful_change_in_essential_spending_keeps_the_existing_bar() -> None:
    rows = _spend("Fuel", "SHELL", _plan([[1000], [1000], [1000], [1000], [1120]]))
    assert "transport_spending_leak" in _growth_types(rows)  # +12%, +R120, essential
    discretionary = _spend("Restaurants", "NANDOS", _plan([[1000], [1000], [1000], [1000], [1120]]))
    assert "food_spending_leak" not in _growth_types(discretionary)  # same numbers


def test_a_broad_rise_in_purchases_is_strong_evidence_without_a_second_month() -> None:
    result = _assess([300] * 4 + [400], counts=[5] * 4 + [8], largest=[60] * 4 + [50])
    assert result.passes and result.basis == "broad_activity"


def test_a_substantial_step_change_is_evident_with_a_short_history() -> None:
    result = _assess([185, 185, 440])  # two baseline months, +R255, +138%
    assert result.passes and result.basis == "substantial_step_change"


def test_a_two_month_comparison_of_a_modest_rise_is_not_enough() -> None:
    result = _assess([80, 80, 200])  # +R120 on R80: too small to be a step change
    assert not result.passes and "short_baseline" in result.reasons


# ------------------------------------------------------- scope and presentation
def test_only_the_broad_discretionary_leak_types_are_assessed() -> None:
    assert set(GROWTH_MATERIALITY) == {"food_spending_leak", "transport_spending_leak"}


def test_a_growth_finding_is_an_observation_not_a_confirmed_loss() -> None:
    rows = _spend("Restaurants", "NANDOS", _plan([[300], [300], [300], [300], [900]]))
    [leak] = [item for item in _detect(rows).leaks if item.leak_type == "food_spending_leak"]
    assert leak.evidence["growth_is_not_a_confirmed_loss"] is True
    assert leak.evidence["growth_materiality_basis"] in {"large_absolute_increase", "substantial_step_change"}
    assert leak.evidence["growth_materiality_metrics"]["absolute_increase"] == D("600")
    assert leak.evidence["evidence_status"] == "possible"
    assert leak.impact_kind == "estimated" and leak.estimated_annual_impact is None


def test_thresholds_are_configurable() -> None:
    totals = [250, 250, 250, 250, 330]  # +R80, +32%
    assert not _assess(totals).passes
    loose = GrowthMateriality(min_absolute=D("50"), min_consecutive=1)
    assert _assess(totals, thresholds=loose).passes
    strict = GrowthMateriality(min_absolute=D("100"), min_relative_percent=D("40"))
    assert not _assess([1000] * 4 + [1250], thresholds=strict).passes


def test_airtime_and_data_growth_is_not_subject_to_the_general_bar() -> None:
    assert "airtime_data_leak" not in GROWTH_MATERIALITY
