"""Sanitized textual reporting for behavioural observations."""

from __future__ import annotations

from .behaviour_models import BehaviourAnalysisResult


def render_behaviour_report(result: BehaviourAnalysisResult) -> str:
    """Render aggregate-safe observations without raw transaction details."""
    lines = [
        "========================================",
        "TRACEPAY BEHAVIOUR ANALYSIS REPORT",
        "========================================",
        "",
        f"Transactions analysed: {result.transaction_count}",
        f"Observation period: {_period(result)}",
        "",
        "Behavioural observations:",
    ]
    if not result.observations:
        lines.append("No behaviour patterns met the minimum evidence threshold.")
        return "\n".join(lines)
    for index, observation in enumerate(result.observations, start=1):
        lines.extend(
            [
                "",
                f"{index}. {_safe_title(observation.behavior_type, observation.title)}",
                f"   Severity: {observation.severity}",
                f"   Confidence: {observation.confidence:.2f}",
                f"   Evidence: {_summary(observation.evidence)}",
            ]
        )
    return "\n".join(lines)


def _period(result: BehaviourAnalysisResult) -> str:
    if result.period_start is None or result.period_end is None:
        return "Unavailable"
    return f"{result.period_start.isoformat()} to {result.period_end.isoformat()}"


def _summary(evidence: dict[str, object]) -> str:
    safe_keys = (
        "previous_amount",
        "current_amount",
        "change_amount",
        "change_percentage",
        "observation_count",
        "recurrence_strength",
        "weekend_spending_share",
        "post_income_spending_share",
        "candidate_only",
    )
    values = [
        f"{key}={evidence[key]}"
        for key in safe_keys
        if key in evidence
    ]
    return ", ".join(values) if values else "aggregate pattern evidence available"


def _safe_title(behavior_type: str, fallback: str) -> str:
    """Avoid including merchant/category labels in the shareable aggregate report."""
    generic = {
        "merchant_spend_increase": "Merchant spending increased",
        "merchant_spend_decrease": "Merchant spending decreased",
        "merchant_frequency_increase": "Merchant transaction frequency increased",
        "merchant_frequency_decrease": "Merchant transaction frequency decreased",
        "merchant_concentration": "Merchant spending concentration observed",
        "recurring_payment_pattern": "Recurring payment pattern observed",
        "price_increase_pattern": "Merchant payment amount increased",
        "duplicate_payment_pattern": "Similar payment timing pattern observed",
        "category_growth": "Category spending increased",
        "category_decline": "Category spending decreased",
    }
    return generic.get(behavior_type, fallback)
