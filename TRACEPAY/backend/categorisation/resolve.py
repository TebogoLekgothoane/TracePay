"""Resolve and guarantee a usable category for every classification."""

from __future__ import annotations

from categorisation.classifier import classify_transaction
from categorisation.constants import (
    CATEGORY_ALIASES,
    CLASS_DEFAULT_CATEGORY,
    FALLBACK_CATEGORY,
    NON_SPENDING_CATEGORY_NAMES,
    NON_SPENDING_TRANSACTION_CLASSES,
)
from categorisation.models import CategorisationResult
from categorisation.rules import PURCHASE_REVERSAL_RULE


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


def reconcile_with_deterministic_evidence(
    description: str | None,
    transaction_type: str | None,
    result: CategorisationResult,
) -> CategorisationResult:
    """Prefer stronger deterministic transaction types over weak bank or AI spending labels."""
    if (result.rule or "") == PURCHASE_REVERSAL_RULE:
        return result

    deterministic = classify_transaction(description, transaction_type)
    current_class = result.transaction_class or "unknown"

    if deterministic.transaction_class in NON_SPENDING_TRANSACTION_CLASSES:
        if current_class in {"spending", "unknown"} or current_class != deterministic.transaction_class:
            updates: dict[str, object] = {
                "transaction_class": deterministic.transaction_class,
                "classification_confidence": max(
                    result.classification_confidence,
                    deterministic.classification_confidence,
                ),
            }
            if deterministic.category_name:
                updates["category_name"] = deterministic.category_name
                updates["category_confidence"] = max(
                    result.category_confidence,
                    deterministic.category_confidence,
                )
            if deterministic.classification_reason:
                updates["classification_reason"] = (
                    f"{deterministic.classification_reason} (overrides weaker {current_class} label)"
                )[:500]
            if deterministic.rule and not (result.rule or "").startswith("ai:"):
                updates["rule"] = deterministic.rule
            merged = result.model_copy(update=updates)
            if deterministic.merchant_name is None and current_class in {"spending", "unknown"}:
                merged = merged.model_copy(update={"merchant_name": None})
            return merged

    category = (result.category_name or "").strip()
    if current_class == "spending" and category in NON_SPENDING_CATEGORY_NAMES:
        if deterministic.transaction_class in NON_SPENDING_TRANSACTION_CLASSES:
            inferred_class = deterministic.transaction_class
        elif category == "Transfers":
            inferred_class = "person_to_person"
        elif category == "Savings":
            inferred_class = "savings"
        elif category in {"Other Income", "Salary", "Income"}:
            inferred_class = "income"
        elif category == "Bank Fees":
            inferred_class = "bank_fee"
        else:
            inferred_class = None
        if inferred_class:
            return result.model_copy(
                update={
                    "transaction_class": inferred_class,
                    "merchant_name": None,
                    "classification_confidence": min(result.classification_confidence, 0.75),
                    "category_confidence": min(result.category_confidence, 0.75),
                    "classification_reason": (
                        f"Non-spending category {category} cannot remain classified as spending"
                    )[:500],
                }
            )
    return result
