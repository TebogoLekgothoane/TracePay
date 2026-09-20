from typing import Literal

from pydantic import BaseModel, Field


class CategorisationResult(BaseModel):
    category_name: str | None = None
    confidence: float = Field(default=0, ge=0, le=1)
    category_source: Literal["automatic"] = "automatic"
    rule: str | None = None
    transaction_class: Literal[
        "spending", "income", "internal_transfer", "person_to_person",
        "savings", "investment", "bank_fee", "unknown"
    ] = "unknown"
    classification_confidence: float = Field(default=0, ge=0, le=1)
    classification_reason: str | None = None
    merchant_name: str | None = None
