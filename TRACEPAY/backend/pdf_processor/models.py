from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, computed_field


class RawExtraction(BaseModel):
    pages: int
    extraction_method: Literal["text", "table", "ocr", "ai", "unknown"]
    extraction_confidence: float = Field(default=0, ge=0, le=1)
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
    reference: str | None = None

    @computed_field
    @property
    def direction(self) -> Literal["debit", "credit"]:
        return self.type

    @computed_field
    @property
    def balance_after(self) -> Decimal | None:
        return self.balance


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


class StatementBalance(BaseModel):
    amount: Decimal | None = None
    as_of_date: date | None = None
    source: Literal["closing_balance", "running_balance", "unavailable"] = "unavailable"


class ExtractedStatement(BaseModel):
    bank: str | None = None
    account_number_last4: str | None = None
    account_type: str | None = None
    statement_start_date: date | None = None
    statement_end_date: date | None = None
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None
    balance_source: Literal["closing_balance", "running_balance", "unavailable"] = (
        "unavailable"
    )


class ProcessingResult(BaseModel):
    filename: str
    raw_extraction: RawExtraction
    validation: ValidationResult
    transactions: list[Transaction]
    statement: ExtractedStatement = Field(default_factory=ExtractedStatement)
    statement_balance: StatementBalance = Field(
        default_factory=lambda: StatementBalance(),
    )
