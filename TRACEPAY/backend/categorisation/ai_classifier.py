"""AI categorisation fallback with Gemini (preferred) and OpenAI."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from categorisation.models import CategorisationResult
from categorisation.resolve import resolve_category_name
from categorisation.sanitizer import sanitize_for_ai

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


def _category_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "transactions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "transaction_id": {"type": "string"},
                        "transaction_class": {
                            "type": "string",
                            "enum": [
                                "spending",
                                "income",
                                "internal_transfer",
                                "person_to_person",
                                "savings",
                                "investment",
                                "bank_fee",
                                "unknown",
                            ],
                        },
                        "classification_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "category_name": {"type": "string"},
                        "category_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "reason": {"type": "string"},
                        "merchant_name": {"type": "string"},
                    },
                    "required": [
                        "transaction_id",
                        "transaction_class",
                        "classification_confidence",
                        "category_name",
                        "category_confidence",
                        "reason",
                        "merchant_name",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["transactions"],
        "additionalProperties": False,
    }


def _gemini_category_schema() -> dict:
    """Gemini rejects additionalProperties and prefers uppercase type names."""
    return {
        "type": "OBJECT",
        "properties": {
            "transactions": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "transaction_id": {"type": "STRING"},
                        "transaction_class": {
                            "type": "STRING",
                            "enum": [
                                "spending",
                                "income",
                                "internal_transfer",
                                "person_to_person",
                                "savings",
                                "investment",
                                "bank_fee",
                                "unknown",
                            ],
                        },
                        "classification_confidence": {"type": "NUMBER"},
                        "category_name": {"type": "STRING"},
                        "category_confidence": {"type": "NUMBER"},
                        "reason": {"type": "STRING"},
                        "merchant_name": {"type": "STRING"},
                    },
                    "required": [
                        "transaction_id",
                        "transaction_class",
                        "classification_confidence",
                        "category_name",
                        "category_confidence",
                        "reason",
                        "merchant_name",
                    ],
                },
            },
        },
        "required": ["transactions"],
    }


def _validate_results(
    parsed: dict,
    allowed: set[str],
    provider: str,
    expected_ids: set[str],
) -> tuple[dict[str, CategorisationResult], int]:
    results: dict[str, CategorisationResult] = {}
    rejected = 0
    items = parsed.get("transactions", [])
    if not isinstance(items, list):
        return {}, 0
    for item in items:
        if not isinstance(item, dict):
            rejected += 1
            continue
        transaction_id = str(item.get("transaction_id", "")).strip()
        if not transaction_id or (expected_ids and transaction_id not in expected_ids):
            rejected += 1
            continue
        raw_category = item.get("category_name")
        category_name = resolve_category_name(
            raw_category if isinstance(raw_category, str) else None,
            allowed,
        )
        # Empty / unknown category from the model is allowed; service applies fallback later.
        if isinstance(raw_category, str) and raw_category.strip() and category_name is None:
            rejected += 1
            continue
        try:
            transaction_class = item.get("transaction_class", "unknown")
            result = CategorisationResult(
                category_name=category_name,
                category_confidence=float(item.get("category_confidence", 0)) if category_name else 0,
                transaction_class=transaction_class,
                classification_confidence=float(item.get("classification_confidence", 0)),
                classification_reason=(
                    str(item.get("reason", ""))[:500]
                    or "Classified by AI based on transaction description"
                ),
                merchant_name=item.get("merchant_name") or None,
                rule=f"ai:{provider}",
            )
        except (TypeError, ValueError):
            rejected += 1
            continue
        results[transaction_id] = result
    logger.info(
        "[AI] results_received=%s validation_accepted=%s validation_rejected=%s provider=%s",
        len(items),
        len(results),
        rejected,
        provider,
    )
    return results, rejected


def _chat_response_text(payload: dict, provider: str) -> str:
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
        "[AI] %s_response_shape top_level_keys=%s choices_count=%s content_type=%s content_length=%s content_empty=%s",
        provider,
        top_level_keys,
        choices_count,
        type(content).__name__ if content is not None else "null",
        len(content_text),
        not bool(content_text),
    )
    if not content_text:
        raise ValueError(f"{provider} response contained empty text output")
    return _strip_code_fence(content_text)


def _gemini_response_text(payload: dict) -> str:
    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("gemini response contained no candidates")
    parts = (
        candidates[0].get("content", {}).get("parts", [])
        if isinstance(candidates[0], dict)
        else []
    )
    texts = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]
    content_text = "".join(texts).strip()
    logger.info(
        "[AI] gemini_response_shape candidates=%s content_length=%s content_empty=%s",
        len(candidates),
        len(content_text),
        not bool(content_text),
    )
    if not content_text:
        raise ValueError("gemini response contained empty text output")
    return _strip_code_fence(content_text)


def _strip_code_fence(content_text: str) -> str:
    if content_text.startswith("```") and content_text.endswith("```"):
        first_newline = content_text.find("\n")
        if first_newline >= 0:
            content_text = content_text[first_newline + 1 : -3].strip()
        else:
            content_text = content_text[3:-3].strip()
    if content_text.lower().startswith("json"):
        content_text = content_text[4:].lstrip()
    return content_text


def _openai_response_text(payload: dict) -> str:
    return _chat_response_text(payload, "openai")


def _gemini_model_candidates() -> list[str]:
    primary = settings.gemini_model.strip()
    extras = [
        item.strip()
        for item in settings.gemini_fallback_models.split(",")
        if item.strip()
    ]
    ordered: list[str] = []
    for model in [primary, *extras]:
        if model and model not in ordered:
            ordered.append(model)
    return ordered


def _request_gemini(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    api_key = settings.gemini_api_key.strip()
    if not api_key:
        logger.info("[AI] provider=gemini skipped reason=missing_api_key expected_env=GEMINI_API_KEY")
        return None
    base_url = settings.gemini_base_url.rstrip("/")
    gemini_schema = _gemini_category_schema()
    for model in _gemini_model_candidates():
        body = json.dumps(
            {
                "contents": [{"role": "user", "parts": [{"text": instructions}]}],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                    "responseSchema": gemini_schema,
                },
            }
        ).encode()
        request = Request(
            f"{base_url}/models/{model}:generateContent",
            data=body,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            method="POST",
        )
        logger.info(
            "[AI] request_started provider=gemini model=%s candidates=%s",
            model,
            transactions_count,
        )
        started = time.perf_counter()
        try:
            with urlopen(request, timeout=settings.openai_timeout_seconds) as response:
                output = json.loads(response.read().decode("utf-8"))
            logger.info("[AI] request_success provider=gemini model=%s", model)
            return output
        except HTTPError as error:
            logger.error(
                "[AI] request_failed provider=gemini model=%s status=%s reason=%s response_body=%s",
                model,
                error.code,
                error.reason,
                _safe_http_error_body(error),
            )
            if error.code not in {429, 500, 503, 404}:
                return None
        except TimeoutError as error:
            duration_ms = round((time.perf_counter() - started) * 1000, 1)
            logger.error(
                "[AI] request_timeout provider=gemini timeout_seconds=%s error_type=%s duration_ms=%s",
                settings.openai_timeout_seconds,
                type(error).__name__,
                duration_ms,
            )
        except (URLError, ValueError, json.JSONDecodeError) as error:
            logger.exception(
                "[AI] request_failed provider=gemini model=%s error_type=%s",
                model,
                type(error).__name__,
            )
    return None


def _request_openai(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    api_key = settings.openai_api_key.strip()
    if not api_key:
        logger.info("[AI] provider=openai skipped reason=missing_api_key expected_env=OPENAI_API_KEY")
        return None
    model = settings.openai_model.strip() or "gpt-4.1-mini"
    request_url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "messages": [{"role": "user", "content": instructions}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "transaction_categories",
                    "schema": schema,
                    "strict": True,
                },
            },
        }
    ).encode()
    request = Request(
        request_url,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    logger.info(
        "[AI] request_started provider=openai model=%s candidates=%s",
        model,
        transactions_count,
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=settings.openai_timeout_seconds) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=openai model=%s", model)
        return output
    except HTTPError as error:
        logger.error(
            "[AI] request_failed provider=openai status=%s reason=%s response_body=%s",
            error.code,
            error.reason,
            _safe_http_error_body(error),
        )
    except TimeoutError as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.error(
            "[AI] request_timeout provider=openai timeout_seconds=%s error_type=%s duration_ms=%s",
            settings.openai_timeout_seconds,
            type(error).__name__,
            duration_ms,
        )
    except (URLError, ValueError, json.JSONDecodeError) as error:
        logger.exception("[AI] request_failed provider=openai error_type=%s", type(error).__name__)
    return None


def _build_instructions(transactions: list[AiTransaction], allowed: list[str]) -> str:
    return (
        "You categorise bank transactions. First determine transaction_class, then assign category_name only when appropriate. "
        "Use only the supplied categories. Transfers to savings or the user's own accounts are not spending. "
        "Incoming transfers are not automatically income. Person-to-person payments are not automatically shopping. "
        "Use transaction_class=unknown and category_name=\"\" when evidence is insufficient. Never invent information.\n\n"
        "Money moved between the user's own accounts is internal_transfer. Money sent to another person is person_to_person. "
        "Money received from another person is not automatically income. Fixed deposit contributions are savings. "
        "Savings and investment transfers are not spending. Merchant purchases are spending. Salary is income. "
        "Bank charges are bank_fee. Do not assume every PayShap transaction is an internal transfer, every incoming transaction is income, "
        "or every person-to-person payment is shopping.\n\n"
        f"Allowed categories: {json.dumps(allowed)}\n"
        f"Transactions: {json.dumps([{ 'transaction_id': item.transaction_id, 'description': sanitize_for_ai(item.description), 'amount': item.amount, 'type': item.transaction_type } for item in transactions])}"
    )


def classify_batch(
    transactions: list[AiTransaction],
    category_names: list[str],
) -> dict[str, CategorisationResult]:
    expected_ids = {item.transaction_id for item in transactions}
    logger.info(
        "[AI] providers=gemini,openai gemini_key_loaded=%s openai_key_loaded=%s category_count=%s candidates=%s",
        bool(settings.gemini_api_key.strip()),
        bool(settings.openai_api_key.strip()),
        len(category_names),
        len(transactions),
    )
    if not transactions:
        logger.info("[AI] skipped reason=no_candidates")
        return {}
    if not category_names:
        logger.warning("[AI] skipped reason=empty_live_category_catalog")
        return {}
    if not settings.gemini_api_key.strip() and not settings.openai_api_key.strip():
        logger.warning("[AI] skipped reason=missing_api_keys expected_env=GEMINI_API_KEY|OPENAI_API_KEY")
        return {}

    allowed = sorted(set(category_names))
    instructions = _build_instructions(transactions, allowed)
    schema = _category_schema()

    # Prefer Gemini when configured; fall back to OpenAI.
    providers: list[tuple[str, object]] = []
    if settings.gemini_api_key.strip():
        providers.append(("gemini", _request_gemini))
    if settings.openai_api_key.strip():
        providers.append(("openai", _request_openai))

    for provider_name, requester in providers:
        output = requester(instructions, schema, len(transactions))  # type: ignore[operator]
        if output is None:
            continue
        try:
            if provider_name == "gemini":
                text = _gemini_response_text(output)
            else:
                text = _openai_response_text(output)
            results, rejected = _validate_results(
                json.loads(text),
                set(allowed),
                provider_name,
                expected_ids,
            )
            logger.info(
                "[AI] structured_json_parsed provider=%s accepted=%s rejected=%s",
                provider_name,
                len(results),
                rejected,
            )
            if results:
                return results
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            logger.exception(
                "[AI] response_parse_failed provider=%s error_type=%s",
                provider_name,
                type(error).__name__,
            )
            continue
    return {}
