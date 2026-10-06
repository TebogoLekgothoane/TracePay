"""Pure, conservative interpretation of FinancialFeatureSnapshot observations."""

from __future__ import annotations

import hashlib
import re
from calendar import monthrange
from datetime import date
from decimal import Decimal

from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation, BehaviorType
from .merchant_display import is_reliable_merchant_display_name
from .models import ConfidenceSupport, FinancialFeatureSnapshot
from .recurrence_rules import matches_plausible_recurring_interval

MIN_TREND_MONTHS = 3
MIN_RELATIVE_CHANGE_PERCENT = Decimal("10")
MIN_ABSOLUTE_CHANGE = Decimal("50")
MIN_HIGH_CONFIDENCE_RATIO = Decimal("0.60")
MIN_OBSERVATION_CONFIDENCE = 0.55
MIN_WEEKEND_SPENDING_TRANSACTIONS = 10
MIN_PAYDAY_SPENDING_TRANSACTIONS = 10


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
    compare = _period_compare(
        [
            (
                month.month,
                month.total_outflow,
                month.outflow_transaction_count,
            )
            for month in snapshot.months
        ],
        snapshot.date_end,
    )
    if compare is None:
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
        compare = _period_compare(
            [
                (month, amount, feature.category_monthly_transaction_count.get(month, 0))
                for month, amount in feature.category_monthly_total.items()
            ],
            snapshot.date_end,
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
        spend_compare = _period_compare(
            [
                (month, amount, feature.merchant_monthly_transaction_count.get(month, 0))
                for month, amount in feature.merchant_monthly_totals.items()
            ],
            snapshot.date_end,
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
            feature.merchant_monthly_transaction_count, snapshot.date_end
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
                observations.append(
                    _observation(
                        "price_increase_pattern",
                        f"Payment amount increased at {feature.merchant_name}",
                        "The latest observed amount is higher than the prior average for this merchant.",
                        _severity(trend.percentage_change, trend.amount_change),
                        _confidence(feature.confidence_support, feature.merchant_transaction_count, Decimal("0.85")),
                        {
                            "merchant_key": feature.merchant_name,
                            "first_amount": trend.first_amount,
                            "latest_amount": trend.latest_amount,
                            "average_previous_amount": trend.average_previous_amount,
                            "change_amount": trend.amount_change,
                            "change_percentage": trend.percentage_change,
                            "observation_count": feature.merchant_transaction_count,
                        },
                        [f"merchants[{feature.merchant_name}].merchant_amount_trend"],
                        feature.merchant_first_transaction_date,
                        feature.merchant_last_transaction_date,
                    )
                )
    return observations


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
        merchant_label = (
            feature.merchant_name
            if is_reliable_merchant_display_name(feature.merchant_name)
            else "unidentified merchant"
        )
        observations.append(
            _observation(
                "recurring_payment_pattern",
                f"Recurring payment pattern at {merchant_label}",
                "Payments followed a consistent interval and amount pattern.",
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
                },
                [f"merchants[{feature.merchant_name}].recurrence"],
                feature.merchant_first_transaction_date,
                feature.merchant_last_transaction_date,
            )
        )
        for month in feature.merchant_monthly_totals:
            recurring_count_by_month[month] = recurring_count_by_month.get(month, 0) + 1

    subscription_compare = _period_compare(
        [(month.month, month.subscription_total, 0) for month in snapshot.months],
        snapshot.date_end,
    )
    count_compare = _count_compare(recurring_count_by_month, snapshot.date_end)
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
                "A substantial share of dated spending occurred on Saturdays and Sundays.",
                "medium" if weekend.weekend_spending_share < Decimal("0.60") else "high",
                _confidence(None, weekend.dated_spending_transaction_count, Decimal("0.8")),
                {
                    "weekend_spending_share": weekend.weekend_spending_share,
                    "weekend_spending_total": weekend.weekend_spending_total,
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
                f"A substantial share of eligible spending occurred within {payday.window_days} days after income events.",
                "medium" if payday.post_income_spending_share < Decimal("0.60") else "high",
                _confidence(None, payday.eligible_spending_transaction_count, Decimal("0.85")),
                {
                    "window_days": payday.window_days,
                    "post_income_spending_share": payday.post_income_spending_share,
                    "post_income_spending_total": payday.post_income_spending_total,
                    "eligible_spending_total": payday.eligible_spending_total,
                    "income_event_count": payday.eligible_income_event_count,
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
    cash_compare = _period_compare(
        [(month.month, month.cash_withdrawal_total, 0) for month in snapshot.months],
        snapshot.date_end,
    )
    if cash.cash_withdrawal_count >= 3 and (
        cash_share is not None and cash_share >= Decimal("0.15")
        or cash_compare is not None
        and cash_compare["change_amount"] > 0
        and _material_change(cash_compare["change_amount"], cash_compare["change_percentage"])
    ):
        observations.append(
            _observation(
                "cash_dependency",
                "Cash withdrawal activity is significant",
                "Cash withdrawals form a notable part of the observed spending activity.",
                "medium" if cash_share is None or cash_share < Decimal("0.30") else "high",
                _confidence(None, cash.cash_withdrawal_count, Decimal("0.75")),
                {
                    "cash_withdrawal_count": cash.cash_withdrawal_count,
                    "cash_withdrawal_total": cash.cash_withdrawal_total,
                    "cash_withdrawal_share": cash_share,
                    "trend_change_percentage": cash_compare["change_percentage"] if cash_compare else None,
                },
                ["cash", "months[].cash_withdrawal_total"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    fee_compare = _period_compare(
        [(month.month, month.bank_fee_total, 0) for month in snapshot.months],
        snapshot.date_end,
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
            _observation(
                "fee_accumulation",
                "Banking fees increased",
                "Banking fee totals increased in the latest observed month.",
                _severity(fee_compare["change_percentage"], fee_compare["change_amount"]),
                _confidence(None, snapshot.fees.bank_fee_transaction_count, Decimal("0.75")),
                {
                    **fee_compare,
                    "bank_fee_transaction_count": snapshot.fees.bank_fee_transaction_count,
                },
                ["months[].bank_fee_total", "fees.bank_fee_transaction_count"],
                snapshot.date_start,
                snapshot.date_end,
            )
        )
    return observations


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
) -> dict[str, Decimal | int | str] | None:
    ordered = _completed_entries(entries, observation_end)
    if len(ordered) < MIN_TREND_MONTHS:
        return None
    current_month, current_amount, current_count = ordered[-1]
    previous = ordered[:-1]
    previous_amount = sum((item[1] for item in previous), Decimal("0")) / Decimal(len(previous))
    previous_count = sum(item[2] for item in previous) / Decimal(len(previous))
    if previous_amount == 0:
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
    }


def _count_compare(
    counts: dict[str, int], observation_end: date | None
) -> dict[str, Decimal | int | str] | None:
    ordered = _completed_entries(
        [(month, Decimal(count), count) for month, count in counts.items()],
        observation_end,
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


def _completed_entries(
    entries: list[tuple[str, Decimal, int]], observation_end: date | None
) -> list[tuple[str, Decimal, int]]:
    ordered = sorted(entries)
    if not ordered or observation_end is None:
        return ordered
    final_month = observation_end.strftime("%Y-%m")
    if (
        ordered[-1][0] == final_month
        and observation_end.day < monthrange(observation_end.year, observation_end.month)[1]
    ):
        return ordered[:-1]
    return ordered


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
