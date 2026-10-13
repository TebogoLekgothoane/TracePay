"""Deterministic transaction classification."""

from __future__ import annotations

from categorisation.models import CategorisationResult
from categorisation.normalize import normalize_description, normalize_for_matching
from categorisation.rules import RULES
from categorisation.source_identity import identify_source

# Re-export for callers/tests that imported normalize_description from classifier.
__all__ = ["classify_transaction", "normalize_description", "normalize_for_matching"]


def classify_transaction(
    description: str | None,
    transaction_type: str | None = None,
) -> CategorisationResult:
    normalized = normalize_description(description)
    matching_text = normalize_for_matching(description) or normalized
    kind = (transaction_type or "").lower()
    identity = identify_source(description)
    # Only confirmed merchant identities may populate merchant_name.
    merchant = identity.merchant_name if identity.source_type == "merchant" else None

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

    # Identity can still classify transfers/people when no named rule matched.
    if identity.transaction_type_hint == "person_to_person":
        return CategorisationResult(
            category_name="Transfers",
            category_confidence=0.90,
            classification_confidence=0.90,
            transaction_class="person_to_person",
            classification_reason="Matched person-to-person source identity",
            rule="identity:person_to_person",
            merchant_name=None,
        )
    if identity.transaction_type_hint == "internal_transfer":
        return CategorisationResult(
            category_name="Transfers",
            category_confidence=0.90,
            classification_confidence=0.90,
            transaction_class="internal_transfer",
            classification_reason="Matched internal-transfer source identity",
            rule="identity:internal_transfer",
            merchant_name=None,
        )

    return CategorisationResult(
        merchant_name=merchant,
        classification_reason=None,
        transaction_class="unknown",
    )
