import json
import logging
import time
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


def _gemini_response_text(payload: dict) -> str:
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if isinstance(part.get("text"), str):
                return part["text"]
    raise ValueError("AI response did not contain text output")


def _category_schema(type_case: str = "upper") -> dict:
    def value(name: str) -> str:
        return name.upper() if type_case == "upper" else name

    schema = {
        "type": value("object"),
        "properties": {"transactions": {"type": value("array"), "items": {
            "type": value("object"),
            "properties": {
                "transaction_id": {"type": value("string")},
                "transaction_class": {"type": value("string"), "enum": ["spending", "income", "internal_transfer", "person_to_person", "savings", "investment", "bank_fee", "unknown"]},
                "classification_confidence": {"type": value("number"), "minimum": 0, "maximum": 1},
                "category_name": {"type": value("string")},
                "category_confidence": {"type": value("number"), "minimum": 0, "maximum": 1},
                "reason": {"type": value("string")},
                "merchant_name": {"type": value("string")},
            },
            "required": ["transaction_id", "transaction_class", "classification_confidence", "category_name", "category_confidence", "reason", "merchant_name"],
        }}},
        "required": ["transactions"],
    }
    if type_case == "lower":
        schema["additionalProperties"] = False
        schema["properties"]["transactions"]["items"]["additionalProperties"] = False
    return schema


def _validate_results(parsed: dict, allowed: set[str], provider: str) -> dict[str, CategorisationResult]:
    results: dict[str, CategorisationResult] = {}
    rejected = 0
    items = parsed.get("transactions", [])
    for item in items:
        raw_category_name = item.get("category_name") if isinstance(item, dict) else None
        category_name = raw_category_name or None
        if not isinstance(item, dict) or category_name not in allowed and category_name is not None:
            rejected += 1
            continue
        try:
            result = CategorisationResult(
                category_name=category_name,
                category_confidence=float(item.get("category_confidence", 0)) if category_name else 0,
                transaction_class=item.get("transaction_class", "unknown"),
                classification_confidence=float(item.get("classification_confidence", 0)),
                classification_reason=str(item.get("reason", ""))[:500],
                merchant_name=item.get("merchant_name") or None,
                rule=f"ai:{provider}",
            )
        except (TypeError, ValueError):
            rejected += 1
            continue
        results[str(item.get("transaction_id"))] = result
    logger.info("[AI] results_received=%s validation_accepted=%s validation_rejected=%s ai_invalid_results=%s provider=%s", len(items), len(results), rejected, rejected, provider)
    return results


def _request_gemini(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    api_key = settings.gemini_api_key.strip()
    if not api_key:
        logger.info("[AI] provider=gemini skipped reason=missing_api_key expected_env=GEMINI_API_KEY")
        return None
    model = settings.gemini_model.strip()
    base_url = settings.gemini_base_url.rstrip("/")
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
        "[AI] request_debug provider=gemini url=%s headers=%s body=%s",
        request_url,
        {"x-goog-api-key": "<redacted>", "Content-Type": "application/json"},
        json.dumps(safe_debug_body, separators=(",", ":")),
    )
    request = Request(request_url, data=body, headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, method="POST")
    try:
        logger.info("[AI] request_started provider=gemini model=%s candidates=%s", model, transactions_count)
        with urlopen(request, timeout=45) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=gemini model=%s", model)
        return output
    except HTTPError as error:
        logger.error(
            "[AI] request_failed provider=gemini status=%s reason=%s response_body=%s",
            error.code,
            error.reason,
            _safe_http_error_body(error),
        )
        return None
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        logger.exception("[AI] request_failed provider=gemini error_type=%s", type(error).__name__)
        return None


def _openrouter_response_text(payload: dict) -> str:
    top_level_keys = sorted(payload.keys()) if isinstance(payload, dict) else []
    choices = payload.get("choices") if isinstance(payload, dict) else None
    choices_count = len(choices) if isinstance(choices, list) else 0
    content: object = None
    if choices_count:
        first_choice = choices[0]
        message = first_choice.get("message") if isinstance(first_choice, dict) else None
        content = message.get("content") if isinstance(message, dict) else None

    if isinstance(content, list):
        text_parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ]
        content = "".join(text_parts)
    elif content is not None and not isinstance(content, str):
        content = str(content)

    content_text = content.strip() if isinstance(content, str) else ""
    logger.info(
        "[AI] openrouter_response_shape top_level_keys=%s choices_count=%s content_type=%s content_length=%s content_empty=%s",
        top_level_keys,
        choices_count,
        type(content).__name__ if content is not None else "null",
        len(content_text),
        not bool(content_text),
    )
    if not content_text:
        raise ValueError("OpenRouter response contained empty text output")

    if content_text.startswith("```") and content_text.endswith("```"):
        first_newline = content_text.find("\n")
        if first_newline >= 0:
            content_text = content_text[first_newline + 1 : -3].strip()
        else:
            content_text = content_text[3:-3].strip()
    if content_text.lower().startswith("json"):
        content_text = content_text[4:].lstrip()
    return content_text


def _request_openrouter(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    api_key = settings.openrouter_api_key.strip()
    if not api_key:
        logger.warning("[AI] provider=openrouter skipped reason=missing_api_key expected_env=OPENROUTER_API_KEY")
        return None
    model = settings.openrouter_model.strip()
    request_url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": instructions}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "transaction_categories", "schema": schema, "strict": True}},
    }).encode()
    request = Request(request_url, data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
    logger.info("[AI] request_debug provider=openrouter url=%s headers=%s body=<redacted sanitized prompt> response_format=json_schema schema=%s", request_url, {"Authorization": "<redacted>", "Content-Type": "application/json"}, json.dumps(schema, separators=(",", ":")))
    started = time.perf_counter()
    try:
        logger.info("[AI] request_started provider=openrouter model=%s candidates=%s", model, transactions_count)
        logger.info("[AI] openrouter_requests=1")
        with urlopen(request, timeout=settings.openrouter_timeout_seconds) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=openrouter model=%s", model)
        return output
    except HTTPError as error:
        logger.error("[AI] request_failed provider=openrouter status=%s reason=%s response_body=%s", error.code, error.reason, _safe_http_error_body(error))
    except TimeoutError as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.error(
            "[AI] request_timeout provider=openrouter timeout_seconds=%s error_type=%s duration_ms=%s",
            settings.openrouter_timeout_seconds,
            type(error).__name__,
            duration_ms,
        )
    except (URLError, ValueError, json.JSONDecodeError) as error:
        logger.exception("[AI] request_failed provider=openrouter error_type=%s", type(error).__name__)
    logger.info("[AI] openrouter_failures=1")
    return None


def classify_batch(transactions: list[AiTransaction], category_names: list[str]) -> dict[str, CategorisationResult]:
    logger.info("[AI] providers=gemini_then_openrouter gemini_key_loaded=%s openrouter_key_loaded=%s category_count=%s candidates=%s", bool(settings.gemini_api_key.strip()), bool(settings.openrouter_api_key.strip()), len(category_names), len(transactions))
    if not transactions:
        logger.info("[AI] skipped reason=no_candidates")
        return {}
    if not category_names:
        logger.warning("[AI] skipped reason=empty_live_category_catalog")
        return {}
    allowed = sorted(set(category_names))
    instructions = (
        "You categorise bank transactions. First determine transaction_class, then assign category_name only when appropriate. "
        "Use only the supplied categories. Transfers to savings or the user's own accounts are not spending. "
        "Incoming transfers are not automatically income. Person-to-person payments are not automatically shopping. "
        "Use transaction_class=unknown and category_name=\"\" when evidence is insufficient. Never invent information.\n\n"
        "Money moved between the user's own accounts is internal_transfer. Money sent to another person is person_to_person. "
        "Money received from another person is not automatically income. Fixed deposit contributions are savings. "
        "Savings and investment transfers are not spending. Merchant purchases are spending. Salary is income. "
        "Bank charges are bank_fee. Do not assume every PayShap transaction is an internal transfer, every incoming transaction is income, "
        "or every person-to-person payment is shopping.\n\n"
        f"Allowed categories: {json.dumps(allowed)}\nTransactions: {json.dumps([{ 'transaction_id': item.transaction_id, 'description': sanitize_for_ai(item.description), 'amount': item.amount, 'type': item.transaction_type } for item in transactions])}"
    )
    gemini_output = _request_gemini(instructions, _category_schema("upper"), len(transactions))
    if gemini_output is not None:
        try:
            results = _validate_results(json.loads(_gemini_response_text(gemini_output)), set(allowed), "gemini")
            logger.info("[AI] structured_json_parsed provider=gemini")
            if results:
                return results
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            logger.exception("[AI] response_parse_failed provider=gemini error_type=%s", type(error).__name__)
    logger.info("[AI] fallback_started from_provider=gemini to_provider=openrouter")
    openrouter_output = _request_openrouter(instructions, _category_schema("lower"), len(transactions))
    if openrouter_output is None:
        return {}
    try:
        results = _validate_results(json.loads(_openrouter_response_text(openrouter_output)), set(allowed), "openrouter")
        logger.info("[AI] structured_json_parsed provider=openrouter")
        logger.info("[AI] openrouter_results=%s openrouter_failures=0", len(results))
        return results
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        logger.exception("[AI] response_parse_failed provider=openrouter error_type=%s", type(error).__name__)
        logger.info("[AI] openrouter_results=0 openrouter_failures=1")
        return {}
