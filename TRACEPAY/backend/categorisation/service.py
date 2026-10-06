"""Orchestrate deterministic → merchant memory → statement map → AI → fallback."""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal

from app.config import settings
from categorisation.ai_classifier import AiTransaction, classify_batch
from categorisation.bank_category_map import map_bank_category
from categorisation.classifier import classify_transaction
from categorisation.constants import FALLBACK_CATEGORY, FALLBACK_CONFIDENCE
from categorisation.merchant_memory import MerchantMemory, fetch_merchant_memory
from categorisation.models import CategorisationResult
from categorisation.normalize import normalize_description, normalize_for_matching
from categorisation.resolve import ensure_complete_classification, resolve_category_name

logger = logging.getLogger("tracepay.categorisation")
BATCH_SIZE = 50


@dataclass(frozen=True)
class CategorisableTransaction:
    transaction_id: str
    description: str
    amount: Decimal
    transaction_type: str
    statement_category: str | None = None
    bank: str | None = None


@dataclass(frozen=True)
class CategorisationMetrics:
    total_transactions: int
    deterministic_matches: int
    merchant_memory_matches: int
    statement_matches: int
    ai_candidates: int
    ai_requests: int
    ai_results: int
    ai_failures: int
    fallback_classifications: int
    unknown_after_ai: int
    high_confidence_classifications: int
    low_confidence_classifications: int
    invalid_ai_results: int
    uncategorised_transactions: int
    categorised_transactions: int


@dataclass
class CategorisationRun:
    results: dict[str, CategorisationResult]
    metrics: CategorisationMetrics


def categorise_batch(
    transactions: list[CategorisableTransaction],
    category_names: list[str] | None = None,
    *,
    access_token: str | None = None,
    merchant_memory: MerchantMemory | None = None,
) -> dict[str, CategorisationResult]:
    return categorise_batch_with_metrics(
        transactions,
        category_names,
        access_token=access_token,
        merchant_memory=merchant_memory,
    ).results


def categorise_batch_with_metrics(
    transactions: list[CategorisableTransaction],
    category_names: list[str] | None = None,
    *,
    access_token: str | None = None,
    merchant_memory: MerchantMemory | None = None,
) -> CategorisationRun:
    catalog = set(category_names or [])
    memory = merchant_memory or fetch_merchant_memory(access_token)
    results: dict[str, CategorisationResult] = {}
    source_by_id: dict[str, str] = {}

    deterministic_matches = 0
    merchant_memory_matches = 0
    statement_matches = 0
    ai_candidates_map: dict[tuple[str, str], AiTransaction] = {}

    for item in transactions:
        deterministic = classify_transaction(item.description, item.transaction_type)
        if deterministic.transaction_class != "unknown" or deterministic.category_name:
            resolved = ensure_complete_classification(
                deterministic,
                catalog,
                merchant_name=deterministic.merchant_name,
            )
            results[item.transaction_id] = resolved
            source_by_id[item.transaction_id] = "deterministic"
            deterministic_matches += 1
            memory.remember(resolved.merchant_name, resolved)
            _log_classification(item.transaction_id, resolved, "deterministic")
            continue

        remembered = memory.get(deterministic.merchant_name) or memory.get(
            normalize_for_matching(item.description)
        )
        if remembered is not None and remembered.category_name not in {None, FALLBACK_CATEGORY}:
            remembered_result = ensure_complete_classification(
                remembered.model_copy(
                    update={
                        "rule": "merchant_memory",
                        "classification_reason": (
                            f"Matched known merchant: {remembered.merchant_name or deterministic.merchant_name}"
                        ),
                        "merchant_name": remembered.merchant_name or deterministic.merchant_name,
                    }
                ),
                catalog,
                merchant_name=deterministic.merchant_name,
            )
            results[item.transaction_id] = remembered_result
            source_by_id[item.transaction_id] = "merchant_memory"
            merchant_memory_matches += 1
            _log_classification(item.transaction_id, remembered_result, "merchant_memory")
            continue

        statement_result = _from_statement_category(item, catalog, deterministic.merchant_name)
        if statement_result is not None:
            results[item.transaction_id] = statement_result
            source_by_id[item.transaction_id] = "statement"
            statement_matches += 1
            if statement_result.classification_confidence >= 0.85:
                memory.remember(statement_result.merchant_name, statement_result)
            _log_classification(item.transaction_id, statement_result, "statement")
            continue

        results[item.transaction_id] = deterministic
        source_by_id[item.transaction_id] = "pending_ai"
        key = (
            normalize_for_matching(item.description) or normalize_description(item.description),
            item.transaction_type,
        )
        ai_candidates_map.setdefault(
            key,
            AiTransaction(item.transaction_id, item.description, str(item.amount), item.transaction_type),
        )

    unknown_items = list(ai_candidates_map.values())
    logger.info(
        "[CATEGORISATION] total_transactions=%s deterministic_matches=%s merchant_memory_matches=%s statement_matches=%s ai_candidates=%s",
        len(transactions),
        deterministic_matches,
        merchant_memory_matches,
        statement_matches,
        len(unknown_items),
    )

    ai_results: dict[str, CategorisationResult] = {}
    ai_requests = 0
    invalid_ai_results = 0
    ai_enabled = settings.ai_categorisation_enabled
    has_provider_key = bool(settings.gemini_api_key.strip() or settings.openai_api_key.strip())

    if not ai_enabled:
        logger.info("[AI] skipped reason=disabled config=AI_CATEGORISATION_ENABLED")
    elif not unknown_items:
        logger.info("[AI] requests=0 reason=no_candidates")
    elif not has_provider_key:
        logger.warning("[AI] requests=0 reason=missing_api_keys expected_env=GEMINI_API_KEY|OPENAI_API_KEY")
    elif not catalog:
        logger.warning("[AI] requests=0 reason=empty_live_category_catalog")
    else:
        for offset in range(0, len(unknown_items), BATCH_SIZE):
            batch = unknown_items[offset : offset + BATCH_SIZE]
            ai_requests += 1
            logger.info("[AI] requests=%s batch_size=%s", ai_requests, len(batch))
            batch_results = classify_batch(batch, sorted(catalog))
            missing = len(batch) - len(batch_results)
            if missing > 0:
                invalid_ai_results += missing
            ai_results.update(batch_results)

    ai_result_by_pattern = {
        (
            normalize_for_matching(candidate.description) or normalize_description(candidate.description),
            candidate.transaction_type,
        ): ai_results[candidate.transaction_id]
        for candidate in unknown_items
        if candidate.transaction_id in ai_results
    }

    fallback_classifications = 0
    for item in transactions:
        current = results[item.transaction_id]
        if source_by_id.get(item.transaction_id) in {"deterministic", "merchant_memory", "statement"}:
            continue

        pattern = (
            normalize_for_matching(item.description) or normalize_description(item.description),
            item.transaction_type,
        )
        ai_result = ai_result_by_pattern.get(pattern)
        if ai_result is not None:
            resolved = ensure_complete_classification(
                ai_result,
                catalog,
                merchant_name=current.merchant_name or ai_result.merchant_name,
            )
            results[item.transaction_id] = resolved
            source_by_id[item.transaction_id] = "ai"
            memory.remember(resolved.merchant_name, resolved)
            _log_classification(item.transaction_id, resolved, "ai")
            continue

        fallback = _fallback_other(current, catalog)
        results[item.transaction_id] = fallback
        source_by_id[item.transaction_id] = "fallback"
        fallback_classifications += 1
        _log_classification(item.transaction_id, fallback, "fallback")

    for transaction_id, result in list(results.items()):
        resolved_name = resolve_category_name(result.category_name, catalog) if catalog else result.category_name
        if resolved_name != result.category_name or result.category_name is None:
            results[transaction_id] = ensure_complete_classification(
                result.model_copy(update={"category_name": resolved_name}),
                catalog,
                merchant_name=result.merchant_name,
            )
        # Never allow high confidence on pure Other fallback.
        final = results[transaction_id]
        if (final.rule or "").startswith("fallback") or (
            final.category_name == FALLBACK_CATEGORY and (final.rule or "").startswith("statement")
        ):
            results[transaction_id] = final.model_copy(
                update={
                    "classification_confidence": min(final.classification_confidence, FALLBACK_CONFIDENCE),
                    "category_confidence": min(final.category_confidence, FALLBACK_CONFIDENCE),
                }
            )

    unknown_after_ai = sum(result.transaction_class == "unknown" for result in results.values())
    uncategorised = sum(result.category_name is None for result in results.values())
    high_confidence = sum(result.classification_confidence >= 0.85 for result in results.values())
    low_confidence = sum(result.classification_confidence < 0.70 for result in results.values())
    ai_applied = sum(source == "ai" for source in source_by_id.values())

    metrics = CategorisationMetrics(
        total_transactions=len(transactions),
        deterministic_matches=deterministic_matches,
        merchant_memory_matches=merchant_memory_matches,
        statement_matches=statement_matches,
        ai_candidates=len(unknown_items),
        ai_requests=ai_requests,
        ai_results=len(ai_results),
        ai_failures=max(0, len(unknown_items) - len(ai_results)),
        fallback_classifications=fallback_classifications,
        unknown_after_ai=unknown_after_ai,
        high_confidence_classifications=high_confidence,
        low_confidence_classifications=low_confidence,
        invalid_ai_results=invalid_ai_results,
        uncategorised_transactions=uncategorised,
        categorised_transactions=len(transactions) - uncategorised,
    )

    by_source = Counter(source_by_id.values())
    logger.info(
        "[CATEGORISATION] summary total=%s deterministic=%s merchant_memory=%s statement=%s ai=%s fallback=%s categorised=%s uncategorised=%s",
        metrics.total_transactions,
        metrics.deterministic_matches,
        metrics.merchant_memory_matches,
        metrics.statement_matches,
        ai_applied,
        metrics.fallback_classifications,
        metrics.categorised_transactions,
        metrics.uncategorised_transactions,
    )
    logger.info(
        "[CATEGORISATION] metrics total_transactions=%s deterministic_matches=%s merchant_memory_matches=%s statement_matches=%s ai_candidates=%s ai_requests=%s ai_results=%s ai_failures=%s fallback_classifications=%s unknown_after_ai=%s high_confidence_classifications=%s low_confidence_classifications=%s invalid_ai_results=%s uncategorised_transactions=%s by_source=%s",
        metrics.total_transactions,
        metrics.deterministic_matches,
        metrics.merchant_memory_matches,
        metrics.statement_matches,
        metrics.ai_candidates,
        metrics.ai_requests,
        metrics.ai_results,
        metrics.ai_failures,
        metrics.fallback_classifications,
        metrics.unknown_after_ai,
        metrics.high_confidence_classifications,
        metrics.low_confidence_classifications,
        metrics.invalid_ai_results,
        metrics.uncategorised_transactions,
        dict(sorted(by_source.items())),
    )
    return CategorisationRun(results=results, metrics=metrics)


def _from_statement_category(
    item: CategorisableTransaction,
    catalog: set[str],
    merchant_name: str | None,
) -> CategorisationResult | None:
    mapped = map_bank_category(item.statement_category, bank=item.bank)
    if mapped is None:
        return None
    if mapped.category_name == FALLBACK_CATEGORY or not mapped.strong and mapped.confidence < 0.75:
        # Weak/generic bank labels are not used as final answers here.
        if mapped.category_name == FALLBACK_CATEGORY:
            return None
    category = resolve_category_name(mapped.category_name, catalog) or mapped.category_name
    if category == FALLBACK_CATEGORY:
        return None
    return ensure_complete_classification(
        CategorisationResult(
            category_name=category,
            category_confidence=mapped.confidence,
            transaction_class=mapped.transaction_class,  # type: ignore[arg-type]
            classification_confidence=mapped.confidence,
            classification_reason=(
                f"Mapped {normalize_description(item.bank) or 'bank'} category "
                f'"{item.statement_category}"'
            ),
            rule="statement:category",
            merchant_name=merchant_name,
        ),
        catalog,
        merchant_name=merchant_name,
    )


def _fallback_other(current: CategorisationResult, catalog: set[str]) -> CategorisationResult:
    return ensure_complete_classification(
        current.model_copy(
            update={
                "category_name": FALLBACK_CATEGORY,
                "category_confidence": FALLBACK_CONFIDENCE,
                "transaction_class": "unknown",
                "classification_confidence": FALLBACK_CONFIDENCE,
                "classification_reason": (
                    "Fallback classification because transaction could not be confidently identified"
                ),
                "rule": "fallback:other",
            }
        ),
        catalog,
        merchant_name=current.merchant_name,
    )


def _log_classification(transaction_id: str, result: CategorisationResult, method: str) -> None:
    logger.info(
        "[CATEGORISATION] classified transaction_id=%s method=%s category=%s class=%s confidence=%s reason=%s",
        transaction_id,
        method,
        result.category_name,
        result.transaction_class,
        result.classification_confidence,
        (result.classification_reason or "")[:120],
    )
