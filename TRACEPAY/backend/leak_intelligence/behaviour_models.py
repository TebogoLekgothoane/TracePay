"""Contracts for conservative, explainable financial behaviour observations."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

BehaviorType = Literal[
    "spending_increase",
    "spending_decrease",
    "category_growth",
    "category_decline",
    "merchant_frequency_increase",
    "merchant_frequency_decrease",
    "merchant_spend_increase",
    "merchant_spend_decrease",
    "recurring_payment_pattern",
    "weekend_spending_pattern",
    "payday_spending_pattern",
    "cash_dependency",
    "fee_accumulation",
    "subscription_accumulation",
    "merchant_concentration",
    "duplicate_payment_pattern",
    "income_pattern",
    "irregular_income",
    "income_gap",
    "price_increase_pattern",
]
BehaviourSeverity = Literal["low", "medium", "high"]
BehaviourStatus = Literal["active"]


class BehaviourObservation(BaseModel):
    """A neutral, aggregate-only description of an observed behaviour pattern."""

    observation_id: str = Field(min_length=1, max_length=200)
    behavior_type: BehaviorType
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=500)
    severity: BehaviourSeverity
    confidence: float = Field(ge=0, le=1)
    evidence: dict[str, Any] = Field(default_factory=dict)
    supporting_features: list[str] = Field(default_factory=list)
    period_start: date | None = None
    period_end: date | None = None
    status: BehaviourStatus = "active"


class BehaviourAnalysisResult(BaseModel):
    """A complete user-scoped behaviour analysis with no leak decisions."""

    user_id: str
    transaction_count: int
    period_start: date | None = None
    period_end: date | None = None
    observations: list[BehaviourObservation] = Field(default_factory=list)
