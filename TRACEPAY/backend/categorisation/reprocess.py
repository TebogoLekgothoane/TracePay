"""Safe reprocessing of existing transactions through the categorisation pipeline."""

from __future__ import annotations

from decimal import Decimal

from categorisation.merchant_memory import MerchantMemory
from categorisation.models import CategorisationResult
from categorisation.service import (
    CategorisableTransaction,
    CategorisationMetrics,
    CategorisationRun,
    categorise_batch_with_metrics,
)


def reprocess_transactions(
    transactions: list[CategorisableTransaction],
    category_names: list[str] | None = None,
    *,
    access_token: str | None = None,
    merchant_memory: MerchantMemory | None = None,
) -> CategorisationRun:
    """Re-run categorisation. Idempotent: does not create transactions, only classifications."""
    return categorise_batch_with_metrics(
        transactions,
        category_names,
        access_token=access_token,
        merchant_memory=merchant_memory,
    )


def classification_update_payload(
    results: dict[str, CategorisationResult],
) -> list[dict[str, object]]:
    """Shape classifications for a client-side UPDATE of existing transaction rows."""
    rows: list[dict[str, object]] = []
    for transaction_id, result in results.items():
        rows.append(
            {
                "id": transaction_id,
                "category_name": result.category_name,
                "category_confidence": result.category_confidence,
                "category_rule": result.rule,
                "category_source": result.category_source,
                "transaction_class": result.transaction_class,
                "classification_confidence": result.classification_confidence,
                "classification_reason": result.classification_reason,
                "merchant_name": result.merchant_name,
            }
        )
    return rows


def metrics_dict(metrics: CategorisationMetrics) -> dict[str, int]:
    return {
        "total_transactions": metrics.total_transactions,
        "deterministic_matches": metrics.deterministic_matches,
        "merchant_memory_matches": metrics.merchant_memory_matches,
        "statement_matches": metrics.statement_matches,
        "ai_candidates": metrics.ai_candidates,
        "ai_requests": metrics.ai_requests,
        "ai_results": metrics.ai_results,
        "ai_failures": metrics.ai_failures,
        "fallback_classifications": metrics.fallback_classifications,
        "unknown_after_ai": metrics.unknown_after_ai,
        "high_confidence_classifications": metrics.high_confidence_classifications,
        "low_confidence_classifications": metrics.low_confidence_classifications,
        "invalid_ai_results": metrics.invalid_ai_results,
        "uncategorised_transactions": metrics.uncategorised_transactions,
        "categorised_transactions": metrics.categorised_transactions,
    }


def as_categorisable(
    transaction_id: str,
    description: str,
    amount: Decimal | float | int | str,
    transaction_type: str,
    statement_category: str | None = None,
    bank: str | None = None,
) -> CategorisableTransaction:
    return CategorisableTransaction(
        transaction_id=str(transaction_id),
        description=description,
        amount=Decimal(str(amount)),
        transaction_type=transaction_type,
        statement_category=statement_category,
        bank=bank,
    )
