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
    logger.info(
        "[AI] results_received=%s validation_accepted=%s validation_rejected=%s ai_invalid_results=%s provider=%s",
        len(items),
        len(results),
        rejected,
        rejected,
        provider,
    )
    return results


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


def _request_openai(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    api_key = settings.openai_api_key.strip()
    if not api_key:
        logger.info("[AI] provider=openai skipped reason=missing_api_key expected_env=OPENAI_API_KEY")
        return None
    model = settings.openai_model.strip() or "gpt-4.1-mini"
    request_url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
    body = json.dumps({
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
    }).encode()
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


def classify_batch(transactions: list[AiTransaction], category_names: list[str]) -> dict[str, CategorisationResult]:
    logger.info(
        "[AI] providers=openai openai_key_loaded=%s category_count=%s candidates=%s",
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
    if not settings.openai_api_key.strip():
        logger.warning("[AI] skipped reason=missing_api_key expected_env=OPENAI_API_KEY")
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
        f"Allowed categories: {json.dumps(allowed)}\n"
        f"Transactions: {json.dumps([{ 'transaction_id': item.transaction_id, 'description': sanitize_for_ai(item.description), 'amount': item.amount, 'type': item.transaction_type } for item in transactions])}"
    )
    openai_output = _request_openai(instructions, _category_schema(), len(transactions))
    if openai_output is None:
        return {}
    try:
        results = _validate_results(json.loads(_openai_response_text(openai_output)), set(allowed), "openai")
        logger.info("[AI] structured_json_parsed provider=openai")
        return results
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        logger.exception("[AI] response_parse_failed provider=openai error_type=%s", type(error).__name__)
        return {}
