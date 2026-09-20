from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class RawExtraction(BaseModel):
    pages: int
    extraction_method: Literal["text", "table", "ocr", "unknown"]
    raw_text_available: bool
    useful_text_characters: int
    tables_found: int
    rows_found: int


class Transaction(BaseModel):
    date: date
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal
    type: Literal["debit", "credit"]
    balance: Decimal | None = None
    currency: str | None = None
    source: Literal["pdf"] = "pdf"
    source_row: int
    confidence: Literal["high", "medium", "low"]
    category_name: str | None = None
    category_confidence: float = Field(default=0, ge=0, le=1)
    category_rule: str | None = None
    transaction_class: Literal[
        "spending", "income", "internal_transfer", "person_to_person",
        "savings", "investment", "bank_fee", "unknown"
    ] = "unknown"
    classification_confidence: float = Field(default=0, ge=0, le=1)
    classification_reason: str | None = None
    merchant_name: str | None = None


class ValidationResult(BaseModel):
    status: Literal["valid", "warning", "failed"]
    confidence: float = Field(ge=0, le=1)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    transaction_count: int
    rows_detected: int = 0
    rows_rejected: int = 0
    duplicate_count: int = 0
    balance_reconciliation: Literal["verified", "not_available", "mismatch"] = "not_available"


class ProcessingResult(BaseModel):
    filename: str
    raw_extraction: RawExtraction
    validation: ValidationResult
    transactions: list[Transaction]
