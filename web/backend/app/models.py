from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class TransactionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=255)
    timestamp: str = Field(min_length=1, max_length=64)
    amount: float
    currency: str = Field(default="ZAR", min_length=3, max_length=10)
    description: str = Field(default="", max_length=1000)
    merchant: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    counterparty: Optional[str] = Field(default=None, max_length=255)
    direction: Optional[Literal["debit", "credit"]] = None
    channel: Optional[str] = Field(default=None, max_length=50)  # e.g. "momo", "bank", "cash"
    meta: Dict[str, Any] = Field(default_factory=dict)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactions: List[TransactionIn] = Field(min_length=1, max_length=5000)
    context: Dict[str, Any] = Field(default_factory=dict)


class MoneyLeak(BaseModel):
    id: str
    detector: str
    title: str
    plain_language_reason: str
    severity: Literal["low", "medium", "high"]
    transaction_id: Optional[str] = None
    estimated_monthly_cost: Optional[float] = None
    evidence: Dict[str, Any] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    financial_health_score: int = Field(ge=0, le=100)
    health_band: Literal["green", "yellow", "red"]
    money_leaks: List[MoneyLeak]
    summary_plain_language: str


class TransactionSyncIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str = Field(min_length=1, max_length=128)
    timestamp: datetime
    amount: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="ZAR", min_length=3, max_length=3)
    description: str = Field(default="", max_length=1000)
    merchant: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    counterparty: Optional[str] = Field(default=None, max_length=255)
    direction: Literal["debit", "credit", "reversal"]
    channel: Literal["sms", "demo", "bank", "momo"] = "sms"
    meta: Dict[str, Any] = Field(default_factory=dict)


class TransactionSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactions: List[TransactionSyncIn] = Field(min_length=1, max_length=500)


class LeakResponse(BaseModel):
    id: str
    fi_code: str
    status: Literal["active", "monitoring", "resolved"]
    detected_at: datetime
    resolved_at: Optional[datetime]
    detection_rule: str
    resolution_rule: str
    resolution_checked_at: Optional[datetime]
    evidence: Dict[str, Any]
    resolution_evidence: Optional[Dict[str, Any]]
    merchant: Optional[str]
    amount_monthly: float = Field(ge=0)
    amount_annual: float = Field(ge=0)
    exact_action: str


class TransactionSyncResponse(BaseModel):
    accepted_count: int = Field(ge=0)
    inserted_count: int = Field(ge=0)
    leaks: List[LeakResponse]


