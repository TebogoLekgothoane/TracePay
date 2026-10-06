"""Resolve and guarantee a usable category for every classification."""

from __future__ import annotations

from categorisation.constants import (
    CATEGORY_ALIASES,
    CLASS_DEFAULT_CATEGORY,
    FALLBACK_CATEGORY,
)
from categorisation.models import CategorisationResult


def resolve_category_name(name: str | None, catalog: set[str] | None = None) -> str | None:
    """Map free-text / alias category names onto the live catalog when possible."""
    if not name or not str(name).strip():
        return None
    raw = str(name).strip()
    alias = CATEGORY_ALIASES.get(raw.casefold())
    candidates = [alias, raw] if alias else [raw]
    if not catalog:
        return candidates[0]
    by_fold = {item.casefold(): item for item in catalog}
    for candidate in candidates:
        if not candidate:
            continue
        matched = by_fold.get(candidate.casefold())
        if matched:
            return matched
    return None


def ensure_complete_classification(
    result: CategorisationResult,
    catalog: set[str] | None = None,
    *,
    merchant_name: str | None = None,
) -> CategorisationResult:
    """Guarantee category + class + confidence + reason on every result."""
    catalog_set = set(catalog or [])
    if FALLBACK_CATEGORY and FALLBACK_CATEGORY not in catalog_set and not catalog_set:
        catalog_set.add(FALLBACK_CATEGORY)

    category = resolve_category_name(result.category_name, catalog_set)
    transaction_class = result.transaction_class or "unknown"
    reason = result.classification_reason
    rule = result.rule
    confidence = result.classification_confidence
    category_confidence = result.category_confidence

    if category is None:
        default_name = CLASS_DEFAULT_CATEGORY.get(transaction_class, FALLBACK_CATEGORY)
        category = resolve_category_name(default_name, catalog_set) or FALLBACK_CATEGORY
        if not reason:
            reason = (
                f"Default category for {transaction_class}"
                if transaction_class != "unknown"
                else "Fallback classification because transaction could not be confidently identified"
            )
        if not rule:
            rule = "fallback:class_default" if transaction_class != "unknown" else "fallback:other"
        if confidence <= 0:
            confidence = 0.55 if transaction_class != "unknown" else 0.35
        if category_confidence <= 0:
            category_confidence = confidence

    if not reason:
        reason = f"Classified as {category}"
    if confidence <= 0:
        confidence = max(category_confidence, 0.5)
    if category_confidence <= 0 and category:
        category_confidence = confidence

    return result.model_copy(
        update={
            "category_name": category,
            "category_confidence": round(min(1.0, max(0.0, category_confidence)), 3),
            "transaction_class": transaction_class,
            "classification_confidence": round(min(1.0, max(0.0, confidence)), 3),
            "classification_reason": reason[:500],
            "rule": rule,
            "merchant_name": result.merchant_name or merchant_name,
        }
    )
