from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class FreezeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    leak_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    transaction_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    consent_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    reason: str = Field(default="User pressed Freeze in dashboard", min_length=1, max_length=1000)

    @model_validator(mode="after")
    def require_freeze_identifier(self) -> "FreezeRequest":
        if not (self.leak_id or self.transaction_id or self.consent_id):
            raise ValueError("Provide at least one of leak_id, transaction_id, consent_id.")
        return self


class FreezeResponse(BaseModel):
    status: Literal["ok"]
    message: str


