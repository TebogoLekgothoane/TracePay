"""Deterministic root-cause analysis for detected potential financial leaks."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .leak_models import LeakDetection, LeakDetectionResult
from .leak_scoring import support_ratio
from .models import (
    CategoryFeature,
    FinancialFeatureSnapshot,
    MerchantFeature,
)
from .periods import completed_months
from .reasoning_models import (
    AnalysisStatus,
    Avoidability,
    FinancialReasoning,
    FinancialReasoningResult,
    ImpactAssessment,
    Persistence,
    RootCauseType,
)

REASONING_VERSION = "1.0"
MATERIAL_COUNT_CHANGE = Decimal("0.20")
MATERIAL_AVERAGE_CHANGE = Decimal("0.15")
DRIVER_DOMINANCE = Decimal("0.70")
ZERO = Decimal("0")

_RECURRING_LEAK_TYPES = {
    "subscription_leak",
    "recurring_payment_leak",
    "unknown_recurring_payment",
}
_CATEGORY_LEAK_TYPES = {
    "airtime_data_leak",
    "food_spending_leak",
    "transport_spending_leak",
}


@dataclass
class _Draft:
    root_cause_type: RootCauseType
    title: str
    explanation: str
    evidence: dict[str, object]
    persistence: Persistence
    analysis_status: AnalysisStatus = "supported"
    competing_explanations: list[RootCauseType] = field(default_factory=list)
    evidence_strength: Decimal = Decimal("0.70")
    support: Decimal = Decimal("0.80")


def analyze_financial_reasoning(
    snapshot: FinancialFeatureSnapshot,
    behaviours: BehaviourAnalysisResult,
    leaks: LeakDetectionResult,
) -> FinancialReasoningResult:
    """Explain each detected pattern without recommendations or invented causes."""
    _validate_user_scope(snapshot, behaviours, leaks)
    observations = {
        observation.observation_id: observation
        for observation in behaviours.observations
    }
    analyses = [
        _reason_about_leak(snapshot, leak, observations)
        for leak in leaks.leaks
    ]
    return FinancialReasoningResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        reasoning_version=REASONING_VERSION,
        potential_leaks_analyzed=len(leaks.leaks),
        analyses=analyses,
    )


def _validate_user_scope(
    snapshot: FinancialFeatureSnapshot,
    behaviours: BehaviourAnalysisResult,
    leaks: LeakDetectionResult,
) -> None:
    if len({snapshot.user_id, behaviours.user_id, leaks.user_id}) != 1:
        raise ValueError("Financial reasoning inputs must belong to the same user.")


def _reason_about_leak(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    observations: dict[str, BehaviourObservation],
) -> FinancialReasoning:
    related = [
        observations[observation_id]
        for observation_id in leak.supporting_behavior_ids
        if observation_id in observations
    ]
    if leak.leak_type == "duplicate_payment_leak":
        draft = _duplicate_reasoning(leak)
    elif leak.leak_type in _RECURRING_LEAK_TYPES:
        draft = _recurring_reasoning(snapshot, leak, related)
    elif leak.leak_type == "bank_fee_leak":
        draft = _fee_reasoning(snapshot, leak)
    elif leak.leak_type == "cash_usage_leak":
        draft = _cash_reasoning(snapshot, leak)
    elif (
        leak.leak_type == "spending_escalation_leak"
        or leak.leak_type in _CATEGORY_LEAK_TYPES
    ):
        draft = _escalation_reasoning(snapshot, leak, related, observations.values())
    else:
        draft = _insufficient_reasoning(snapshot, leak)

    avoidability, avoidability_confidence, recoverable = _avoidability(
        snapshot, leak, draft
    )
    confidence = _root_cause_confidence(snapshot, related, draft)
    return FinancialReasoning(
        reasoning_id=_reasoning_id(leak.leak_id, draft.root_cause_type),
        leak_id=leak.leak_id,
        root_cause_type=draft.root_cause_type,
        title=draft.title,
        explanation=draft.explanation,
        confidence=confidence,
        evidence=draft.evidence,
        supporting_behavior_ids=leak.supporting_behavior_ids,
        supporting_feature_references=[
            _safe_feature_reference(reference)
            for reference in leak.supporting_feature_references
        ],
        impact_assessment=ImpactAssessment(
            detected_amount=leak.estimated_monthly_impact,
            detected_annual_amount=leak.estimated_annual_impact,
            impact_kind=leak.impact_kind,
            potentially_avoidable_amount=None,
            potentially_avoidable_annual_amount=None,
            recoverable_amount=recoverable,
            avoidability_confidence=avoidability_confidence,
        ),
        avoidability=avoidability,
        persistence=draft.persistence,
        analysis_status=draft.analysis_status,
        competing_explanations=draft.competing_explanations,
    )


def _escalation_reasoning(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    related: list[BehaviourObservation],
    all_observations,
) -> _Draft:
    metrics = _change_metrics(leak.evidence)
    series = _series_for_leak(snapshot, leak, related)
    persistence = classify_persistence(series)
    category = _text(leak.evidence.get("category_name"))
    feature = _category_feature(snapshot, category)
    feature_support = (
        support_ratio(feature.confidence_support) if feature else Decimal("0.80")
    )
    if metrics is None:
        return _insufficient_draft(
            persistence,
            "The spending increase is measurable, but totals and transaction counts "
            "are insufficient to distinguish frequency from transaction-value changes.",
        )

    previous_total, current_total, previous_count, current_count = metrics
    previous_average = previous_total / previous_count
    current_average = current_total / current_count
    count_change = _relative_change(previous_count, current_count)
    average_change = _relative_change(previous_average, current_average)
    frequency_contribution = max(
        ZERO, (current_count - previous_count) * previous_average
    )
    amount_contribution = max(
        ZERO, current_count * (current_average - previous_average)
    )
    positive_contribution = frequency_contribution + amount_contribution
    frequency_share = (
        frequency_contribution / positive_contribution
        if positive_contribution > ZERO
        else ZERO
    )
    amount_share = (
        amount_contribution / positive_contribution
        if positive_contribution > ZERO
        else ZERO
    )
    evidence = {
        "previous_total": previous_total,
        "current_total": current_total,
        "absolute_change": current_total - previous_total,
        "percentage_change": _percentage_change(previous_total, current_total),
        "previous_transaction_count": previous_count,
        "current_transaction_count": current_count,
        "previous_average_transaction_amount": previous_average,
        "current_average_transaction_amount": current_average,
        "transaction_count_change_percentage": count_change * Decimal("100"),
        "average_amount_change_percentage": average_change * Decimal("100"),
        "frequency_contribution_share": frequency_share,
        "amount_contribution_share": amount_share,
        "category": category,
    }

    frequency_material = count_change >= MATERIAL_COUNT_CHANGE
    amount_material = average_change >= MATERIAL_AVERAGE_CHANGE
    if frequency_material and amount_material:
        return _Draft(
            root_cause_type="transaction_pattern",
            title="Frequency and average transaction value increased",
            explanation=(
                "The detected increase is supported by both more transactions and "
                "a higher average transaction value. Both explanations materially "
                "contributed, so neither is treated as the sole cause."
            ),
            evidence=evidence,
            persistence=persistence,
            analysis_status="competing_explanations",
            competing_explanations=["frequency_increase", "amount_increase"],
            evidence_strength=Decimal("0.82"),
            support=feature_support,
        )

    price_evidence = _price_increase_evidence(
        snapshot, leak, category, all_observations
    )
    if (
        amount_material
        and not frequency_material
        and price_evidence is not None
    ):
        return _Draft(
            root_cause_type="price_increase",
            title="Average transaction value increased",
            explanation=(
                "The spending increase aligns with a higher average transaction "
                "value at a contributing merchant while transaction frequency "
                "remained relatively stable. This does not establish that the "
                "merchant changed its prices."
            ),
            evidence={**evidence, **price_evidence},
            persistence=persistence,
            evidence_strength=Decimal("0.84"),
            support=feature_support,
        )

    if frequency_material and (
        frequency_share >= DRIVER_DOMINANCE or not amount_material
    ):
        return _Draft(
            root_cause_type="frequency_increase",
            title="Transaction frequency increased",
            explanation=(
                "The spending increase was primarily associated with more "
                "transactions; average transaction value did not increase enough "
                "to provide a stronger alternative explanation."
            ),
            evidence=evidence,
            persistence=persistence,
            evidence_strength=Decimal("0.86"),
            support=feature_support,
        )

    if amount_material and (
        amount_share >= DRIVER_DOMINANCE or not frequency_material
    ):
        return _Draft(
            root_cause_type="amount_increase",
            title="Average transaction value increased",
            explanation=(
                "The spending increase was primarily associated with a higher "
                "average transaction value while transaction frequency remained "
                "relatively stable."
            ),
            evidence=evidence,
            persistence=persistence,
            evidence_strength=Decimal("0.82"),
            support=feature_support,
        )

    if category:
        return _Draft(
            root_cause_type="category_growth",
            title=f"{category} spending increased",
            explanation=(
                "The category total increased materially, but changes in frequency "
                "and average transaction value do not identify one dominant driver."
            ),
            evidence=evidence,
            persistence=persistence,
            analysis_status="competing_explanations",
            competing_explanations=["frequency_increase", "amount_increase"],
            evidence_strength=Decimal("0.62"),
            support=feature_support,
        )
    return _insufficient_draft(
        persistence,
        "The overall spending increase is statistically supported, but the "
        "available aggregate evidence does not identify one dominant driver.",
        evidence,
    )


def _recurring_reasoning(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    related: list[BehaviourObservation],
) -> _Draft:
    merchant = _merchant_for_recurring(snapshot, leak, related)
    recurrence = merchant.recurrence if merchant else None
    observation_count = _integer(leak.evidence.get("observation_count"))
    interval = _decimal(leak.evidence.get("average_interval_days"))
    average_amount = _decimal(leak.evidence.get("average_amount"))
    strength = _text(leak.evidence.get("recurrence_strength")) or "unknown"
    first_observed = _date(leak.evidence.get("first_observed_date"))
    last_observed = _date(leak.evidence.get("last_observed_date"))
    duration_days = (
        (last_observed - first_observed).days
        if first_observed and last_observed
        else None
    )
    series = _merchant_series(snapshot, merchant)
    persistence = classify_persistence(series)
    if persistence == "insufficient_history" and duration_days is not None:
        persistence = "persistent" if duration_days >= 28 else "new"
    evidence: dict[str, object] = {
        "observation_count": observation_count,
        "average_interval_days": interval,
        "average_payment": average_amount,
        "recurrence_strength": strength,
        "first_observed_date": first_observed,
        "last_observed_date": last_observed,
        "duration_days": duration_days,
    }
    if recurrence:
        evidence.update(
            {
                "interval_variation": recurrence.interval_variance,
                "amount_variation": recurrence.amount_variance,
            }
        )
    if observation_count is None or observation_count < 3 or interval is None:
        return _insufficient_draft(
            persistence,
            "A recurring payment was detected, but the available history is "
            "insufficient to characterize the commitment reliably.",
            evidence,
        )
    support = (
        support_ratio(merchant.confidence_support)
        if merchant
        else Decimal("0.70")
    )
    return _Draft(
        root_cause_type="recurring_commitment",
        title="Stable recurring payment pattern",
        explanation=(
            "Payments followed a billing-like interval with a sufficiently stable "
            "amount pattern. This supports a recurring financial commitment, but "
            "does not indicate whether the payment is wanted or avoidable."
        ),
        evidence=evidence,
        persistence=persistence,
        evidence_strength=(
            Decimal("0.90") if strength == "high" else Decimal("0.74")
        ),
        support=support,
    )


def _fee_reasoning(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
) -> _Draft:
    fees = snapshot.fees
    months = completed_months(snapshot)
    series = [month.bank_fee_total for month in months]
    subtypes = {
        "atm_fee_total": fees.atm_fee_total,
        "transaction_fee_total": fees.transaction_fee_total,
        "account_fee_total": fees.account_fee_total,
        "sms_fee_total": fees.sms_fee_total,
        "immediate_payment_fee_total": fees.immediate_payment_fee_total,
    }
    identified = {
        key: value for key, value in subtypes.items() if value not in (None, ZERO)
    }
    evidence = {
        "fee_transaction_count": fees.bank_fee_transaction_count,
        "fee_total": fees.bank_fee_total,
        "average_fee": fees.bank_fee_average,
        "monthly_average_fee": leak.evidence.get("monthly_average_fee"),
        "identified_fee_subtypes": identified,
    }
    if identified:
        labels = ", ".join(
            key.removesuffix("_total").replace("_", " ")
            for key in sorted(identified)
        )
        explanation = (
            "Banking fee activity accumulated across the observed period. "
            f"Identifiable fee categories were: {labels}. The data supports these "
            "categories but does not establish that every fee was optional."
        )
        strength = Decimal("0.84")
    else:
        explanation = (
            "Banking fee activity accumulated and increased, but the available "
            "classification evidence does not reliably identify one fee subtype."
        )
        strength = Decimal("0.66")
    return _Draft(
        root_cause_type="fee_accumulation",
        title="Banking fee activity accumulated",
        explanation=explanation,
        evidence=evidence,
        persistence=classify_persistence(series),
        evidence_strength=strength,
    )


def _cash_reasoning(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
) -> _Draft:
    cash = snapshot.cash
    return _Draft(
        root_cause_type="transaction_pattern",
        title="Repeated cash withdrawals carried ATM fee costs",
        explanation=(
            "Repeated cash-withdrawal activity coincided with identifiable ATM fee "
            "costs. The evidence links the detected amount to that transaction "
            "pattern without determining whether the withdrawals were avoidable."
        ),
        evidence={
            "cash_withdrawal_count": cash.cash_withdrawal_count,
            "cash_withdrawal_total": cash.cash_withdrawal_total,
            "atm_fee_count": cash.atm_fee_count,
            "atm_fee_total": cash.atm_fee_total,
        },
        persistence=classify_persistence(
            [month.cash_withdrawal_total for month in completed_months(snapshot)]
        ),
        evidence_strength=Decimal("0.82"),
    )


def _duplicate_reasoning(leak: LeakDetection) -> _Draft:
    count = _integer(leak.evidence.get("transaction_count_in_group"))
    date_span = _integer(leak.evidence.get("date_span_days"))
    amount = _decimal(leak.evidence.get("candidate_amount"))
    return _Draft(
        root_cause_type="potential_duplicate",
        title="Potential duplicate payment requires verification",
        explanation=(
            "Multiple transactions shared the same merchant grouping, amount and "
            "calendar day. This is a duplicate candidate only; the evidence does "
            "not establish fraud, merchant error or an unauthorized payment."
        ),
        evidence={
            "potential_duplicate_amount": amount,
            "matching_transaction_count": count,
            "date_span_days": date_span,
            "verification_required": True,
        },
        persistence="new",
        analysis_status="verification_required",
        evidence_strength=Decimal("0.76"),
    )


def _insufficient_reasoning(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
) -> _Draft:
    return _insufficient_draft(
        classify_persistence(_series_for_leak(snapshot, leak, [])),
        "The detected financial pattern is supported, but the available aggregate "
        "history is insufficient to determine the underlying cause.",
    )


def _insufficient_draft(
    persistence: Persistence,
    explanation: str,
    evidence: dict[str, object] | None = None,
) -> _Draft:
    return _Draft(
        root_cause_type="insufficient_evidence",
        title="Underlying cause could not be determined",
        explanation=explanation,
        evidence=evidence or {},
        persistence=persistence,
        analysis_status="insufficient_evidence",
        evidence_strength=Decimal("0.35"),
        support=Decimal("0.60"),
    )


def _change_metrics(
    evidence: dict[str, object],
) -> tuple[Decimal, Decimal, Decimal, Decimal] | None:
    values = (
        _decimal(evidence.get("previous_amount")),
        _decimal(evidence.get("current_amount")),
        _decimal(evidence.get("transaction_count_previous")),
        _decimal(evidence.get("transaction_count_current")),
    )
    if any(value is None or value <= ZERO for value in values):
        return None
    previous, current, previous_count, current_count = values
    assert previous is not None
    assert current is not None
    assert previous_count is not None
    assert current_count is not None
    return previous, current, previous_count, current_count


def _price_increase_evidence(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    category: str | None,
    observations,
) -> dict[str, object] | None:
    if not category:
        return None
    current_period = _text(leak.evidence.get("current_period"))
    current_total = _decimal(leak.evidence.get("current_amount"))
    if not current_period or current_total in (None, ZERO):
        return None
    candidates = []
    for observation in observations:
        if observation.behavior_type != "price_increase_pattern":
            continue
        merchant_key = _text(observation.evidence.get("merchant_key"))
        merchant = _merchant_feature(snapshot, merchant_key)
        if (
            merchant is None
            or merchant.merchant_category_transaction_count.get(category, 0) == 0
            or not _stable_frequency(merchant)
        ):
            continue
        contribution = merchant.merchant_monthly_totals.get(current_period, ZERO)
        if contribution / current_total < Decimal("0.50"):
            continue
        candidates.append((observation, contribution / current_total))
    if not candidates:
        return None
    observation, share = max(candidates, key=lambda item: item[1])
    return {
        "contributing_merchant_share": share,
        "merchant_previous_average_amount": observation.evidence.get(
            "average_previous_amount"
        ),
        "merchant_latest_amount": observation.evidence.get("latest_amount"),
        "merchant_amount_change_percentage": observation.evidence.get(
            "change_percentage"
        ),
        "merchant_frequency_stable": True,
    }


def _stable_frequency(merchant: MerchantFeature) -> bool:
    counts = list(merchant.merchant_monthly_transaction_count.values())
    if len(counts) < 2:
        return False
    average = Decimal(sum(counts)) / Decimal(len(counts))
    if average == ZERO:
        return False
    return (Decimal(max(counts)) - Decimal(min(counts))) / average <= Decimal("0.25")


def _series_for_leak(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    related: list[BehaviourObservation],
) -> list[Decimal]:
    months = completed_months(snapshot)
    if leak.leak_type == "bank_fee_leak":
        return [month.bank_fee_total for month in months]
    if leak.leak_type == "cash_usage_leak":
        return [month.cash_withdrawal_total for month in months]
    if leak.leak_type == "spending_escalation_leak":
        return [month.total_outflow for month in months]
    if leak.leak_type in _CATEGORY_LEAK_TYPES:
        category = _text(leak.evidence.get("category_name"))
        return [
            month.category_totals.get(category, ZERO) if category else ZERO
            for month in months
        ]
    if leak.leak_type in _RECURRING_LEAK_TYPES:
        merchant = _merchant_for_recurring(snapshot, leak, related)
        return _merchant_series(snapshot, merchant)
    return []


def _merchant_series(
    snapshot: FinancialFeatureSnapshot,
    merchant: MerchantFeature | None,
) -> list[Decimal]:
    if merchant is None:
        return []
    return [
        merchant.merchant_monthly_totals.get(month.month, ZERO)
        for month in completed_months(snapshot)
    ]


def classify_persistence(series: list[Decimal]) -> Persistence:
    """Classify a completed-period amount series without extrapolating it."""
    if len(series) < 2:
        return "insufficient_history"
    previous = series[:-1]
    current = series[-1]
    if current > ZERO and not any(value > ZERO for value in previous):
        return "new"
    active_periods = sum(value > ZERO for value in series)
    if len(series) >= 3:
        recent = series[-3:]
        prior = recent[:-1]
        prior_average = sum(prior, ZERO) / Decimal(len(prior))
        if (
            prior_average > ZERO
            and _relative_range(prior) <= Decimal("0.15")
            and current >= prior_average * Decimal("1.20")
        ):
            return "temporary"
        if _directional(recent, increasing=True):
            return "increasing"
        if _directional(recent, increasing=False):
            return "declining"
    if active_periods >= 2:
        return "persistent"
    return "temporary"


def _directional(values: list[Decimal], *, increasing: bool) -> bool:
    if len(values) < 3 or any(value <= ZERO for value in values):
        return False
    first, second, third = values
    if increasing:
        return (
            second >= first * Decimal("1.05")
            and third >= second * Decimal("1.05")
        )
    return (
        second <= first * Decimal("0.95")
        and third <= second * Decimal("0.95")
    )


def _relative_range(values: list[Decimal]) -> Decimal:
    average = sum(values, ZERO) / Decimal(len(values))
    if average == ZERO:
        return ZERO
    return (max(values) - min(values)) / average


def _avoidability(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    draft: _Draft,
) -> tuple[Avoidability, float | None, Decimal | None]:
    if draft.root_cause_type == "potential_duplicate":
        return "high", 0.72, leak.estimated_monthly_impact
    if leak.leak_type == "bank_fee_leak":
        fees = snapshot.fees
        optional_total = sum(
            (
                fees.atm_fee_total or ZERO,
                fees.transaction_fee_total or ZERO,
                fees.immediate_payment_fee_total or ZERO,
                fees.sms_fee_total or ZERO,
            ),
            ZERO,
        )
        if optional_total > ZERO and fees.bank_fee_transaction_count >= 2:
            return "medium", 0.62, None
        return "unknown", None, None
    if leak.leak_type == "cash_usage_leak":
        return "medium", 0.56, None
    if leak.leak_type in _CATEGORY_LEAK_TYPES:
        return "medium", 0.52, None
    return "unknown", None, None


def _root_cause_confidence(
    snapshot: FinancialFeatureSnapshot,
    related: list[BehaviourObservation],
    draft: _Draft,
) -> float:
    history = min(
        Decimal("1"), Decimal(len(completed_months(snapshot))) / Decimal("6")
    )
    observation_score = (
        Decimal(str(sum(item.confidence for item in related) / len(related)))
        if related
        else Decimal("0.55")
    )
    score = (
        Decimal("0.20")
        + Decimal("0.24") * draft.support
        + Decimal("0.16") * history
        + Decimal("0.26") * draft.evidence_strength
        + Decimal("0.14") * observation_score
    )
    if draft.analysis_status == "competing_explanations":
        score -= Decimal("0.10")
    if draft.analysis_status == "insufficient_evidence":
        score = min(score, Decimal("0.52"))
    return round(float(max(Decimal("0.30"), min(Decimal("0.92"), score))), 2)


def _merchant_for_recurring(
    snapshot: FinancialFeatureSnapshot,
    leak: LeakDetection,
    related: list[BehaviourObservation],
) -> MerchantFeature | None:
    merchant_key = _text(leak.evidence.get("merchant_key"))
    if not merchant_key:
        merchant_key = next(
            (
                _text(observation.evidence.get("merchant_key"))
                for observation in related
                if observation.behavior_type == "recurring_payment_pattern"
            ),
            None,
        )
    return _merchant_feature(snapshot, merchant_key)


def _merchant_feature(
    snapshot: FinancialFeatureSnapshot,
    merchant_key: str | None,
) -> MerchantFeature | None:
    if not merchant_key:
        return None
    return next(
        (
            merchant
            for merchant in snapshot.merchants
            if merchant.merchant_name == merchant_key
        ),
        None,
    )


def _category_feature(
    snapshot: FinancialFeatureSnapshot,
    category: str | None,
) -> CategoryFeature | None:
    if not category:
        return None
    return next(
        (
            feature
            for feature in snapshot.categories
            if feature.category_name == category
        ),
        None,
    )


def _reasoning_id(leak_id: str, root_cause_type: RootCauseType) -> str:
    value = f"{leak_id}|{root_cause_type}|{REASONING_VERSION}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _safe_feature_reference(reference: str) -> str:
    """Keep structural provenance without exposing merchant/category subjects."""
    return re.sub(r"\[[^\]]+\]", "[*]", reference)


def _relative_change(previous: Decimal, current: Decimal) -> Decimal:
    if previous == ZERO:
        return ZERO
    return (current - previous) / previous


def _percentage_change(previous: Decimal, current: Decimal) -> Decimal:
    return _relative_change(previous, current) * Decimal("100")


def _decimal(value: object) -> Decimal | None:
    try:
        parsed = Decimal(str(value)) if value is not None else None
    except Exception:
        return None
    return parsed if parsed is not None and parsed.is_finite() else None


def _integer(value: object) -> int | None:
    parsed = _decimal(value)
    return int(parsed) if parsed is not None else None


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
