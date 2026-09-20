import json
import logging
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from .models import CategorisationResult
from .sanitizer import sanitize_for_ai

logger = logging.getLogger("tracepay.categorisation.ai")


def _safe_http_error_body(error: HTTPError) -> str:
    try:
        body = error.read(2000).decode("utf-8", errors="replace")
    except (OSError, UnicodeError):
        return "<unavailable>"
    body = sanitize_for_ai(body)
    return body.replace("\r", " ").replace("\n", " ")[:1000]


@dataclass(frozen=True)
class AiTransaction:
    transaction_id: str
    description: str
    amount: str
    transaction_type: str


def _response_text(payload: dict) -> str:
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if isinstance(part.get("text"), str):
                return part["text"]
    raise ValueError("AI response did not contain text output")


def classify_batch(transactions: list[AiTransaction], category_names: list[str]) -> dict[str, CategorisationResult]:
    api_key = settings.gemini_api_key.strip()
    model = settings.gemini_model.strip()
    base_url = settings.gemini_base_url.rstrip("/")
    logger.info("[AI] provider=gemini model=%s api_key_loaded=%s category_count=%s candidates=%s", model, bool(api_key), len(category_names), len(transactions))
    if not api_key:
        logger.warning("[AI] skipped reason=missing_gemini_api_key expected_env=GEMINI_API_KEY")
        return {}
    if not transactions:
        logger.info("[AI] skipped reason=no_candidates")
        return {}
    if not category_names:
        logger.warning("[AI] skipped reason=empty_live_category_catalog")
        return {}
    allowed = sorted(set(category_names))
    schema = {
        "type": "OBJECT",
        "properties": {"transactions": {"type": "ARRAY", "items": {
            "type": "OBJECT",
            "properties": {
                "transaction_id": {"type": "STRING"},
                "transaction_class": {"type": "STRING", "enum": ["spending", "income", "internal_transfer", "person_to_person", "savings", "investment", "bank_fee", "unknown"]},
                "category_name": {"type": "STRING"},
                "confidence": {"type": "NUMBER", "minimum": 0, "maximum": 1},
                "reason": {"type": "STRING"},
                "merchant_name": {"type": "STRING"},
            },
            "required": ["transaction_id", "transaction_class", "category_name", "confidence", "reason", "merchant_name"],
        }}},
        "required": ["transactions"],
    }
    prompt_transactions = [
        {"transaction_id": item.transaction_id, "description": sanitize_for_ai(item.description), "amount": item.amount, "type": item.transaction_type}
        for item in transactions
    ]
    instructions = (
        "You categorise bank transactions. First determine transaction_class, then assign category_name only when appropriate. "
        "Use only the supplied categories. Transfers to savings or the user's own accounts are not spending. "
        "Incoming transfers are not automatically income. Person-to-person payments are not automatically shopping. "
        "If evidence is insufficient, return unknown and null category. Never invent information.\n\n"
        f"Allowed categories: {json.dumps(allowed)}\nTransactions: {json.dumps(prompt_transactions)}"
    )
    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": instructions}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema},
    }).encode()
    request_url = f"{base_url}/models/{model}:generateContent"
    safe_debug_body = {
        "contents": [{"role": "user", "parts": [{"text": "<redacted sanitized prompt>"}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema},
    }
    logger.info(
        "[AI] request_debug url=%s headers=%s body=%s",
        request_url,
        {"x-goog-api-key": "<redacted>", "Content-Type": "application/json"},
        json.dumps(safe_debug_body, separators=(",", ":")),
    )
    request = Request(request_url, data=body, headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, method="POST")
    try:
        logger.info("[AI] request_started provider=gemini model=%s candidates=%s", model, len(transactions))
        with urlopen(request, timeout=45) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=gemini model=%s", model)
        parsed = json.loads(_response_text(output))
        logger.info("[AI] structured_json_parsed provider=gemini")
    except HTTPError as error:
        logger.error(
            "[AI] request_failed provider=gemini status=%s reason=%s response_body=%s",
            error.code,
            error.reason,
            _safe_http_error_body(error),
        )
        return {}
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        logger.exception("[AI] request_failed provider=gemini error_type=%s", type(error).__name__)
        return {}

    results: dict[str, CategorisationResult] = {}
    rejected = 0
    allowed_set = set(allowed)
    for item in parsed.get("transactions", []):
        raw_category_name = item.get("category_name") if isinstance(item, dict) else None
        category_name = raw_category_name or None
        if not isinstance(item, dict) or category_name not in allowed_set and category_name is not None:
            rejected += 1
            continue
        try:
            result = CategorisationResult(
                category_name=category_name,
                confidence=float(item.get("confidence", 0)),
                transaction_class=item.get("transaction_class", "unknown"),
                classification_confidence=float(item.get("confidence", 0)),
                classification_reason=str(item.get("reason", ""))[:500],
                merchant_name=item.get("merchant_name") or None,
                rule="ai:gemini",
            )
        except (TypeError, ValueError):
            rejected += 1
            continue
        results[str(item.get("transaction_id"))] = result
    logger.info("[AI] results_received=%s validation_accepted=%s validation_rejected=%s", len(parsed.get("transactions", [])), len(results), rejected)
    return results
