"""Typed contracts for deterministic financial root-cause reasoning."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from .leak_models import ImpactKind

RootCauseType = Literal[
    "frequency_increase",
    "amount_increase",
    "price_increase",
    "recurring_commitment",
    "fee_accumulation",
    "potential_duplicate",
    "behavioural_concentration",
    "merchant_concentration",
    "category_growth",
    "transaction_pattern",
    "insufficient_evidence",
    "unknown",
]
Avoidability = Literal["high", "medium", "low", "unknown"]
Persistence = Literal[
    "new",
    "temporary",
    "persistent",
    "increasing",
    "declining",
    "insufficient_history",
]
AnalysisStatus = Literal[
    "supported",
    "competing_explanations",
    "insufficient_evidence",
    "verification_required",
]


class ImpactAssessment(BaseModel):
    """Impact is observed; avoidability and recovery remain separate hypotheses."""

    detected_amount: Decimal = Field(ge=0)
    detected_annual_amount: Decimal | None = Field(default=None, ge=0)
    impact_kind: ImpactKind
    potentially_avoidable_amount: Decimal | None = Field(default=None, ge=0)
    potentially_avoidable_annual_amount: Decimal | None = Field(default=None, ge=0)
    recoverable_amount: Decimal | None = Field(default=None, ge=0)
    avoidability_confidence: float | None = Field(default=None, ge=0, le=1)
    currency: Literal["ZAR"] = "ZAR"


class FinancialReasoning(BaseModel):
    """One conservative explanation for one detected potential financial leak."""

    reasoning_id: str = Field(min_length=16, max_length=64)
    leak_id: str = Field(min_length=16, max_length=64)
    root_cause_type: RootCauseType
    title: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=1_000)
    confidence: float = Field(ge=0, le=1)
    evidence: dict[str, Any] = Field(default_factory=dict)
    supporting_behavior_ids: list[str] = Field(default_factory=list)
    supporting_feature_references: list[str] = Field(default_factory=list)
    impact_assessment: ImpactAssessment
    avoidability: Avoidability
    persistence: Persistence
    analysis_status: AnalysisStatus
    competing_explanations: list[RootCauseType] = Field(default_factory=list)


class FinancialReasoningResult(BaseModel):
    """User-scoped reasoning output for a single financial snapshot."""

    user_id: str
    transaction_count: int
    period_start: date | None = None
    period_end: date | None = None
    reasoning_version: str
    potential_leaks_analyzed: int
    analyses: list[FinancialReasoning] = Field(default_factory=list)
