"""Typed contracts for deterministic recommendation and action output."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from .reasoning_models import RootCauseType

RecommendationType = Literal[
    "review_bank_fees",
    "review_recurring_payment",
    "review_high_frequency_spending",
    "review_airtime_data_usage",
    "verify_potential_duplicate",
    "monitor_spending_pattern",
]
Priority = Literal["high", "medium", "low"]
FindingScope = Literal[
    "overall_pattern",
    "contributing_category",
    "one_time_recovery_candidate",
    "standalone",
]
ImpactLabel = Literal[
    "detected_increase",
    "observed_fee_activity",
    "observed_recurring_payment",
    "potential_recovery_candidate",
]


class Recommendation(BaseModel):
    """One non-automated next step derived from a single reasoning analysis."""

    recommendation_id: str = Field(min_length=16, max_length=64)
    recommendation_type: RecommendationType
    title: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=1_200)
    recommended_action: str = Field(min_length=1, max_length=1_000)
    priority: Priority
    recommendation_confidence: float = Field(ge=0, le=1)
    source_reasoning_id: str = Field(min_length=16, max_length=64)
    source_root_cause_type: RootCauseType
    evidence_references: list[str] = Field(default_factory=list)
    finding_scope: FindingScope
    impact_label: ImpactLabel | None = None
    potential_recovery_amount: Decimal | None = Field(default=None, ge=0)
    supported_impact_amount: Decimal | None = Field(default=None, ge=0)
    expected_savings_amount: Decimal | None = Field(default=None, ge=0)
    currency: Literal["ZAR"] = "ZAR"


class RecommendationMetadata(BaseModel):
    """Report-level constraints that keep overlapping amounts from being summed."""

    automated_actions: Literal["none"] = "none"
    savings_policy: Literal["only_when_directly_supported"] = (
        "only_when_directly_supported"
    )
    amounts_are_additive: Literal[False] = False
    overlap_note: str | None = None


class FinancialRecommendationResult(BaseModel):
    """User-scoped recommendations for one financial reasoning result."""

    user_id: str
    period_start: date | None = None
    period_end: date | None = None
    reasoning_version: str
    recommendation_version: str
    recommendation_count: int = Field(ge=0)
    recommendations: list[Recommendation] = Field(default_factory=list)
    metadata: RecommendationMetadata
