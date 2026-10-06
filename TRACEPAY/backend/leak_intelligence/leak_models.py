"""Typed contracts for deterministic potential financial leak detections."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

LeakType = Literal[
    "bank_fee_leak",
    "subscription_leak",
    "recurring_payment_leak",
    "spending_escalation_leak",
    "duplicate_payment_leak",
    "cash_usage_leak",
    "airtime_data_leak",
    "food_spending_leak",
    "transport_spending_leak",
    "unknown_recurring_payment",
]
LeakSeverity = Literal["low", "medium", "high"]
LeakStatus = Literal["active", "monitoring", "resolved", "dismissed"]
ImpactKind = Literal["recurring", "one_time", "estimated"]


class LeakDetection(BaseModel):
    """A deterministic, evidence-backed potential financial leak."""

    leak_id: str = Field(min_length=16, max_length=64)
    fingerprint: str = Field(min_length=16, max_length=64)
    leak_type: LeakType
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=500)
    severity: LeakSeverity
    confidence: float = Field(ge=0, le=1)
    status: LeakStatus = "active"
    estimated_monthly_impact: Decimal = Field(ge=0)
    estimated_annual_impact: Decimal | None = Field(default=None, ge=0)
    impact_kind: ImpactKind
    evidence: dict[str, Any] = Field(default_factory=dict)
    supporting_behavior_ids: list[str] = Field(default_factory=list)
    supporting_feature_references: list[str] = Field(default_factory=list)
    detector_version: str = Field(min_length=1, max_length=32)
    detected_at: datetime
    period_start: date | None = None
    period_end: date | None = None


class LeakDetectionResult(BaseModel):
    """Leak detections for a single user and a single snapshot period."""

    user_id: str
    transaction_count: int
    period_start: date | None = None
    period_end: date | None = None
    detector_version: str
    leaks: list[LeakDetection] = Field(default_factory=list)
