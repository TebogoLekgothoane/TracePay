"""Shared deterministic scoring for potential leak detections."""

from __future__ import annotations

from decimal import Decimal

from .models import ConfidenceSupport

MIN_LEAK_CONFIDENCE = 0.55


def support_ratio(support: ConfidenceSupport | None) -> Decimal:
    if support is None or support.supporting_transaction_count == 0:
        return Decimal("0.80") if support is None else Decimal("0")
    return Decimal(support.high_confidence_transaction_count) / Decimal(
        support.supporting_transaction_count
    )


def leak_confidence(
    *,
    support: ConfidenceSupport | None,
    observation_count: int,
    pattern_strength: Decimal,
    ceiling: Decimal,
) -> float | None:
    """Return a rounded score or None when evidence cannot meet the minimum."""
    ratio = support_ratio(support)
    history = min(Decimal("1"), Decimal(observation_count) / Decimal("10"))
    score = min(
        ceiling,
        Decimal("0.35")
        + Decimal("0.35") * ratio
        + Decimal("0.15") * history
        + Decimal("0.15") * pattern_strength,
    )
    rounded = round(float(score), 2)
    return rounded if rounded >= MIN_LEAK_CONFIDENCE else None


def severity_for_impact(
    monthly_impact: Decimal,
    *,
    persistent: bool,
    confidence: float,
) -> str:
    """Materiality-based severity; confidence does not independently raise severity."""
    if persistent and monthly_impact >= Decimal("1000") and confidence >= 0.70:
        return "high"
    if monthly_impact >= Decimal("200"):
        return "medium"
    return "low"
