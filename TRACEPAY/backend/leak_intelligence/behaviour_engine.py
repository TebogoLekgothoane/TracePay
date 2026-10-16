"""Pure, conservative interpretation of FinancialFeatureSnapshot observations."""

from __future__ import annotations

import hashlib
import re
from datetime import date
from decimal import Decimal

from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation, BehaviorType
from .engine import RECURRENCE_MIN_OBSERVATIONS
from .merchant_display import is_reliable_merchant_display_name
from .common import ZERO
from .models import ConfidenceSupport, FinancialFeatureSnapshot, MerchantFeature
from .import_quality import unreliable_quality_affects_months
from .periods import (
    completed_months,
    contiguous_month_suffix,
    exclude_incomplete_final_month,
    exclude_incomplete_opening_month,
)
from .recurrence_rules import matches_plausible_recurring_interval

MIN_TREND_MONTHS = 3
MIN_RELATIVE_CHANGE_PERCENT = Decimal("10")
MIN_ABSOLUTE_CHANGE = Decimal("50")
# Reject percentage comparisons when the baseline is too small to be meaningful.
MIN_BASELINE_AMOUNT = Decimal("50")
MIN_HIGH_CONFIDENCE_RATIO = Decimal("0.60")
MIN_OBSERVATION_CONFIDENCE = 0.55
MIN_WEEKEND_SPENDING_TRANSACTIONS = 10
MIN_PAYDAY_SPENDING_TRANSACTIONS = 10
MIN_FEE_BURDEN_TOTAL = Decimal("10")


def _coverage_bounds(
    snapshot: FinancialFeatureSnapshot,
) -> tuple[date | None, date | None]:
    """Observation bounds for incompleteness checks (declared dates when available)."""
    return (
        snapshot.coverage_observation_start or snapshot.date_start,
        snapshot.coverage_observation_end or snapshot.date_end,
    )


def analyze_behaviour(snapshot: FinancialFeatureSnapshot) -> BehaviourAnalysisResult:
    """Return neutral behavioural observations from one user's feature snapshot."""
    observations: list[BehaviourObservation] = []
    if snapshot.transaction_count == 0:
        return _result(snapshot, observations)

    observations.extend(_spending_observations(snapshot))
    observations.extend(_category_observations(snapshot))
    observations.extend(_merchant_observations(snapshot))
    observations.extend(_recurring_observations(snapshot))
    observations.extend(_calendar_observations(snapshot))
    observations.extend(_cash_and_fee_observations(snapshot))
    observations.extend(_income_observations(snapshot))
    observations.extend(_duplicate_observations(snapshot))
    return _result(snapshot, sorted(observations, key=lambda item: (-item.confidence, item.observation_id)))


def _result(
    snapshot: FinancialFeatureSnapshot, observations: list[BehaviourObservation]
) -> BehaviourAnalysisResult:
    return BehaviourAnalysisResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        observations=observations,
    )


def _spending_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observation_start, observation_end = _coverage_bounds(snapshot)
    compare = _period_compare(
        [
            (
                month.month,
                month.total_outflow,
                month.outflow_transaction_count,
            )
            for month in snapshot.months
        ],
        observation_end,
        observation_start,
    )
    if compare is None:
        return []
    compared_months = [
        *[str(item) for item in (compare.get("baseline_months") or [])],
        str(compare["current_period"]),
    ]
    imports_by_id = {
        item.import_id: item for item in snapshot.statement_import_quality
    }
    if unreliable_quality_affects_months(
        month_keys=compared_months,
        import_ids_by_month=snapshot.import_ids_by_month,
        imports_by_id=imports_by_id,
    ):
        # Confirmed import-quality failure for months in this comparison — do not
        # emit an apparently reliable spending change finding.
        return []
    observation = _change_observation(
        behavior_type="spending_increase" if compare["change_amount"] > 0 else "spending_decrease",
        title="Total spending increased" if compare["change_amount"] > 0 else "Total spending decreased",
        subject="total spending",
        compare=compare,
        support=None,
        supporting_features=[
            "months[].total_outflow",
            "months[].outflow_transaction_count",
        ],
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
    )
    return [observation] if observation else []


def _category_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    for feature in snapshot.categories:
        coverage_start, coverage_end = _coverage_bounds(snapshot)
        compare = _period_compare(
            [
                (month, amount, feature.category_monthly_transaction_count.get(month, 0))
                for month, amount in feature.category_monthly_total.items()
            ],
            coverage_end,
            coverage_start,
        )
        if compare is None:
            continue
        behavior_type: BehaviorType = (
            "category_growth" if compare["change_amount"] > 0 else "category_decline"
        )
        observation = _change_observation(
            behavior_type=behavior_type,
            title=(
                f"{feature.category_name} spending increased"
                if compare["change_amount"] > 0
                else f"{feature.category_name} spending decreased"
            ),
            subject=feature.category_name,
            compare=compare,
            support=feature.confidence_support,
            supporting_features=[
                f"categories[{feature.category_name}].category_monthly_total",
                f"categories[{feature.category_name}].confidence_support",
            ],
            period_start=snapshot.date_start,
            period_end=snapshot.date_end,
        )
        if observation:
            observations.append(observation)
    return observations


def _merchant_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    total_spending = snapshot.spending_profile.total_spending
    for feature in snapshot.merchants:
        coverage_start, coverage_end = _coverage_bounds(snapshot)
        spend_compare = _period_compare(
            [
                (month, amount, feature.merchant_monthly_transaction_count.get(month, 0))
                for month, amount in feature.merchant_monthly_totals.items()
            ],
            coverage_end,
            coverage_start,
        )
        if spend_compare:
            observation = _change_observation(
                behavior_type=(
                    "merchant_spend_increase"
                    if spend_compare["change_amount"] > 0
                    else "merchant_spend_decrease"
                ),
                title=(
                    f"Spending at {feature.merchant_name} increased"
                    if spend_compare["change_amount"] > 0
                    else f"Spending at {feature.merchant_name} decreased"
                ),
                subject=feature.merchant_name,
                compare=spend_compare,
                support=feature.confidence_support,
                supporting_features=[
                    f"merchants[{feature.merchant_name}].merchant_monthly_totals",
                    f"merchants[{feature.merchant_name}].confidence_support",
                ],
                period_start=feature.merchant_first_transaction_date,
                period_end=feature.merchant_last_transaction_date,
            )
            if observation:
                observations.append(observation)

        frequency_compare = _count_compare(
            feature.merchant_monthly_transaction_count,
            coverage_end,
            coverage_start,
        )
        if (
            frequency_compare
            and feature.merchant_transaction_count >= 6
            and _support_ratio(feature.confidence_support) >= MIN_HIGH_CONFIDENCE_RATIO
        ):
            behavior_type = (
                "merchant_frequency_increase"
                if frequency_compare["change_count"] > 0
                else "merchant_frequency_decrease"
            )
            observations.append(
                _observation(
                    behavior_type,
                    (
                        f"{feature.merchant_name} transaction frequency increased"
                        if frequency_compare["change_count"] > 0
                        else f"{feature.merchant_name} transaction frequency decreased"
                    ),
                    "Transaction frequency changed across the observed monthly periods.",
                    _severity(
                        frequency_compare["change_percentage"],
                        Decimal(abs(frequency_compare["change_count"])) * Decimal("50"),
                    ),
                    _confidence(feature.confidence_support, len(feature.merchant_monthly_transaction_count), Decimal("0.8")),
                    {
                        "merchant_key": feature.merchant_name,
                        **frequency_compare,
                    },
                    [
                        f"merchants[{feature.merchant_name}].merchant_monthly_transaction_count",
                        f"merchants[{feature.merchant_name}].confidence_support",
                    ],
                    feature.merchant_first_transaction_date,
                    feature.merchant_last_transaction_date,
                )
            )

        if (
            total_spending not in (None, Decimal("0"))
            and feature.merchant_transaction_count >= 5
            and feature.merchant_total_amount / total_spending >= Decimal("0.30")
            and total_spending >= Decimal("500")
            and _support_ratio(feature.confidence_support) >= MIN_HIGH_CONFIDENCE_RATIO
        ):
            share = feature.merchant_total_amount / total_spending
            observations.append(
                _observation(
                    "merchant_concentration",
                    f"Spending is concentrated at {feature.merchant_name}",
                    "This merchant represents a large share of categorised spending in the observed period.",
                    "medium" if share < Decimal("0.50") else "high",
                    _confidence(feature.confidence_support, len(feature.merchant_monthly_totals), Decimal("0.8")),
                    {
                        "merchant_key": feature.merchant_name,
                        "merchant_total": feature.merchant_total_amount,
                        "total_spending": total_spending,
                        "merchant_share_of_spending": share,
                        "transaction_count": feature.merchant_transaction_count,
                    },
                    [
                        f"merchants[{feature.merchant_name}].merchant_total_amount",
                        "spending_profile.total_spending",
                    ],
                    feature.merchant_first_transaction_date,
                    feature.merchant_last_transaction_date,
                )
            )

        trend = feature.merchant_amount_trend
        if trend and trend.amount_change and trend.amount_change > 0 and trend.percentage_change:
            if _material_change(trend.amount_change, trend.percentage_change) and _support_ratio(feature.confidence_support) >= MIN_HIGH_CONFIDENCE_RATIO:
                subscription_creep = _subscription_recurring_merchant(feature)
                insurance_increase = (
                    not subscription_creep and _insurance_recurring_merchant(feature)
                )
                debit_order_increase = (
                    not subscription_creep
                    and not insurance_increase
                    and _debit_order_recurring_merchant(feature)
                )
                evidence: dict[str, object] = {
                    "merchant_key": feature.merchant_name,
                    "first_amount": trend.first_amount,
                    "latest_amount": trend.latest_amount,
                    "average_previous_amount": trend.average_previous_amount,
                    "change_amount": trend.amount_change,
                    "change_percentage": trend.percentage_change,
                    "observation_count": feature.merchant_transaction_count,
                    "first_observed_date": feature.merchant_first_transaction_date,
                    "last_observed_date": feature.merchant_last_transaction_date,
                }
                if subscription_creep:
                    evidence["finding_focus"] = "subscription_price_creep"
                    evidence["subscription_category"] = True
                    evidence["average_interval_days"] = feature.recurrence.average_interval_days
                    title = f"Observed subscription payment amount increased at {feature.merchant_name}"
                    description = (
                        "Recurring subscription-category payments at this merchant show a "
                        "higher latest amount than the prior observed average. This reflects "
                        "observed transaction amounts only and does not establish an official "
                        "price change or overcharging."
                    )
                elif insurance_increase:
                    evidence["finding_focus"] = "insurance_premium_increase"
                    evidence["insurance_transaction_count"] = feature.insurance_transaction_count
                    evidence["average_interval_days"] = feature.recurrence.average_interval_days
                    title = f"Insurance premium payments increased at {feature.merchant_name}"
                    description = (
                        "Insurance premium payments increased over the analysed period "
                        "and may warrant review."
                    )
                elif debit_order_increase:
                    evidence["finding_focus"] = "debit_order_amount_increase"
                    evidence["debit_order_transaction_count"] = feature.debit_order_transaction_count
                    evidence["average_interval_days"] = feature.recurrence.average_interval_days
                    title = f"Observed debit-order amount increased at {feature.merchant_name}"
                    description = (
                        "Recurring payments described as debit orders show a higher latest "
                        "amount than the prior observed average. This reflects observed "
                        "transaction amounts only and does not establish an official price "
                        "change, an incorrect debit, or overcharging."
                    )
                else:
                    evidence["finding_focus"] = "merchant_price_increase"
                    title = f"Payment amount increased at {feature.merchant_name}"
                    description = (
                        "The latest observed amount is higher than the prior average for "
                        "this merchant and may warrant review."
                    )
                observations.append(
                    _observation(
                        "price_increase_pattern",
                        title,
                        description,
                        _severity(trend.percentage_change, trend.amount_change),
                        _confidence(feature.confidence_support, feature.merchant_transaction_count, Decimal("0.85")),
                        evidence,
                        [f"merchants[{feature.merchant_name}].merchant_amount_trend"],
                        feature.merchant_first_transaction_date,
                        feature.merchant_last_transaction_date,
                    )
                )
        frequency_shift = _debit_order_frequency_shift(feature)
        if frequency_shift is not None:
            observations.append(frequency_shift)
        coffee_habit = _coffee_habit_observation(feature, total_spending)
        if coffee_habit is not None:
            observations.append(coffee_habit)
        convenience_habit = _convenience_store_habit_observation(feature, total_spending)
        if convenience_habit is not None:
            observations.append(convenience_habit)
    return observations


def _coffee_habit_observation(
    feature: MerchantFeature,
    total_spending: Decimal | None,
) -> BehaviourObservation | None:
    coffee_count = feature.coffee_transaction_count
    total_tx = feature.merchant_transaction_count
    if (
        coffee_count < RECURRENCE_MIN_OBSERVATIONS
        or coffee_count * 2 < total_tx
        or not is_reliable_merchant_display_name(feature.merchant_name)
        or _support_ratio(feature.confidence_support) < MIN_HIGH_CONFIDENCE_RATIO
    ):
        return None
    share = (
        feature.merchant_total_amount / total_spending
        if total_spending not in (None, ZERO) and coffee_count == total_tx
        else None
    )
    return _observation(
        "spending_habit_pattern",
        f"Repeated coffee spending at {feature.merchant_name}",
        (
            "Repeated coffee-related spending was observed over the analysed period. "
            "This describes the observed pattern and does not establish that the "
            "purchases were unnecessary."
        ),
        "low",
        _confidence(feature.confidence_support, coffee_count, Decimal("0.70")),
        {
            "merchant_key": feature.merchant_name,
            "finding_focus": "coffee_spending_habit",
            "coffee_transaction_count": coffee_count,
            "merchant_total_amount": feature.merchant_total_amount if coffee_count == total_tx else None,
            "average_transaction_amount": feature.merchant_average_amount if coffee_count == total_tx else None,
            "transaction_frequency": feature.merchant_transaction_frequency,
            "spending_share": share,
            "first_observed_date": feature.merchant_first_transaction_date,
            "last_observed_date": feature.merchant_last_transaction_date,
        },
        [f"merchants[{feature.merchant_name}].coffee_transaction_count"],
        feature.merchant_first_transaction_date,
        feature.merchant_last_transaction_date,
    )


def _convenience_store_habit_observation(
    feature: MerchantFeature,
    total_spending: Decimal | None,
) -> BehaviourObservation | None:
    purchase_count = feature.convenience_store_transaction_count
    total_tx = feature.merchant_transaction_count
    if (
        purchase_count < RECURRENCE_MIN_OBSERVATIONS
        or purchase_count * 2 < total_tx
        or not is_reliable_merchant_display_name(feature.merchant_name)
        or _support_ratio(feature.confidence_support) < MIN_HIGH_CONFIDENCE_RATIO
    ):
        return None
    share = (
        feature.merchant_total_amount / total_spending
        if total_spending not in (None, ZERO) and purchase_count == total_tx
        else None
    )
    return _observation(
        "spending_habit_pattern",
        f"Repeated convenience-store spending at {feature.merchant_name}",
        (
            "Repeated convenience-store spending was observed over the analysed period. "
            "This describes the observed pattern and does not establish that the "
            "purchases were unnecessary."
        ),
        "low",
        _confidence(feature.confidence_support, purchase_count, Decimal("0.70")),
        {
            "merchant_key": feature.merchant_name,
            "finding_focus": "convenience_store_spending",
            "convenience_store_transaction_count": purchase_count,
            "merchant_total_amount": feature.merchant_total_amount if purchase_count == total_tx else None,
            "average_transaction_amount": feature.merchant_average_amount if purchase_count == total_tx else None,
            "transaction_frequency": feature.merchant_transaction_frequency,
            "spending_share": share,
            "first_observed_date": feature.merchant_first_transaction_date,
            "last_observed_date": feature.merchant_last_transaction_date,
        },
        [f"merchants[{feature.merchant_name}].convenience_store_transaction_count"],
        feature.merchant_first_transaction_date,
        feature.merchant_last_transaction_date,
    )


def _debit_order_frequency_shift(
    feature: MerchantFeature,
) -> BehaviourObservation | None:
    recurrence = feature.recurrence
    if (
        recurrence.baseline_interval_days is None
        or recurrence.current_interval_days is None
        or _subscription_category_majority(feature)
        or not _debit_order_majority(feature)
    ):
        return None
    return _observation(
        "frequency_change_pattern",
        f"Observed debit-order interval changed at {feature.merchant_name}",
        (
            "Observed debit-order payments shifted from an established billing "
            "interval to a different interval. This does not establish that the "
            "merchant billed incorrectly or that an extra charge occurred."
        ),
        "medium",
        _confidence(feature.confidence_support, feature.merchant_transaction_count, Decimal("0.75")),
        {
            "merchant_key": feature.merchant_name,
            "finding_focus": "debit_order_frequency_change",
            "debit_order_transaction_count": feature.debit_order_transaction_count,
            "baseline_interval_days": recurrence.baseline_interval_days,
            "current_interval_days": recurrence.current_interval_days,
            "interval_change_days": recurrence.interval_change_days,
            "baseline_interval_count": recurrence.baseline_interval_count,
            "current_interval_count": recurrence.current_interval_count,
            "observation_count": feature.merchant_transaction_count,
            "first_observed_date": feature.merchant_first_transaction_date,
            "last_observed_date": feature.merchant_last_transaction_date,
        },
        [f"merchants[{feature.merchant_name}].recurrence"],
        feature.merchant_first_transaction_date,
        feature.merchant_last_transaction_date,
    )


def _subscription_category_majority(feature: MerchantFeature) -> bool:
    categories = feature.merchant_category_transaction_count
    subscription_tx = categories.get("Subscriptions", 0)
    total_tx = feature.merchant_transaction_count
    return (
        subscription_tx >= 2
        and subscription_tx * 2 >= total_tx
        and is_reliable_merchant_display_name(feature.merchant_name)
    )


def _debit_order_majority(feature: MerchantFeature) -> bool:
    total_tx = feature.merchant_transaction_count
    debit_orders = feature.debit_order_transaction_count
    return (
        debit_orders >= 2
        and debit_orders * 2 >= total_tx
        and is_reliable_merchant_display_name(feature.merchant_name)
    )


def _subscription_recurring_merchant(feature: MerchantFeature) -> bool:
    categories = feature.merchant_category_transaction_count
    subscription_tx = categories.get("Subscriptions", 0)
    total_tx = feature.merchant_transaction_count
    if not (
        subscription_tx >= 2
        and subscription_tx * 2 >= total_tx
        and is_reliable_merchant_display_name(feature.merchant_name)
    ):
        return False
    recurrence = feature.recurrence
    return (
        recurrence.recurrence_strength in {"medium", "high"}
        and recurrence.observation_count >= 3
        and matches_plausible_recurring_interval(recurrence.average_interval_days)
    )


def _insurance_recurring_merchant(feature: MerchantFeature) -> bool:
    total_tx = feature.merchant_transaction_count
    insurance = feature.insurance_transaction_count
    if not (
        insurance >= 2
        and insurance * 2 >= total_tx
        and is_reliable_merchant_display_name(feature.merchant_name)
    ):
        return False
    recurrence = feature.recurrence
    return (
        recurrence.recurrence_strength in {"medium", "high"}
        and recurrence.observation_count >= 3
        and matches_plausible_recurring_interval(recurrence.average_interval_days)
    )


def _debit_order_recurring_merchant(feature: MerchantFeature) -> bool:
    total_tx = feature.merchant_transaction_count
    debit_orders = feature.debit_order_transaction_count
    if not (
        debit_orders >= 2
        and debit_orders * 2 >= total_tx
        and is_reliable_merchant_display_name(feature.merchant_name)
    ):
        return False
    recurrence = feature.recurrence
    return (
        recurrence.recurrence_strength in {"medium", "high"}
        and recurrence.observation_count >= 3
        and matches_plausible_recurring_interval(recurrence.average_interval_days)
    )


def _recurring_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    recurring_count_by_month: dict[str, int] = {}
    for feature in snapshot.merchants:
        recurrence = feature.recurrence
        if recurrence.recurrence_strength not in {"medium", "high"}:
            continue
        if not matches_plausible_recurring_interval(recurrence.average_interval_days):
            continue
        if _support_ratio(feature.confidence_support) < MIN_HIGH_CONFIDENCE_RATIO:
            continue
        categories = feature.merchant_category_transaction_count
        if (
            feature.merchant_transaction_count > 0
            and categories.get("Bank Fees", 0) == feature.merchant_transaction_count
        ):
            continue
        # Ordinary repeated shopping is cadence evidence only, not a bill signal.
        if is_repeated_shopping_merchant(feature):
            continue
        merchant_label = (
            feature.merchant_name
            if is_reliable_merchant_display_name(feature.merchant_name)
            else "unidentified merchant"
        )
        weak_commitment = is_weak_recurring_commitment(feature)
        observations.append(
            _observation(
                "recurring_payment_pattern",
                (
                    f"Repeated payments detected at {merchant_label}"
                    if weak_commitment
                    else f"Recurring payment pattern at {merchant_label}"
                ),
                (
                    "Payments repeated with a stable interval and amount, but the "
                    "evidence is not strong enough to assert a subscription or bill."
                    if weak_commitment
                    else "Payments followed a consistent interval and amount pattern."
                ),
                "medium" if recurrence.recurrence_strength == "medium" else "high",
                _confidence(
                    feature.confidence_support,
                    recurrence.observation_count,
                    Decimal("1") if recurrence.recurrence_strength == "high" else Decimal("0.75"),
                ),
                {
                    "merchant_key": feature.merchant_name,
                    "observation_count": recurrence.observation_count,
                    "recurrence_strength": recurrence.recurrence_strength,
                    "average_interval_days": recurrence.average_interval_days,
                    "average_amount": recurrence.average_amount,
                    "amount_variance": recurrence.amount_variance,
                    "interval_variance": recurrence.interval_variance,
                    **(
                        {"finding_focus": "repeated_payments_detected"}
                        if weak_commitment
                        else {}
                    ),
                },
                [f"merchants[{feature.merchant_name}].recurrence"],
                feature.merchant_first_transaction_date,
                feature.merchant_last_transaction_date,
            )
        )
        for month in feature.merchant_monthly_totals:
            recurring_count_by_month[month] = recurring_count_by_month.get(month, 0) + 1

    coverage_start, coverage_end = _coverage_bounds(snapshot)
    subscription_compare = _period_compare(
        [(month.month, month.subscription_total, 0) for month in snapshot.months],
        coverage_end,
        coverage_start,
        minimum_baseline=MIN_FEE_BURDEN_TOTAL,
    )
    count_compare = _count_compare(
        recurring_count_by_month, coverage_end, coverage_start
    )
    if subscription_compare and count_compare and subscription_compare["change_amount"] > 0:
        if _material_change(
            subscription_compare["change_amount"], subscription_compare["change_percentage"]
        ) and count_compare["change_count"] > 0:
            observations.append(
                _observation(
                    "subscription_accumulation",
                    "Recurring subscription activity increased",
                    "Recurring patterns and subscription spending increased in the latest observed month.",
                    _severity(
                        subscription_compare["change_percentage"],
                        subscription_compare["change_amount"],
                    ),
                    _confidence(None, len(snapshot.months), Decimal("0.75")),
                    {
                        "previous_subscription_total": subscription_compare["previous_amount"],
                        "current_subscription_total": subscription_compare["current_amount"],
                        "change_amount": subscription_compare["change_amount"],
                        "change_percentage": subscription_compare["change_percentage"],
                        "previous_recurring_pattern_count": count_compare["previous_count"],
                        "current_recurring_pattern_count": count_compare["current_count"],
                    },
                    ["months[].subscription_total", "merchants[].recurrence"],
                    snapshot.date_start,
                    snapshot.date_end,
                )
            )
    return observations


def _calendar_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    weekend = snapshot.weekend
    if (
        weekend.dated_spending_transaction_count >= MIN_WEEKEND_SPENDING_TRANSACTIONS
        and weekend.weekend_spending_share is not None
        and weekend.weekend_spending_share >= Decimal("0.40")
    ):
        observations.append(
            _observation(
                "weekend_spending_pattern",
                "Weekend spending concentration observed",
                "Spending was concentrated on weekends during the analysed period.",
                "medium" if weekend.weekend_spending_share < Decimal("0.60") else "high",
                _confidence(None, weekend.dated_spending_transaction_count, Decimal("0.8")),
                {
                    "finding_focus": "weekend_spending_spike",
                    "weekend_spending_share": weekend.weekend_spending_share,
                    "weekend_spending_total": weekend.weekend_spending_total,
                    "weekday_spending_total": weekend.weekday_spending_total,
                    "dated_spending_total": weekend.dated_spending_total,
                    "weekend_transaction_count": weekend.weekend_spending_transaction_count,
                    "dated_spending_transaction_count": weekend.dated_spending_transaction_count,
                },
                ["weekend"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    payday = snapshot.payday
    if (
        snapshot.income.estimated_payday_interval is not None
        and payday.eligible_income_event_count >= 3
        and payday.eligible_spending_transaction_count >= MIN_PAYDAY_SPENDING_TRANSACTIONS
        and payday.post_income_spending_share is not None
        and payday.post_income_spending_share >= Decimal("0.40")
    ):
        observations.append(
            _observation(
                "payday_spending_pattern",
                "Spending is concentrated after income events",
                "Spending was concentrated shortly after income was received during the analysed period.",
                "medium" if payday.post_income_spending_share < Decimal("0.60") else "high",
                _confidence(None, payday.eligible_spending_transaction_count, Decimal("0.85")),
                {
                    "finding_focus": "payday_spending_pattern",
                    "window_days": payday.window_days,
                    "post_income_spending_share": payday.post_income_spending_share,
                    "post_income_spending_total": payday.post_income_spending_total,
                    "eligible_spending_total": payday.eligible_spending_total,
                    "eligible_spending_transaction_count": payday.eligible_spending_transaction_count,
                    "post_income_spending_transaction_count": payday.post_income_spending_transaction_count,
                    "income_event_count": payday.eligible_income_event_count,
                    "income_event_dates": payday.income_event_dates,
                },
                ["payday", "income.estimated_payday_interval"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    return observations


def _cash_and_fee_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    spending = snapshot.spending_profile.total_spending
    cash = snapshot.cash
    cash_share = (
        cash.cash_withdrawal_total / spending
        if spending not in (None, Decimal("0"))
        else None
    )
    coverage_start, coverage_end = _coverage_bounds(snapshot)
    cash_compare = _period_compare(
        [(month.month, month.cash_withdrawal_total, 0) for month in snapshot.months],
        coverage_end,
        coverage_start,
        minimum_baseline=MIN_FEE_BURDEN_TOTAL,
    )
    if cash.cash_withdrawal_count >= 3 and (
        cash_share is not None and cash_share >= Decimal("0.15")
        or cash_compare is not None
        and cash_compare["change_amount"] > 0
        and _material_change(cash_compare["change_amount"], cash_compare["change_percentage"])
    ):
        reliance_backed = cash_share is not None and cash_share >= Decimal("0.15")
        observations.append(
            _observation(
                "cash_dependency",
                "Cash withdrawal activity is significant",
                (
                    "Cash withdrawals represent a meaningful share of observed spending."
                    if reliance_backed
                    else "Cash withdrawal totals increased across the observed months."
                ),
                "medium" if cash_share is None or cash_share < Decimal("0.30") else "high",
                _confidence(None, cash.cash_withdrawal_count, Decimal("0.75")),
                {
                    "finding_focus": "cash_dependency",
                    "cash_withdrawal_count": cash.cash_withdrawal_count,
                    "cash_withdrawal_total": cash.cash_withdrawal_total,
                    "spending_total": spending,
                    "cash_withdrawal_share": cash_share,
                    "atm_fee_count": cash.atm_fee_count,
                    "atm_fee_total": cash.atm_fee_total,
                    "reliance_backed": reliance_backed,
                    "trend_change_percentage": cash_compare["change_percentage"] if cash_compare else None,
                },
                ["cash", "months[].cash_withdrawal_total"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    fee_compare = _period_compare(
        [(month.month, month.bank_fee_total, 0) for month in snapshot.months],
        coverage_end,
        coverage_start,
        minimum_baseline=MIN_FEE_BURDEN_TOTAL,
    )
    if (
        fee_compare
        and fee_compare["change_amount"] > 0
        and _material_change(
            fee_compare["change_amount"],
            fee_compare["change_percentage"],
            minimum_amount=Decimal("10"),
        )
    ):
        observations.append(
            _fee_accumulation_observation(
                snapshot,
                {**fee_compare, "overall_monthly_fee_trend": True},
            )
        )
    else:
        fee_only_compare = _fee_only_account_fee_compare(snapshot)
        if (
            fee_only_compare
            and fee_only_compare["change_amount"] > 0
            and _material_change(
                fee_only_compare["change_amount"],
                fee_only_compare["change_percentage"],
                minimum_amount=Decimal("10"),
            )
        ):
            observations.append(
                _fee_accumulation_observation(
                    snapshot,
                    {**fee_only_compare, "overall_monthly_fee_trend": True},
                )
            )
    if not any(item.behavior_type == "fee_accumulation" for item in observations):
        enquiry = snapshot.fees.balance_enquiry_fee_total or ZERO
        sms = snapshot.fees.sms_fee_total or ZERO
        immediate = snapshot.fees.immediate_payment_fee_total or ZERO
        if _typed_bank_fee_repetition_eligible(snapshot, enquiry):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(snapshot, sms):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(snapshot, immediate):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(
            snapshot, snapshot.fees.foreign_transaction_fee_total or ZERO
        ):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(
            snapshot, snapshot.fees.interest_charge_total or ZERO
        ):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(
            snapshot, snapshot.fees.overdraft_fee_total or ZERO
        ):
            observations.append(_typed_fee_repetition_observation(snapshot))
        elif _typed_bank_fee_repetition_eligible(
            snapshot, snapshot.fees.insufficient_funds_fee_total or ZERO
        ):
            observations.append(_typed_fee_repetition_observation(snapshot))
    return observations


def _eligible_fee_totals(snapshot: FinancialFeatureSnapshot) -> set[Decimal]:
    fees = snapshot.fees
    eligible = {fees.bank_fee_total}
    account_total = fees.account_fee_total or ZERO
    if account_total > ZERO and fees.bank_fee_total > account_total:
        eligible.add(fees.bank_fee_total - account_total)
    return eligible


def _typed_bank_fee_repetition_eligible(
    snapshot: FinancialFeatureSnapshot, typed_total: Decimal
) -> bool:
    fees = snapshot.fees
    if (
        typed_total < MIN_FEE_BURDEN_TOTAL
        or typed_total not in _eligible_fee_totals(snapshot)
        or fees.bank_fee_transaction_count < 2
    ):
        return False
    completed = completed_months(snapshot)
    if len(completed) < 2:
        return False
    return sum(1 for month in completed if month.bank_fee_total > ZERO) >= 2


def _typed_fee_repetition_observation(
    snapshot: FinancialFeatureSnapshot,
) -> BehaviourObservation:
    completed = completed_months(snapshot)
    previous_month, current_month = completed[-2], completed[-1]
    previous_amount = previous_month.bank_fee_total
    current_amount = current_month.bank_fee_total
    change_amount = current_amount - previous_amount
    change_percentage = (
        (change_amount / previous_amount) * Decimal("100")
        if previous_amount > ZERO
        else ZERO
    )
    return _fee_accumulation_observation(
        snapshot,
        {
            "previous_period": previous_month.month,
            "current_period": current_month.month,
            "previous_amount": previous_amount,
            "current_amount": current_amount,
            "change_amount": change_amount,
            "change_percentage": change_percentage,
            "transaction_count_previous": 0,
            "transaction_count_current": 0,
            "months_compared": len(completed),
        },
    )


def _fee_accumulation_observation(
    snapshot: FinancialFeatureSnapshot, compare: dict[str, Decimal | int | str]
) -> BehaviourObservation:
    immediate = snapshot.fees.immediate_payment_fee_total or ZERO
    enquiry = snapshot.fees.balance_enquiry_fee_total or ZERO
    sms = snapshot.fees.sms_fee_total or ZERO
    payload = {
        **compare,
        "bank_fee_transaction_count": snapshot.fees.bank_fee_transaction_count,
    }
    eligible = _eligible_fee_totals(snapshot)
    if immediate >= MIN_FEE_BURDEN_TOTAL and immediate in eligible:
        payload["immediate_payment_fee_total"] = immediate
    if enquiry >= MIN_FEE_BURDEN_TOTAL and enquiry in eligible:
        payload["balance_enquiry_fee_total"] = enquiry
    if sms >= MIN_FEE_BURDEN_TOTAL and sms in eligible:
        payload["sms_fee_total"] = sms
    return _observation(
        "fee_accumulation",
        "Banking fees increased",
        "Banking fee totals increased in the latest observed month.",
        _severity(compare["change_percentage"], compare["change_amount"]),
        _confidence(None, snapshot.fees.bank_fee_transaction_count, Decimal("0.75")),
        payload,
        ["months[].bank_fee_total", "fees.bank_fee_transaction_count"],
        snapshot.date_start,
        snapshot.date_end,
    )


def _fee_only_account_fee_compare(
    snapshot: FinancialFeatureSnapshot,
) -> dict[str, Decimal | int | str] | None:
    """Compare the last two completed fee months when spending history is absent."""
    spending = snapshot.spending_profile.total_spending
    if spending not in (None, ZERO):
        return None
    completed = completed_months(snapshot)
    if len(completed) < 2:
        return None
    previous_month, current_month = completed[-2], completed[-1]
    previous_amount = previous_month.bank_fee_total
    current_amount = current_month.bank_fee_total
    if previous_amount <= ZERO:
        return None
    change_amount = current_amount - previous_amount
    if change_amount <= ZERO:
        return None
    return {
        "previous_period": previous_month.month,
        "current_period": current_month.month,
        "previous_amount": previous_amount,
        "current_amount": current_amount,
        "change_amount": change_amount,
        "change_percentage": (change_amount / previous_amount) * Decimal("100"),
        "transaction_count_previous": 0,
        "transaction_count_current": 0,
        "months_compared": len(completed),
    }


def _income_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    income = snapshot.income
    if income.income_transaction_count < 3:
        return []
    observations = []
    if income.estimated_payday_interval is not None:
        observations.append(
            _observation(
                "income_pattern",
                "Regular income pattern observed",
                "Income events followed a consistent interval over the observed period.",
                "medium",
                _confidence(None, income.income_transaction_count, Decimal("0.9")),
                {
                    "income_transaction_count": income.income_transaction_count,
                    "estimated_payday_interval_days": income.estimated_payday_interval,
                    "average_income_amount": income.average_income_amount,
                    "last_income_date": income.last_income_date,
                },
                ["income.estimated_payday_interval", "income.average_income_amount"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
        if (
            income.max_income_gap_days is not None
            and income.max_income_gap_days
            > int(income.estimated_payday_interval * Decimal("1.5"))
        ):
            observations.append(
                _observation(
                    "income_gap",
                    "Income interval gap observed",
                    "One income interval was longer than the established income pattern.",
                    "medium",
                    _confidence(None, income.income_transaction_count, Decimal("0.7")),
                    {
                        "max_income_gap_days": income.max_income_gap_days,
                        "estimated_payday_interval_days": income.estimated_payday_interval,
                    },
                    ["income.max_income_gap_days", "income.estimated_payday_interval"],
                    snapshot.date_start,
                    snapshot.date_end,
                )
            )
    else:
        observations.append(
            _observation(
                "irregular_income",
                "Income timing varies across the observed period",
                "Income events did not establish a consistent interval.",
                "low",
                _confidence(None, income.income_transaction_count, Decimal("0.65")),
                {
                    "income_transaction_count": income.income_transaction_count,
                    "average_income_amount": income.average_income_amount,
                },
                ["income.income_transaction_count", "income.estimated_payday_interval"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    return observations


def _duplicate_observations(snapshot: FinancialFeatureSnapshot) -> list[BehaviourObservation]:
    observations = []
    for candidate in snapshot.duplicate_candidates:
        dates = candidate.transaction_dates
        observations.append(
            _observation(
                "duplicate_payment_pattern",
                f"Similar payment timing pattern at {candidate.merchant_name}",
                "Multiple similar transactions were grouped as candidates based on amount and timing.",
                "low",
                _confidence(None, len(dates), Decimal("0.65")),
                {
                    "merchant_key": candidate.merchant_name,
                    "candidate_amount": candidate.amount,
                    "transaction_count_in_group": len(dates),
                    "date_span_days": (max(dates) - min(dates)).days if dates else 0,
                    "candidate_only": True,
                },
                ["duplicate_candidates"],
                min(dates) if dates else snapshot.date_start,
                max(dates) if dates else snapshot.date_end,
            )
        )
    return observations


def _period_compare(
    entries: list[tuple[str, Decimal, int]],
    observation_end: date | None,
    observation_start: date | None = None,
    *,
    minimum_baseline: Decimal = MIN_BASELINE_AMOUNT,
) -> dict[str, Decimal | int | str] | None:
    ordered = _comparable_month_entries(entries, observation_end, observation_start)
    if len(ordered) < MIN_TREND_MONTHS:
        return None
    current_month, current_amount, current_count = ordered[-1]
    previous = ordered[:-1]
    previous_amount = sum((item[1] for item in previous), Decimal("0")) / Decimal(len(previous))
    previous_count = sum(item[2] for item in previous) / Decimal(len(previous))
    # Missing history must not be treated as a zero baseline for percentage math.
    if previous_amount < minimum_baseline:
        return None
    change_amount = current_amount - previous_amount
    if change_amount == 0:
        return None
    return {
        "previous_period": previous[-1][0],
        "current_period": current_month,
        "previous_amount": previous_amount,
        "current_amount": current_amount,
        "change_amount": change_amount,
        "change_percentage": (change_amount / previous_amount) * Decimal("100"),
        "transaction_count_previous": previous_count,
        "transaction_count_current": current_count,
        "months_compared": len(ordered),
        "baseline_month_count": len(previous),
        "baseline_months": [item[0] for item in previous],
        "baseline_period_start": previous[0][0],
        "baseline_period_end": previous[-1][0],
        "baseline_is_average": len(previous) > 1,
        "periods_comparable": True,
    }


def _count_compare(
    counts: dict[str, int],
    observation_end: date | None,
    observation_start: date | None = None,
) -> dict[str, Decimal | int | str] | None:
    ordered = _comparable_month_entries(
        [(month, Decimal(count), count) for month, count in counts.items()],
        observation_end,
        observation_start,
    )
    if len(ordered) < 2:
        return None
    current_month, _, current_count = ordered[-1]
    previous_count = sum(item[2] for item in ordered[:-1]) / Decimal(len(ordered) - 1)
    if previous_count == 0:
        return None
    change = Decimal(current_count) - previous_count
    if change == 0:
        return None
    return {
        "previous_period": ordered[-2][0],
        "current_period": current_month,
        "previous_count": previous_count,
        "current_count": current_count,
        "change_count": change,
        "change_percentage": (change / previous_count) * Decimal("100"),
    }


def _comparable_month_entries(
    entries: list[tuple[str, Decimal, int]],
    observation_end: date | None,
    observation_start: date | None = None,
) -> list[tuple[str, Decimal, int]]:
    """Return contiguous completed months with comparable calendar durations.

    Incomplete opening/trailing months are dropped. Gaps are not zero-filled;
    only the contiguous suffix ending at the latest completed month is kept.
    """
    by_month = {
        month: (month, amount, count)
        for month, amount, count in _completed_entries(
            entries, observation_end, observation_start
        )
    }
    suffix = contiguous_month_suffix(list(by_month))
    return [by_month[month] for month in suffix]


def _completed_entries(
    entries: list[tuple[str, Decimal, int]],
    observation_end: date | None,
    observation_start: date | None = None,
) -> list[tuple[str, Decimal, int]]:
    trimmed = exclude_incomplete_final_month(
        sorted(entries),
        observation_end,
        lambda entry: entry[0],
    )
    return exclude_incomplete_opening_month(
        trimmed,
        observation_start,
        lambda entry: entry[0],
    )


_REPEATED_SHOPPING_CATEGORIES = frozenset(
    {"Groceries", "Shopping", "Restaurants", "Fast Food", "Fuel"}
)


def is_repeated_shopping_merchant(merchant: MerchantFeature) -> bool:
    """True when most activity looks like ordinary shopping, not a billed commitment."""
    total = merchant.merchant_transaction_count
    if total <= 0:
        return False
    categories = merchant.merchant_category_transaction_count
    shopping = sum(categories.get(name, 0) for name in _REPEATED_SHOPPING_CATEGORIES)
    return shopping * 2 >= total


def is_weak_recurring_commitment(merchant: MerchantFeature) -> bool:
    """True when cadence exists but evidence is too weak to assert a bill/subscription."""
    if merchant.debit_order_transaction_count * 2 >= merchant.merchant_transaction_count:
        return False
    subscription_tx = merchant.merchant_category_transaction_count.get("Subscriptions", 0)
    if subscription_tx >= 2 and subscription_tx * 2 >= merchant.merchant_transaction_count:
        return False
    recurrence = merchant.recurrence
    if recurrence.recurrence_strength != "high":
        return True
    average = recurrence.average_amount
    variance = recurrence.amount_variance
    if average in (None, ZERO) or variance is None:
        return True
    # High interval stability with amount CV above 10% is still weak for a fixed bill.
    return (variance.sqrt() / average) > Decimal("0.10")


def _change_observation(
    *,
    behavior_type: BehaviorType,
    title: str,
    subject: str,
    compare: dict[str, Decimal | int | str],
    support: ConfidenceSupport | None,
    supporting_features: list[str],
    period_start,
    period_end,
) -> BehaviourObservation | None:
    change_amount = compare["change_amount"]
    change_percentage = compare["change_percentage"]
    if not isinstance(change_amount, Decimal) or not isinstance(change_percentage, Decimal):
        return None
    if not _material_change(change_amount, change_percentage):
        return None
    if support and _support_ratio(support) < MIN_HIGH_CONFIDENCE_RATIO:
        return None
    return _observation(
        behavior_type,
        title,
        f"{subject.capitalize()} changed materially between observed monthly periods.",
        _severity(change_percentage, change_amount),
        _confidence(support, int(compare["months_compared"]), Decimal("0.8")),
        {"subject": subject, **compare},
        supporting_features,
        period_start,
        period_end,
    )


def _material_change(
    change_amount: Decimal,
    change_percentage: Decimal,
    *,
    minimum_amount: Decimal = MIN_ABSOLUTE_CHANGE,
) -> bool:
    return (
        abs(change_amount) >= minimum_amount
        and abs(change_percentage) >= MIN_RELATIVE_CHANGE_PERCENT
    )


def _support_ratio(support: ConfidenceSupport) -> Decimal:
    if support.supporting_transaction_count == 0:
        return Decimal("0")
    return Decimal(support.high_confidence_transaction_count) / Decimal(
        support.supporting_transaction_count
    )


def _confidence(
    support: ConfidenceSupport | None,
    observations: int,
    pattern_strength: Decimal,
) -> float:
    support_ratio = _support_ratio(support) if support else Decimal("0.8")
    history = min(Decimal("1"), Decimal(observations) / Decimal("10"))
    score = min(
        Decimal("0.98"),
        Decimal("0.35")
        + Decimal("0.35") * support_ratio
        + Decimal("0.15") * history
        + Decimal("0.15") * pattern_strength,
    )
    return round(float(score), 2)


def _severity(change_percentage: Decimal, change_amount: Decimal) -> str:
    if abs(change_percentage) >= Decimal("40") and abs(change_amount) >= Decimal("1000"):
        return "high"
    if abs(change_percentage) >= Decimal("20") or abs(change_amount) >= Decimal("200"):
        return "medium"
    return "low"


def _observation(
    behavior_type: BehaviorType,
    title: str,
    description: str,
    severity: str,
    confidence: float,
    evidence: dict,
    supporting_features: list[str],
    period_start,
    period_end,
) -> BehaviourObservation:
    return BehaviourObservation(
        observation_id=_observation_id(
            behavior_type,
            evidence.get("merchant_key") or evidence.get("subject") or title,
        ),
        behavior_type=behavior_type,
        title=title,
        description=description,
        severity=severity,  # type: ignore[arg-type]
        confidence=max(MIN_OBSERVATION_CONFIDENCE, confidence),
        evidence=evidence,
        supporting_features=supporting_features,
        period_start=period_start,
        period_end=period_end,
    )


def _observation_id(behavior_type: BehaviorType, subject: object) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", str(subject).lower()).strip("-")
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    return f"{behavior_type}:{digest}"
