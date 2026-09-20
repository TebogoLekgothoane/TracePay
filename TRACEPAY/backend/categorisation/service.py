import logging
from dataclasses import dataclass
from decimal import Decimal

from app.config import settings
from .ai_classifier import AiTransaction, classify_batch
from .classifier import classify_transaction, normalize_description
from .models import CategorisationResult
from .sanitizer import sanitize_for_ai

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
    logger.info(
        "[CATEGORISATION] total_transactions=%s deterministic_matches=%s merchant_memory_matches=%s ai_candidates=%s",
        len(transactions), deterministic_matches, 0, len(unknown_items := list(unknown.values())),
    )
    ai_results: dict[str, CategorisationResult] = {}
    ai_requests = 0
    if not unknown_items:
        logger.info("[AI] requests=0 reason=no_candidates")
    elif not settings.gemini_api_key.strip():
        logger.warning("[AI] requests=0 reason=missing_api_key expected_env=GEMINI_API_KEY")
    elif not category_names:
        logger.warning("[AI] requests=0 reason=empty_live_category_catalog")
    for offset in range(0, len(unknown_items), BATCH_SIZE):
        for candidate in unknown_items[offset : offset + BATCH_SIZE]:
            logger.info("[AI] candidate_collected transaction_id=%s sanitized_example=%s", candidate.transaction_id, sanitize_for_ai(candidate.description)[:80])
        if not settings.gemini_api_key.strip() or not category_names:
            continue
        ai_requests += 1
        logger.info("[AI] requests=%s batch_size=%s", ai_requests, min(BATCH_SIZE, len(unknown_items) - offset))
        ai_results.update(classify_batch(unknown_items[offset : offset + BATCH_SIZE], category_names))

    by_pattern = {
        (normalize_description(item.description), item.transaction_type): ai_results.get(item.transaction_id)
        for item in unknown_items
    }
    for item in transactions:
        if results[item.transaction_id].transaction_class != "unknown":
            continue
        ai_result = by_pattern.get((normalize_description(item.description), item.transaction_type))
        if not ai_result:
            continue
        if ai_result.category_name and ai_result.confidence < 0.70:
            ai_result = ai_result.model_copy(update={"category_name": None, "confidence": 0})
        results[item.transaction_id] = ai_result
    unknown_after_ai = sum(result.transaction_class == "unknown" for result in results.values())
    logger.info(
        "[CATEGORISATION] deterministic_matches=%s merchant_memory_matches=%s ai_candidates=%s ai_requests=%s ai_results=%s ai_failures=%s unknown_after_ai=%s",
        deterministic_matches, 0, len(unknown_items), ai_requests, len(ai_results), len(unknown_items) - len(ai_results), unknown_after_ai,
    )
    return results
