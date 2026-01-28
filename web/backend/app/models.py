from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class TransactionIn(BaseModel):
    id: str
    timestamp: str
    amount: float
    currency: str = "ZAR"
    description: str = ""
    merchant: Optional[str] = None
    category: Optional[str] = None
    counterparty: Optional[str] = None
    direction: Optional[Literal["debit", "credit"]] = None
    channel: Optional[str] = None  # e.g. "momo", "bank", "cash"
    meta: Dict[str, Any] = Field(default_factory=dict)


class AnalyzeRequest(BaseModel):
    # Simple and flexible: accept either { "transactions": [...] } or a raw list in the API handler.
    transactions: List[TransactionIn] = Field(default_factory=list)
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


class FreezeRequest(BaseModel):
    leak_id: Optional[str] = None
    transaction_id: Optional[str] = None
    consent_id: Optional[str] = None
    reason: str = "User pressed Freeze in dashboard"


class FreezeResponse(BaseModel):
    status: Literal["ok"]
    message: str


