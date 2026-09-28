import logging
from dataclasses import dataclass
from decimal import Decimal
from collections import Counter

from app.config import settings
from .ai_classifier import AiTransaction, classify_batch
from .classifier import classify_transaction, normalize_description
from .models import CategorisationResult

logger = logging.getLogger("tracepay.categorisation")
BATCH_SIZE = 50


@dataclass(frozen=True)
class CategorisableTransaction:
    transaction_id: str
    description: str
    amount: Decimal
    transaction_type: str


def categorise_batch(transactions: list[CategorisableTransaction], category_names: list[str] | None = None) -> dict[str, CategorisationResult]:
    results: dict[str, CategorisationResult] = {}
    unknown: dict[tuple[str, str], AiTransaction] = {}
    for item in transactions:
        result = classify_transaction(item.description, item.transaction_type)
        results[item.transaction_id] = result
        if result.transaction_class == "unknown":
            key = (normalize_description(item.description), item.transaction_type)
            unknown.setdefault(key, AiTransaction(item.transaction_id, item.description, str(item.amount), item.transaction_type))

    deterministic_matches = sum(result.transaction_class != "unknown" for result in results.values())
    unknown_items = list(unknown.values())
    logger.info(
        "[CATEGORISATION] total_transactions=%s deterministic_matches=%s ai_candidates=%s",
        len(transactions), deterministic_matches, len(unknown_items),
    )
    ai_results: dict[str, CategorisationResult] = {}
    ai_requests = 0
    ai_enabled = settings.ai_categorisation_enabled
    has_provider_key = bool(settings.gemini_api_key.strip() or settings.openrouter_api_key.strip())
    if not ai_enabled:
        logger.info("[AI] skipped reason=disabled config=AI_CATEGORISATION_ENABLED")
    elif not unknown_items:
        logger.info("[AI] requests=0 reason=no_candidates")
    elif not has_provider_key:
        logger.warning("[AI] requests=0 reason=missing_api_keys expected_env=GEMINI_API_KEY,OPENROUTER_API_KEY")
    elif not category_names:
        logger.warning("[AI] requests=0 reason=empty_live_category_catalog")
    else:
        for offset in range(0, len(unknown_items), BATCH_SIZE):
            batch = unknown_items[offset : offset + BATCH_SIZE]
            ai_requests += 1
            logger.info("[AI] requests=%s batch_size=%s", ai_requests, len(batch))
            ai_results.update(classify_batch(batch, category_names))

    ai_result_by_pattern = {
        (normalize_description(candidate.description), candidate.transaction_type): ai_results[candidate.transaction_id]
        for candidate in unknown_items
        if candidate.transaction_id in ai_results
    }
    for item in transactions:
        if results[item.transaction_id].transaction_class != "unknown":
            continue
        ai_result = ai_result_by_pattern.get((normalize_description(item.description), item.transaction_type))
        if not ai_result:
            continue
        results[item.transaction_id] = ai_result
    unknown_after_ai = sum(result.transaction_class == "unknown" for result in results.values())
    ai_classified = sum(result.transaction_class != "unknown" for result in ai_results.values())
    ai_categorised = sum(result.category_name is not None for result in ai_results.values())
    ai_low_confidence_categories = sum(
        result.category_name is not None and result.category_confidence < 0.70
        for result in ai_results.values()
    )
    ai_unknown = sum(result.transaction_class == "unknown" for result in ai_results.values())
    uncategorised_after_ai = sum(result.category_name is None for result in results.values())
    uncategorised_items = [
        (item, results[item.transaction_id])
        for item in transactions
        if results[item.transaction_id].category_name is None
    ]
    uncategorised_by_class = Counter(result.transaction_class for _, result in uncategorised_items)
    uncategorised_by_rule = Counter(result.rule or "none" for _, result in uncategorised_items)
    placeholder_descriptions = sum(
        normalize_description(item.description) in {"", "-"}
        for item, _ in uncategorised_items
    )
    logger.info(
        "[CATEGORISATION] uncategorised_breakdown total=%s by_class=%s by_rule=%s placeholder_descriptions=%s",
        len(uncategorised_items), dict(sorted(uncategorised_by_class.items())),
        dict(sorted(uncategorised_by_rule.items())), placeholder_descriptions,
    )
    logger.info(
        "[CATEGORISATION] deterministic_matches=%s ai_candidates=%s ai_requests=%s ai_results=%s ai_failures=%s ai_classified=%s ai_categorised=%s ai_low_confidence_categories=%s ai_unknown=%s unknown_after_ai=%s uncategorised_after_ai=%s",
        deterministic_matches, len(unknown_items), ai_requests, len(ai_results), len(unknown_items) - len(ai_results),
        ai_classified, ai_categorised, ai_low_confidence_categories, ai_unknown, unknown_after_ai, uncategorised_after_ai,
    )
    return results
