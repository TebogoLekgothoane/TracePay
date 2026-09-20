import re

from .models import CategorisationResult
from .rules import RULES


def normalize_description(value: str | None) -> str:
    """Normalize bank descriptions without removing meaningful merchant tokens."""
    text = (value or "").upper().strip()
    text = text.replace("’", "'")
    text = re.sub(r"\s+", " ", text)
    return text


def classify_transaction(description: str | None, transaction_type: str | None = None) -> CategorisationResult:
    normalized = normalize_description(description)
    kind = (transaction_type or "").lower()
    for rule in RULES:
        if rule.matcher(normalized, kind):
            if rule.name == "description:goalsave":
                transaction_class = "internal_transfer"
                category_name = None
            elif rule.name == "description:fixed-deposit":
                transaction_class = "savings"
                category_name = None
            elif rule.name == "description:person-payment":
                transaction_class = "person_to_person"
                category_name = None
            elif rule.name == "description:service-fee":
                transaction_class = "bank_fee"
                category_name = rule.category_name
            elif rule.category_name in {"Salary", "Other Income"}:
                transaction_class = "income"
                category_name = rule.category_name
            else:
                transaction_class = "spending"
                category_name = rule.category_name or None
            return CategorisationResult(
                category_name=category_name,
                confidence=rule.confidence if category_name else 0,
                classification_confidence=rule.confidence,
                transaction_class=transaction_class,
                classification_reason=f"Deterministic rule: {rule.name}",
                rule=rule.name,
            )
    return CategorisationResult()
