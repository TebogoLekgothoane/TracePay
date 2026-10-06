"""Deterministic transaction classification."""

from __future__ import annotations

from categorisation.models import CategorisationResult
from categorisation.normalize import extract_merchant_name, normalize_description, normalize_for_matching
from categorisation.rules import RULES

# Re-export for callers/tests that imported normalize_description from classifier.
__all__ = ["classify_transaction", "normalize_description", "normalize_for_matching"]


def classify_transaction(
    description: str | None,
    transaction_type: str | None = None,
) -> CategorisationResult:
    normalized = normalize_description(description)
    matching_text = normalize_for_matching(description) or normalized
    kind = (transaction_type or "").lower()
    merchant = extract_merchant_name(description)

    for rule in RULES:
        if rule.matcher(matching_text, kind) or (
            matching_text != normalized and rule.matcher(normalized, kind)
        ):
            return CategorisationResult(
                category_name=rule.category_name or None,
                category_confidence=rule.confidence if rule.category_name else 0,
                classification_confidence=rule.confidence,
                transaction_class=rule.transaction_class,  # type: ignore[arg-type]
                classification_reason=f"Matched deterministic rule: {rule.name}",
                rule=rule.name,
                merchant_name=merchant,
            )
    return CategorisationResult(
        merchant_name=merchant,
        classification_reason=None,
        transaction_class="unknown",
    )
