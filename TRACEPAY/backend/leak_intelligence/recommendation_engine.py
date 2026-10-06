"""Deterministic recommendations derived only from financial reasoning output."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from decimal import Decimal

from .recommendation_models import (
    FinancialRecommendationResult,
    FindingScope,
    ImpactLabel,
    Priority,
    Recommendation,
    RecommendationMetadata,
    RecommendationType,
)
from .reasoning_models import FinancialReasoning, FinancialReasoningResult
from .service import CONVENIENCE_FOOD_CATEGORIES

RECOMMENDATION_VERSION = "1.0"
AIRTIME_CATEGORY = "Airtime & Data"
ESCALATION_CAUSES = frozenset(
    {
        "frequency_increase",
        "amount_increase",
        "price_increase",
        "transaction_pattern",
        "category_growth",
    }
)
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
_OVERLAP_NOTE = (
    "The overall spending recommendation and the category recommendations "
    "describe the same period at different levels. Do not add their amounts together."
)


@dataclass(frozen=True)
class _Candidate:
    recommendation: Recommendation
    dedupe_key: tuple[str, str]


def recommend_actions(
    reasoning: FinancialReasoningResult,
) -> FinancialRecommendationResult:
    """Turn supported reasoning analyses into non-automated next steps."""
    candidates = []
    for analysis in reasoning.analyses:
        candidate = _recommend_for_analysis(analysis)
        if candidate is not None:
            candidates.append(candidate)
    selected = [
        candidate.recommendation for candidate in _suppress_duplicates(candidates)
    ]
    overlap_note = _apply_overlap_note(selected)
    selected.sort(
        key=lambda item: (
            _PRIORITY_RANK[item.priority],
            item.recommendation_type,
            item.recommendation_id,
        )
    )
    return FinancialRecommendationResult(
        user_id=reasoning.user_id,
        period_start=reasoning.period_start,
        period_end=reasoning.period_end,
        reasoning_version=reasoning.reasoning_version,
        recommendation_version=RECOMMENDATION_VERSION,
        recommendation_count=len(selected),
        recommendations=selected,
        metadata=RecommendationMetadata(overlap_note=overlap_note),
    )


def _recommend_for_analysis(analysis: FinancialReasoning) -> _Candidate | None:
    classified = _classify(analysis)
    if classified is None:
        return None
    recommendation_type, finding_scope, dedupe_subject = classified
    copy = _copy_for(analysis, recommendation_type)
    if copy is None:
        return None
    title, explanation, action = copy
    impact_label, recovery, supported_impact = _amounts(analysis, recommendation_type)
    confidence = _recommendation_confidence(analysis)
    recommendation = Recommendation(
        recommendation_id=_recommendation_id(analysis.reasoning_id, recommendation_type),
        recommendation_type=recommendation_type,
        title=title,
        explanation=explanation,
        recommended_action=action,
        priority=_priority(analysis, confidence),
        recommendation_confidence=confidence,
        source_reasoning_id=analysis.reasoning_id,
        source_root_cause_type=analysis.root_cause_type,
        evidence_references=_evidence_references(analysis),
        finding_scope=finding_scope,
        impact_label=impact_label,
        potential_recovery_amount=recovery,
        supported_impact_amount=supported_impact,
        expected_savings_amount=analysis.impact_assessment.potentially_avoidable_amount,
    )
    return _Candidate(
        recommendation=recommendation,
        dedupe_key=(recommendation_type, dedupe_subject),
    )


def _classify(
    analysis: FinancialReasoning,
) -> tuple[RecommendationType, FindingScope, str] | None:
    if (
        analysis.analysis_status == "insufficient_evidence"
        or analysis.root_cause_type in {"insufficient_evidence", "unknown"}
    ):
        return None
    if analysis.root_cause_type == "fee_accumulation":
        return "review_bank_fees", "standalone", "bank-fees"
    if analysis.root_cause_type == "recurring_commitment":
        return "review_recurring_payment", "standalone", analysis.reasoning_id
    if analysis.root_cause_type == "potential_duplicate":
        return (
            "verify_potential_duplicate",
            "one_time_recovery_candidate",
            analysis.reasoning_id,
        )
    if analysis.root_cause_type not in ESCALATION_CAUSES:
        return None
    if _is_cash_pattern(analysis):
        return None

    category = _category_name(analysis)
    if (
        analysis.root_cause_type == "frequency_increase"
        and category == AIRTIME_CATEGORY
    ):
        return "review_airtime_data_usage", "contributing_category", category
    if (
        analysis.root_cause_type == "frequency_increase"
        and category in CONVENIENCE_FOOD_CATEGORIES
    ):
        return "review_high_frequency_spending", "contributing_category", category
    if category is None:
        return "monitor_spending_pattern", "overall_pattern", "overall"
    return "monitor_spending_pattern", "contributing_category", category


def _copy_for(
    analysis: FinancialReasoning,
    recommendation_type: RecommendationType,
) -> tuple[str, str, str] | None:
    avoidability_clause = _avoidability_clause(analysis)
    if recommendation_type == "review_bank_fees":
        return (
            "Review banking fees",
            (
                "Banking fee activity accumulated in the observed period. "
                "This recommendation is shown so those fee transactions can be reviewed. "
                f"{avoidability_clause}"
            ),
            (
                "Review the fee transactions and determine whether lower-cost account "
                "or payment options are available. TracePay will not change the account "
                "or contact the bank."
            ),
        )
    if recommendation_type == "review_recurring_payment":
        return (
            "Review recurring payment",
            (
                "A recurring payment pattern was observed. This recommendation is shown "
                "because the reasoning layer found a recurring financial commitment. "
                f"{avoidability_clause}"
            ),
            (
                "Verify whether the recurring payment is still wanted and whether the "
                "amount and service are still appropriate. TracePay will not stop or "
                "change the payment."
            ),
        )
    if recommendation_type == "review_high_frequency_spending":
        category = _category_name(analysis) or "food"
        return (
            "Review spending frequency",
            (
                f"{category} spending increased mainly because there were more "
                "related transactions, rather than substantially larger individual "
                "transactions. This recommendation is shown so that frequency can "
                "be reviewed."
            ),
            (
                "Review how often these purchases are happening and decide which ones "
                "are still wanted. TracePay is not setting a budget and has not judged "
                "individual purchases."
            ),
        )
    if recommendation_type == "review_airtime_data_usage":
        return (
            "Review airtime and data usage",
            (
                "Airtime and data spending increased mainly because there were more "
                "airtime and data transactions. This recommendation is shown because "
                "transaction frequency was the primary driver."
            ),
            (
                "Review how often airtime and data purchases are happening. TracePay "
                "is not assuming the spending is too high and is not recommending a "
                "specific package."
            ),
        )
    if recommendation_type == "verify_potential_duplicate":
        count = _integer(analysis.evidence.get("matching_transaction_count"))
        observed = (
            "Two transactions may represent a duplicate payment."
            if count == 2
            else "A group of transactions may represent a duplicate payment."
        )
        return (
            "Verify potential duplicate payment",
            (
                f"{observed} They shared a merchant grouping, amount and calendar day. "
                "This recommendation is a verification step. TracePay has not confirmed "
                "that this was a duplicate or an error. Any potential recovery amount "
                "comes directly from that matching amount and is not recovered money."
            ),
            (
                "Compare the transactions in this group before taking action. TracePay "
                "will not contact the bank or dispute the payment."
            ),
        )
    if recommendation_type == "monitor_spending_pattern":
        return _monitor_copy(analysis)
    return None


def _monitor_copy(analysis: FinancialReasoning) -> tuple[str, str, str]:
    category = _category_name(analysis)
    subject = category if category else "Spending"
    driver = _driver_sentence(analysis, subject)
    title = "Monitor spending increase" if category is None else "Monitor spending pattern"
    return (
        title,
        (
            f"{driver} This recommendation is shown so the pattern can be watched. "
            "The amount is an observed change relative to the comparison period."
        ),
        (
            "Monitor whether this pattern continues relative to the comparison period. "
            "TracePay will not move money or change financial settings."
        ),
    )


def _driver_sentence(analysis: FinancialReasoning, subject: str) -> str:
    if analysis.root_cause_type == "frequency_increase":
        if subject == "Spending":
            return (
                "Spending increased relative to the comparison period, and "
                "transaction frequency was the primary driver."
            )
        return (
            f"{subject} spending increased relative to the comparison period, and "
            "transaction frequency was the primary driver."
        )
    if analysis.root_cause_type == "amount_increase":
        return (
            f"{subject} increased relative to the comparison period. The increase "
            "was mainly associated with a higher average transaction value."
        )
    if analysis.root_cause_type == "price_increase":
        return (
            f"{subject} increased relative to the comparison period. The increase "
            "aligns with a higher average transaction value at a contributing merchant. "
            "This does not establish that the merchant changed its prices."
        )
    if analysis.root_cause_type == "transaction_pattern":
        return (
            f"{subject} increased relative to the comparison period. Both transaction "
            "frequency and average transaction value contributed, so neither is the "
            "only driver."
        )
    return (
        f"{subject} increased relative to the comparison period, but frequency and "
        "average transaction value do not identify one dominant driver."
    )


def _avoidability_clause(analysis: FinancialReasoning) -> str:
    if analysis.avoidability == "unknown":
        return "Avoidability has not been determined."
    if analysis.root_cause_type == "fee_accumulation":
        return (
            "TracePay has not established that every fee was optional or avoidable."
        )
    if analysis.root_cause_type == "recurring_commitment":
        return (
            "The reasoning layer has not established whether the payment is wanted "
            "or avoidable."
        )
    return "Avoidability has not been determined."


def _amounts(
    analysis: FinancialReasoning,
    recommendation_type: RecommendationType,
) -> tuple[ImpactLabel | None, Decimal | None, Decimal | None]:
    detected = analysis.impact_assessment.detected_amount
    if recommendation_type == "verify_potential_duplicate":
        return (
            "potential_recovery_candidate",
            analysis.impact_assessment.recoverable_amount,
            detected,
        )
    if recommendation_type == "review_bank_fees":
        return "observed_fee_activity", None, detected
    if recommendation_type == "review_recurring_payment":
        return "observed_recurring_payment", None, detected
    return "detected_increase", None, detected


def _recommendation_confidence(analysis: FinancialReasoning) -> float:
    """Score the recommended next step separately from root-cause confidence."""
    score = Decimal(str(analysis.confidence)) * Decimal("0.92")
    if analysis.analysis_status == "verification_required":
        score = min(score, Decimal("0.70"))
    if analysis.analysis_status == "competing_explanations":
        score -= Decimal("0.08")
    if analysis.avoidability == "unknown":
        score -= Decimal("0.05")
    if analysis.persistence == "temporary":
        score -= Decimal("0.04")
    if analysis.persistence == "insufficient_history":
        score -= Decimal("0.06")
    clamped = max(Decimal("0.30"), min(Decimal("0.88"), score))
    return round(float(clamped), 2)


def _priority(analysis: FinancialReasoning, confidence: float) -> Priority:
    if analysis.root_cause_type == "potential_duplicate":
        if analysis.impact_assessment.recoverable_amount is not None:
            return "high"
        return "medium"

    persistent = analysis.persistence in {"persistent", "increasing"}
    strong = persistent and confidence >= 0.70
    if analysis.avoidability == "unknown":
        return "medium" if strong else "low"
    if analysis.root_cause_type == "fee_accumulation" and strong:
        return "high"
    if strong or (analysis.root_cause_type == "frequency_increase" and confidence >= 0.70):
        return "medium"
    return "low"


def _apply_overlap_note(recommendations: list[Recommendation]) -> str | None:
    scopes = {item.finding_scope for item in recommendations}
    if "overall_pattern" not in scopes or "contributing_category" not in scopes:
        return None
    for item in recommendations:
        if item.finding_scope == "overall_pattern" and _OVERLAP_NOTE not in item.explanation:
            item.explanation = f"{item.explanation} {_OVERLAP_NOTE}"
    return _OVERLAP_NOTE


def _suppress_duplicates(candidates: list[_Candidate]) -> list[_Candidate]:
    selected: dict[tuple[str, str], _Candidate] = {}
    for candidate in candidates:
        current = selected.get(candidate.dedupe_key)
        if current is None or _outranks(candidate.recommendation, current.recommendation):
            selected[candidate.dedupe_key] = candidate
    return list(selected.values())


def _outranks(candidate: Recommendation, current: Recommendation) -> bool:
    candidate_rank = (
        -_PRIORITY_RANK[candidate.priority],
        candidate.recommendation_confidence,
        candidate.source_reasoning_id,
    )
    current_rank = (
        -_PRIORITY_RANK[current.priority],
        current.recommendation_confidence,
        current.source_reasoning_id,
    )
    return candidate_rank > current_rank


def _category_name(analysis: FinancialReasoning) -> str | None:
    category = analysis.evidence.get("category")
    if isinstance(category, str) and category.strip():
        return category.strip()
    return None


def _is_cash_pattern(analysis: FinancialReasoning) -> bool:
    return "cash_withdrawal_count" in analysis.evidence


def _evidence_references(analysis: FinancialReasoning) -> list[str]:
    references = []
    for reference in analysis.supporting_feature_references:
        if not isinstance(reference, str):
            continue
        cleaned = re.sub(r"\[[^\]]+\]", "[*]", reference).strip()
        if not cleaned or re.search(r"\d{6,}", cleaned):
            continue
        references.append(cleaned[:200])
    references.append(f"reasoning:{analysis.reasoning_id}")
    return list(dict.fromkeys(references))


def _integer(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _recommendation_id(reasoning_id: str, recommendation_type: str) -> str:
    value = f"{reasoning_id}|{recommendation_type}|{RECOMMENDATION_VERSION}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]
