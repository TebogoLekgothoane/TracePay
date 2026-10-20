"""Read-only composition of one intelligence run into a report.

This module does not detect leaks, explain them, or recommend actions.
It joins the existing results and copies their amounts.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_serializer
from pydantic.functional_serializers import SerializerFunctionWrapHandler

from .behaviour_models import (
    BehaviourAnalysisResult,
    BehaviourObservation,
    BehaviourSeverity,
    BehaviorType,
)
from .leak_engine import _has_minimum_history
from .leak_models import ImpactKind, LeakDetection, LeakDetectionResult, LeakSeverity, LeakType
from .models import FinancialFeatureSnapshot
from .reasoning_models import (
    AnalysisStatus,
    Avoidability,
    FinancialReasoning,
    FinancialReasoningResult,
    Persistence,
    RootCauseType,
)
from .recommendation_engine import _PRIORITY_RANK
from .recommendation_models import (
    FinancialRecommendationResult,
    FindingScope,
    ImpactLabel,
    Priority,
    Recommendation,
    RecommendationType,
)

REPORT_CONTRACT_VERSION = "1.0"
_LONG_DIGIT_RUN = re.compile(r"\d{6,}")
_SEVERITY_RANK: dict[LeakSeverity, int] = {"high": 0, "medium": 1, "low": 2}
_MISSING = object()

# Every current ImpactLabel maps to one inventory. impact_kind is not used.
_INVENTORY_BY_LABEL: dict[ImpactLabel, str] = {
    "observed_recurring_payment": "observed_recurring",
    "observed_fee_activity": "observed_fee_activity",
    "detected_increase": "observed_increase",
    "potential_recovery_candidate": "recovery_candidates",
}

# Scalar evidence keys that already exist on leak or reasoning evidence.
# Period totals and group_total are intentionally absent.
_HIGHLIGHTS: tuple[tuple[str, str], ...] = (
    ("category", "Category"),
    ("category_name", "Category"),
    ("previous_total", "Previous total"),
    ("current_total", "Current total"),
    ("absolute_change", "Absolute change"),
    ("percentage_change", "Percentage change"),
    ("previous_transaction_count", "Previous transaction count"),
    ("current_transaction_count", "Current transaction count"),
    ("previous_average_transaction_amount", "Previous average transaction amount"),
    ("current_average_transaction_amount", "Current average transaction amount"),
    ("transaction_count_change_percentage", "Transaction count change"),
    ("average_amount_change_percentage", "Average amount change"),
    ("months_compared", "Months compared"),
    ("observation_count", "Observations"),
    ("average_interval_days", "Average interval in days"),
    ("average_payment", "Average payment"),
    ("average_amount", "Average payment"),
    ("recurrence_strength", "Recurrence strength"),
    ("duration_days", "Duration in days"),
    ("first_observed_date", "First observed"),
    ("last_observed_date", "Last observed"),
    ("expected_interval_days", "Expected interval in days"),
    ("days_since_last_observed", "Days since last observed"),
    ("observed_date", "Transaction date"),
    ("transaction_date", "Transaction date"),
    ("transaction_time", "Transaction time"),
    ("transaction_amount", "Transaction amount"),
    ("category_median_amount", "Category median amount"),
    ("difference_from_baseline", "Difference from baseline"),
    ("amount_multiple_of_category_median", "Multiple of category median"),
    ("baseline_sample_size", "Baseline sample size"),
    ("merchant_display_name", "Merchant"),
    ("merchant_key", "Merchant"),
    ("fee_transaction_count", "Fee transactions"),
    ("completed_month_count", "Completed months"),
    ("fee_change_amount", "Fee change"),
    ("interest_charge_count", "Interest charges"),
    ("overdraft_fee_count", "Overdraft fees"),
    ("insufficient_funds_fee_count", "Insufficient-funds charges"),
    ("foreign_transaction_fee_count", "Foreign transaction fees"),
    ("card_fee_transaction_count", "Card fee transactions"),
    ("cash_withdrawal_count", "Cash withdrawals"),
    ("atm_fee_count", "ATM fees"),
    ("category_transaction_count", "Category transactions"),
    ("airtime_transaction_count", "Airtime transactions"),
    ("data_transaction_count", "Data transactions"),
    ("ride_hailing_transaction_count", "Ride-hailing transactions"),
    ("food_delivery_transaction_count", "Food delivery transactions"),
    ("contributing_merchant_share", "Contributing merchant share"),
    ("merchant_previous_average_amount", "Merchant previous average amount"),
    ("merchant_latest_amount", "Merchant latest amount"),
    ("merchant_amount_change_percentage", "Merchant amount change"),
    ("merchant_frequency_stable", "Merchant frequency stable"),
    ("previous_average_amount", "Previous average amount"),
    ("latest_amount", "Latest amount"),
    ("amount_change", "Amount change"),
    ("amount_change_percentage", "Amount change percentage"),
    ("baseline_interval_days", "Baseline interval in days"),
    ("current_interval_days", "Current interval in days"),
    ("interval_change_days", "Interval change in days"),
    ("potential_duplicate_amount", "Amount of each matching transaction"),
    ("candidate_amount", "Amount of each matching transaction"),
    ("matching_transaction_count", "Matching transactions"),
    ("transaction_count_in_group", "Matching transactions"),
    ("date_span_days", "Date span in days"),
    ("min_time_gap_minutes", "Minimum time gap in minutes"),
    ("verification_required", "Verification required"),
    ("monthly_average_fee", "Average monthly fees"),
    ("recurring_fee_total", "Recurring fee total"),
    ("one_off_fee_total", "One-off fee total"),
    ("contributor_explanation", "Spending change contributors"),
    ("billing_date_shift_days", "Billing date shift in days"),
    ("amount_variance", "Amount variance"),
    ("recurring_debit_order_count", "Recurring debit-order collections"),
    ("recurring_debit_order_months", "Recurring debit-order months"),
    ("active_streaming_service_count", "Active streaming services"),
    ("combined_monthly_streaming_spend", "Combined monthly streaming spend"),
    ("overlapping_month_count", "Overlapping billing months"),
    ("coffee_transaction_count", "Coffee transactions"),
    ("coffee_total_amount", "Total coffee spend"),
    ("monthly_coffee_spend", "Average monthly coffee spend"),
    ("convenience_store_transaction_count", "Convenience-store visits"),
    ("convenience_store_total_amount", "Total convenience-store spend"),
    ("monthly_convenience_spend", "Average monthly convenience-store spend"),
    ("discretionary_weekend_total", "Discretionary weekend spend"),
    ("discretionary_weekday_total", "Discretionary weekday spend"),
    ("discretionary_weekend_daily_average", "Discretionary weekend daily average"),
    ("discretionary_weekday_daily_average", "Discretionary weekday daily average"),
    ("active_weekend_count", "Active weekends"),
    ("salary_event_count", "Salary events"),
    ("salary_cycles_with_discretionary_spike", "Pay cycles with post-payday spike"),
    ("post_salary_discretionary_total", "Post-payday discretionary spend"),
    ("post_salary_essential_total", "Post-payday essential obligations"),
    ("post_salary_discretionary_transaction_count", "Post-payday discretionary transactions"),
)
_HIGHLIGHT_ALIASES: tuple[frozenset[str], ...] = (
    frozenset({"category", "category_name"}),
    frozenset({"average_payment", "average_amount"}),
    frozenset({"potential_duplicate_amount", "candidate_amount"}),
    frozenset({"matching_transaction_count", "transaction_count_in_group"}),
    frozenset({"merchant_display_name", "merchant_key"}),
)

FindingsAvailability = Literal[
    "no_transactions",
    "insufficient_history",
    "no_qualifying_findings",
    "available",
]
HighlightValue = Decimal | str | int | bool


class ReportCompositionError(Exception):
    """Leak and reasoning rows from one run cannot be joined."""


class ReportAnalysis(BaseModel):
    earliest_transaction_date: date | None = None
    latest_transaction_date: date | None = None
    transaction_count: int = Field(ge=0)
    history_sufficient_for_leak_detection: bool
    findings_availability: FindingsAvailability


class ReportVersions(BaseModel):
    detector_version: str = Field(min_length=1, max_length=32)
    reasoning_version: str = Field(min_length=1, max_length=32)
    recommendation_version: str = Field(min_length=1, max_length=32)


class ReportConsistency(BaseModel):
    assembled_in_single_request: Literal[True] = True
    persisted_snapshot: Literal[False] = False


class ReportUncertainty(BaseModel):
    leak_confidence: float = Field(ge=0, le=1)
    reasoning_confidence: float = Field(ge=0, le=1)
    recommendation_confidence: float | None = Field(default=None, ge=0, le=1)


class ReportImpact(BaseModel):
    detected_amount: Decimal = Field(ge=0)
    detected_annual_amount: Decimal | None = Field(default=None, ge=0)
    impact_kind: ImpactKind
    impact_label: ImpactLabel | None = None
    recoverable_amount: Decimal | None = Field(default=None, ge=0)
    currency: Literal["ZAR"] = "ZAR"


class ReportRecommendation(BaseModel):
    recommendation_id: str = Field(min_length=16, max_length=64)
    recommendation_type: RecommendationType
    title: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=1_200)
    recommended_action: str = Field(min_length=1, max_length=1_000)
    priority: Priority
    recommendation_confidence: float = Field(ge=0, le=1)
    source_reasoning_id: str = Field(min_length=16, max_length=64)
    source_root_cause_type: RootCauseType
    finding_scope: FindingScope
    impact_label: ImpactLabel | None = None
    supported_impact_amount: Decimal | None = Field(default=None, ge=0)
    potential_recovery_amount: Decimal | None = Field(default=None, ge=0)
    currency: Literal["ZAR"] = "ZAR"


class EvidenceHighlight(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=120)
    value: HighlightValue


class ReportBehaviour(BaseModel):
    observation_id: str = Field(min_length=1, max_length=200)
    behavior_type: BehaviorType
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=500)
    severity: BehaviourSeverity
    confidence: float = Field(ge=0, le=1)


class ReportFinding(BaseModel):
    leak_id: str = Field(min_length=16, max_length=64)
    reasoning_id: str = Field(min_length=16, max_length=64)
    recommendation_id: str | None = Field(default=None, min_length=16, max_length=64)
    display_index: int = Field(ge=0)
    what_happened: str = Field(min_length=1, max_length=800)
    why_title: str = Field(min_length=1, max_length=200)
    why_flagged: str = Field(min_length=1, max_length=1_000)
    what_next: str | None = Field(default=None, min_length=1, max_length=1_000)
    leak_type: LeakType
    root_cause_type: RootCauseType
    analysis_status: AnalysisStatus
    persistence: Persistence
    avoidability: Avoidability
    competing_explanations: list[RootCauseType] = Field(default_factory=list)
    uncertainty: ReportUncertainty
    impact: ReportImpact
    recommendation: ReportRecommendation | None = None
    evidence_highlights: list[EvidenceHighlight] = Field(default_factory=list)
    supporting_behavior_ids: list[str] = Field(default_factory=list)
    supporting_behaviours: list[ReportBehaviour] = Field(default_factory=list)


class ReportInventoryLine(BaseModel):
    leak_id: str = Field(min_length=16, max_length=64)
    amount: Decimal = Field(ge=0)
    impact_label: ImpactLabel
    verification_required: Literal[True] | None = None

    @model_serializer(mode="wrap")
    def _omit_absent_verification(self, handler: SerializerFunctionWrapHandler):
        data = handler(self)
        if isinstance(data, dict) and data.get("verification_required") is None:
            data.pop("verification_required")
        return data


class ReportInventories(BaseModel):
    observed_recurring: list[ReportInventoryLine] = Field(default_factory=list)
    observed_fee_activity: list[ReportInventoryLine] = Field(default_factory=list)
    observed_increase: list[ReportInventoryLine] = Field(default_factory=list)
    recovery_candidates: list[ReportInventoryLine] = Field(default_factory=list)


class UnavailableAmount(BaseModel):
    availability: Literal["unavailable"] = "unavailable"


class ReportFinancialSummary(BaseModel):
    amounts_are_additive: Literal[False] = False
    overlap_note: str | None = None
    verified_savings: UnavailableAmount = Field(default_factory=UnavailableAmount)
    expected_savings: UnavailableAmount = Field(default_factory=UnavailableAmount)
    inventories: ReportInventories


class ReportContext(BaseModel):
    behaviour_observation_count: int = Field(ge=0)
    unattached_observation_count: int = Field(ge=0)


class FinancialIntelligenceReport(BaseModel):
    report_contract_version: Literal["1.0"] = REPORT_CONTRACT_VERSION
    generated_at: datetime
    currency: Literal["ZAR"] = "ZAR"
    analysis: ReportAnalysis
    versions: ReportVersions
    consistency: ReportConsistency
    findings: list[ReportFinding] = Field(default_factory=list)
    financial_summary: ReportFinancialSummary
    context: ReportContext


def assemble_financial_intelligence_report(
    snapshot: FinancialFeatureSnapshot,
    behaviours: BehaviourAnalysisResult,
    leaks: LeakDetectionResult,
    reasoning: FinancialReasoningResult,
    recommendations: FinancialRecommendationResult,
    *,
    generated_at: datetime | None = None,
) -> FinancialIntelligenceReport:
    """Join one in-memory pipeline run. Raises if a leak has no reasoning row."""
    _require_one_user(snapshot, behaviours, leaks, reasoning, recommendations)
    analyses = _analyses_by_leak(leaks, reasoning)
    recommendations_by_reasoning = _recommendations_by_reasoning(reasoning, recommendations)
    observations = _observations_by_id(behaviours)
    rows = [
        _Joined(
            leak,
            analyses[leak.leak_id],
            recommendations_by_reasoning.get(analyses[leak.leak_id].reasoning_id),
        )
        for leak in leaks.leaks
    ]
    rows.sort(key=_display_sort_key)
    findings = [
        _finding(row, index, observations) for index, row in enumerate(rows)
    ]
    referenced = {
        observation_id
        for finding in findings
        for observation_id in finding.supporting_behavior_ids
    }
    unattached = sum(
        observation.observation_id not in referenced
        for observation in behaviours.observations
    )
    return FinancialIntelligenceReport(
        generated_at=_utc_now(generated_at),
        analysis=ReportAnalysis(
            earliest_transaction_date=snapshot.date_start,
            latest_transaction_date=snapshot.date_end,
            transaction_count=snapshot.transaction_count,
            history_sufficient_for_leak_detection=_has_minimum_history(snapshot),
            findings_availability=_findings_availability(snapshot, leaks),
        ),
        versions=ReportVersions(
            detector_version=leaks.detector_version,
            reasoning_version=reasoning.reasoning_version,
            recommendation_version=recommendations.recommendation_version,
        ),
        consistency=ReportConsistency(),
        findings=findings,
        financial_summary=ReportFinancialSummary(
            amounts_are_additive=recommendations.metadata.amounts_are_additive,
            overlap_note=recommendations.metadata.overlap_note,
            inventories=_inventories(findings),
        ),
        context=ReportContext(
            behaviour_observation_count=len(behaviours.observations),
            unattached_observation_count=unattached,
        ),
    )


class _Joined:
    def __init__(
        self,
        leak: LeakDetection,
        analysis: FinancialReasoning,
        recommendation: Recommendation | None,
    ) -> None:
        self.leak = leak
        self.analysis = analysis
        self.recommendation = recommendation


def _require_one_user(
    snapshot: FinancialFeatureSnapshot,
    behaviours: BehaviourAnalysisResult,
    leaks: LeakDetectionResult,
    reasoning: FinancialReasoningResult,
    recommendations: FinancialRecommendationResult,
) -> None:
    user_ids = {
        snapshot.user_id,
        behaviours.user_id,
        leaks.user_id,
        reasoning.user_id,
        recommendations.user_id,
    }
    if len(user_ids) != 1:
        raise ReportCompositionError("Intelligence results belong to more than one user.")


def _analyses_by_leak(
    leaks: LeakDetectionResult,
    reasoning: FinancialReasoningResult,
) -> dict[str, FinancialReasoning]:
    leak_ids = [leak.leak_id for leak in leaks.leaks]
    analysis_ids = [analysis.leak_id for analysis in reasoning.analyses]
    if Counter(leak_ids) != Counter(analysis_ids) or len(leak_ids) != len(set(leak_ids)):
        raise ReportCompositionError("Each leak must have one matching reasoning record.")
    return {analysis.leak_id: analysis for analysis in reasoning.analyses}


def _recommendations_by_reasoning(
    reasoning: FinancialReasoningResult,
    recommendations: FinancialRecommendationResult,
) -> dict[str, Recommendation]:
    reasoning_ids = {analysis.reasoning_id for analysis in reasoning.analyses}
    selected: dict[str, Recommendation] = {}
    for recommendation in recommendations.recommendations:
        source_id = recommendation.source_reasoning_id
        if source_id not in reasoning_ids or source_id in selected:
            raise ReportCompositionError(
                "A recommendation is not linked to exactly one reasoning record."
            )
        selected[source_id] = recommendation
    return selected


def _observations_by_id(
    behaviours: BehaviourAnalysisResult,
) -> dict[str, BehaviourObservation]:
    selected: dict[str, BehaviourObservation] = {}
    for observation in behaviours.observations:
        selected.setdefault(observation.observation_id, observation)
    return selected


def _findings_availability(
    snapshot: FinancialFeatureSnapshot,
    leaks: LeakDetectionResult,
) -> FindingsAvailability:
    if snapshot.transaction_count == 0:
        return "no_transactions"
    if not _has_minimum_history(snapshot):
        return "insufficient_history"
    if not leaks.leaks:
        return "no_qualifying_findings"
    return "available"


def _display_sort_key(row: _Joined) -> tuple:
    """Presentation order only. Recommendation priority and leak severity stay separate."""
    recommendation = row.recommendation
    if recommendation is not None:
        return (
            0,
            _PRIORITY_RANK[recommendation.priority],
            recommendation.recommendation_type,
            recommendation.recommendation_id,
        )
    return (
        1,
        _SEVERITY_RANK[row.leak.severity],
        -row.leak.confidence,
        row.leak.leak_id,
    )


def _finding(
    row: _Joined,
    display_index: int,
    observations: dict[str, BehaviourObservation],
) -> ReportFinding:
    leak = row.leak
    analysis = row.analysis
    recommendation = row.recommendation
    nested = _nested_recommendation(recommendation)
    return ReportFinding(
        leak_id=leak.leak_id,
        reasoning_id=analysis.reasoning_id,
        recommendation_id=None if nested is None else nested.recommendation_id,
        display_index=display_index,
        what_happened=_what_happened(leak),
        why_title=analysis.title,
        why_flagged=analysis.explanation,
        what_next=None if nested is None else nested.recommended_action,
        leak_type=leak.leak_type,
        root_cause_type=analysis.root_cause_type,
        analysis_status=analysis.analysis_status,
        persistence=analysis.persistence,
        avoidability=analysis.avoidability,
        competing_explanations=list(analysis.competing_explanations),
        uncertainty=ReportUncertainty(
            leak_confidence=leak.confidence,
            reasoning_confidence=analysis.confidence,
            recommendation_confidence=(
                None if nested is None else nested.recommendation_confidence
            ),
        ),
        impact=ReportImpact(
            detected_amount=analysis.impact_assessment.detected_amount,
            detected_annual_amount=analysis.impact_assessment.detected_annual_amount,
            impact_kind=analysis.impact_assessment.impact_kind,
            impact_label=None if nested is None else nested.impact_label,
            recoverable_amount=analysis.impact_assessment.recoverable_amount,
            currency=analysis.impact_assessment.currency,
        ),
        recommendation=nested,
        evidence_highlights=_highlights(leak, analysis),
        supporting_behavior_ids=list(analysis.supporting_behavior_ids),
        supporting_behaviours=_behaviours(analysis, observations),
    )


def _nested_recommendation(
    recommendation: Recommendation | None,
) -> ReportRecommendation | None:
    if recommendation is None:
        return None
    return ReportRecommendation(
        recommendation_id=recommendation.recommendation_id,
        recommendation_type=recommendation.recommendation_type,
        title=recommendation.title,
        explanation=recommendation.explanation,
        recommended_action=recommendation.recommended_action,
        priority=recommendation.priority,
        recommendation_confidence=recommendation.recommendation_confidence,
        source_reasoning_id=recommendation.source_reasoning_id,
        source_root_cause_type=recommendation.source_root_cause_type,
        finding_scope=recommendation.finding_scope,
        impact_label=recommendation.impact_label,
        supported_impact_amount=recommendation.supported_impact_amount,
        potential_recovery_amount=recommendation.potential_recovery_amount,
        currency=recommendation.currency,
    )


def _what_happened(leak: LeakDetection) -> str:
    title = leak.title.strip()
    description = leak.description.strip()
    if title.endswith((".", "!", "?")):
        return f"{title} {description}"
    return f"{title}. {description}"


def _behaviours(
    analysis: FinancialReasoning,
    observations: dict[str, BehaviourObservation],
) -> list[ReportBehaviour]:
    matched: list[ReportBehaviour] = []
    seen: set[str] = set()
    for observation_id in analysis.supporting_behavior_ids:
        if observation_id in seen:
            continue
        seen.add(observation_id)
        observation = observations.get(observation_id)
        if observation is None:
            continue
        matched.append(
            ReportBehaviour(
                observation_id=observation.observation_id,
                behavior_type=observation.behavior_type,
                title=observation.title,
                description=observation.description,
                severity=observation.severity,
                confidence=observation.confidence,
            )
        )
    return matched


def _highlights(
    leak: LeakDetection,
    analysis: FinancialReasoning,
) -> list[EvidenceHighlight]:
    used_aliases: set[str] = set()
    highlights: list[EvidenceHighlight] = []
    for key, label in _HIGHLIGHTS:
        if key in used_aliases:
            continue
        value = _evidence_value(analysis.evidence, leak.evidence, key)
        parsed = _highlight_value(value)
        if parsed is None:
            continue
        highlights.append(EvidenceHighlight(key=key, label=label, value=parsed))
        used_aliases.update(_alias_group(key))
    return highlights


def _alias_group(key: str) -> set[str]:
    for group in _HIGHLIGHT_ALIASES:
        if key in group:
            return set(group)
    return {key}


def _evidence_value(
    reasoning_evidence: dict[str, object],
    leak_evidence: dict[str, object],
    key: str,
) -> object:
    if key in reasoning_evidence:
        return reasoning_evidence[key]
    if key in leak_evidence:
        return leak_evidence[key]
    return _MISSING


def _highlight_value(value: object) -> HighlightValue | None:
    if value is _MISSING or value is None or isinstance(value, (dict, list, tuple)):
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return None if _has_long_digit_run(str(value)) else value
    if isinstance(value, Decimal):
        if not value.is_finite() or _has_long_digit_run(str(value)):
            return None
        return value
    if isinstance(value, datetime):
        return None
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        cleaned = value.strip()
        if (
            not cleaned
            or _has_long_digit_run(cleaned)
            or "[" in cleaned
            or "]" in cleaned
        ):
            return None
        return cleaned[:200]
    return None


def _has_long_digit_run(value: str) -> bool:
    return _LONG_DIGIT_RUN.search(value) is not None


def _inventories(findings: list[ReportFinding]) -> ReportInventories:
    grouped: dict[str, list[ReportInventoryLine]] = {
        "observed_recurring": [],
        "observed_fee_activity": [],
        "observed_increase": [],
        "recovery_candidates": [],
    }
    for finding in findings:
        line = _inventory_line(finding)
        if line is None:
            continue
        inventory = _INVENTORY_BY_LABEL.get(line.impact_label)
        if inventory is None:
            continue
        grouped[inventory].append(line)
    return ReportInventories(**grouped)


def _inventory_line(finding: ReportFinding) -> ReportInventoryLine | None:
    recommendation = finding.recommendation
    if (
        recommendation is None
        or recommendation.impact_label is None
        or finding.analysis_status == "insufficient_evidence"
        or finding.leak_type == "cash_usage_leak"
    ):
        return None
    label = recommendation.impact_label
    if label == "potential_recovery_candidate":
        amount = recommendation.potential_recovery_amount
    else:
        amount = recommendation.supported_impact_amount
    if amount is None or label not in _INVENTORY_BY_LABEL:
        return None
    verification = (
        label == "potential_recovery_candidate"
        and _verification_supported(finding)
    )
    return ReportInventoryLine(
        leak_id=finding.leak_id,
        amount=amount,
        impact_label=label,
        verification_required=True if verification else None,
    )


def _verification_supported(finding: ReportFinding) -> bool:
    return any(
        highlight.key == "verification_required" and highlight.value is True
        for highlight in finding.evidence_highlights
    )


def _utc_now(generated_at: datetime | None) -> datetime:
    if generated_at is None:
        return datetime.now(timezone.utc)
    if generated_at.tzinfo is None or generated_at.utcoffset() is None:
        raise ReportCompositionError("generated_at must be timezone-aware.")
    return generated_at.astimezone(timezone.utc)
