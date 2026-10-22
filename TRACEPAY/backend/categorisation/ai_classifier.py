"""AI categorisation fallback with OpenRouter and optional compatible providers."""

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
from categorisation.source_identity import validate_ai_source

logger = logging.getLogger("tracepay.categorisation.ai")


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
                        "merchant_name": {"type": ["string", "null"]},
                        "merchant_identification_status": {
                            "type": "string",
                            "enum": ["identified", "candidate", "unknown"],
                        },
                        "merchant_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "evidence": {"type": "array", "items": {"type": "string"}},
                        "alternative_candidates": {"type": "array", "items": {"type": "string"}},
                        "source_type": {
                            "type": "string",
                            "enum": [
                                "merchant",
                                "person",
                                "bank",
                                "payment_processor",
                                "payment_mechanism",
                                "unknown",
                            ],
                        },
                        "payment_mechanism": {"type": ["string", "null"]},
                        "supporting_text": {"type": ["string", "null"]},
                        "uncertainty": {
                            "type": "string",
                            "enum": ["identified", "uncertain", "unknown"],
                        },
                    },
                    "required": [
                        "transaction_id",
                        "transaction_class",
                        "classification_confidence",
                        "category_name",
                        "category_confidence",
                        "reason",
                        "merchant_name",
                        "merchant_identification_status",
                        "merchant_confidence",
                        "evidence",
                        "alternative_candidates",
                        "source_type",
                        "payment_mechanism",
                        "supporting_text",
                        "uncertainty",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["transactions"],
        "additionalProperties": False,
    }


def _validate_results(
    parsed: dict,
    allowed: set[str],
    provider: str,
    expected_ids: set[str],
    descriptions_by_id: dict[str, str] | None = None,
) -> tuple[dict[str, CategorisationResult], int]:
    results: dict[str, CategorisationResult] = {}
    rejected = 0
    descriptions_by_id = descriptions_by_id or {}
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
            description = descriptions_by_id.get(transaction_id)
            raw_merchant = item.get("merchant_name")
            if isinstance(raw_merchant, str):
                raw_merchant = raw_merchant.strip() or None
            else:
                raw_merchant = None
            merchant_status = item.get("merchant_identification_status")
            merchant_confidence = item.get("merchant_confidence")
            source_type = item.get("source_type")
            uncertainty = item.get("uncertainty")
            try:
                merchant_confidence_value = float(merchant_confidence)
            except (TypeError, ValueError):
                merchant_confidence_value = 0.0
            merchant_is_verified = (
                merchant_status == "identified"
                and source_type == "merchant"
                and uncertainty == "identified"
                and merchant_confidence_value >= settings.ai_merchant_identification_min_confidence
            )
            if not merchant_is_verified:
                raw_merchant = None
            identity = validate_ai_source(
                description=description,
                proposed_merchant=raw_merchant,
                source_type=source_type if isinstance(source_type, str) else None,
                payment_mechanism=(
                    item.get("payment_mechanism")
                    if isinstance(item.get("payment_mechanism"), str)
                    else None
                ),
                uncertainty=uncertainty if isinstance(uncertainty, str) else None,
                supporting_text=(
                    item.get("supporting_text")
                    if isinstance(item.get("supporting_text"), str)
                    else None
                ),
            )
            merchant_name = identity.merchant_name
            result = CategorisationResult(
                category_name=category_name,
                category_confidence=float(item.get("category_confidence", 0)) if category_name else 0,
                transaction_class=transaction_class,
                classification_confidence=float(item.get("classification_confidence", 0)),
                classification_reason=(
                    str(item.get("reason", ""))[:500]
                    or "Classified by AI based on transaction description"
                ),
                merchant_name=merchant_name,
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


def _request_openrouter(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    """Categorise through OpenRouter's OpenAI-compatible chat-completions API."""
    api_key = settings.openrouter_api_key.strip()
    if not api_key:
        logger.info(
            "[AI] provider=openrouter skipped reason=missing_api_key expected_env=OPENROUTER_API_KEY"
        )
        return None
    model = settings.openrouter_model.strip() or "openai/gpt-4o-mini"
    request_url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
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
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if settings.openrouter_http_referer.strip():
        headers["HTTP-Referer"] = settings.openrouter_http_referer.strip()
    if settings.openrouter_title.strip():
        headers["X-Title"] = settings.openrouter_title.strip()
    request = Request(request_url, data=body, headers=headers, method="POST")
    logger.info(
        "[AI] request_started provider=openrouter model=%s candidates=%s",
        model,
        transactions_count,
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=max(1, settings.openrouter_timeout_seconds)) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=openrouter model=%s", model)
        return output
    except HTTPError as error:
        logger.error(
            "[AI] request_failed provider=openrouter status=%s",
            error.code,
        )
    except TimeoutError as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.error(
            "[AI] request_timeout provider=openrouter timeout_seconds=%s error_type=%s duration_ms=%s",
            settings.openrouter_timeout_seconds,
            type(error).__name__,
            duration_ms,
        )
    except (URLError, ValueError, json.JSONDecodeError) as error:
        logger.error(
            "[AI] request_failed provider=openrouter error_type=%s",
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
            "[AI] request_failed provider=openai status=%s",
            error.code,
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
        "Source identification: set source_type, merchant_name (or null), merchant_identification_status, merchant_confidence, "
        "evidence, alternative_candidates, payment_mechanism, supporting_text, and uncertainty. "
        "merchant_name must appear in the sanitised description or be a clear alias of text that does. "
        "Use merchant_identification_status=identified only when the description directly supports it; then source_type=merchant, "
        "uncertainty=identified, and merchant_confidence must reflect that support. For candidate or unknown, merchant_name must be null. "
        "Evidence must be concise, description-derived features; alternatives are optional and must not be promoted as merchants. "
        "Strip bank boilerplate such as Recurring Card Purchase, Online Purchase, Payment Received, "
        "Transfer Received from, Banking App, and Dl* before naming the merchant. "
        "Prefer brand names for apps and subscriptions (CapCut, Google One, Uber, Netflix). "
        "For Airtime Advance lines with no network named, merchant_name may be null. "
        "For person-to-person payment received lines, keep source_type=person and merchant_name null. "
        "Never treat bank wording such as RECURRING PAYMENT FROM, MONEY TRANSFERRED IN/OUT, PURCHASE WITH CARD AT, "
        "or WITH CARD AT as a merchant. Payment processors are not the underlying merchant. "
        "Person-to-person recipients are source_type=person with merchant_name null. "
        "If the merchant cannot be identified, set merchant_name null, source_type=unknown, uncertainty=unknown.\n\n"
        f"Allowed categories: {json.dumps(allowed)}\n"
        f"Transactions: {json.dumps([{ 'transaction_id': item.transaction_id, 'description': sanitize_for_ai(item.description), 'amount': item.amount, 'type': item.transaction_type } for item in transactions])}"
    )


def _request_xai(instructions: str, schema: dict, transactions_count: int) -> dict | None:
    """Grok via the xAI OpenAI-compatible chat completions API."""
    api_key = settings.xai_api_key.strip()
    if not api_key:
        logger.info("[AI] provider=xai skipped reason=missing_api_key expected_env=XAI_API_KEY")
        return None
    model = settings.xai_model.strip() or "grok-4-1-fast-non-reasoning"
    timeout = max(1, settings.xai_timeout_seconds or settings.openai_timeout_seconds)
    request_url = f"{settings.xai_base_url.rstrip('/')}/chat/completions"
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
        "[AI] request_started provider=xai model=%s candidates=%s",
        model,
        transactions_count,
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=timeout) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI] request_success provider=xai model=%s", model)
        return output
    except HTTPError as error:
        logger.error(
            "[AI] request_failed provider=xai status=%s",
            error.code,
        )
    except TimeoutError as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.error(
            "[AI] request_timeout provider=xai timeout_seconds=%s error_type=%s duration_ms=%s",
            timeout,
            type(error).__name__,
            duration_ms,
        )
    except (URLError, ValueError, json.JSONDecodeError) as error:
        logger.exception("[AI] request_failed provider=xai error_type=%s", type(error).__name__)
    return None


def classify_batch(
    transactions: list[AiTransaction],
    category_names: list[str],
) -> dict[str, CategorisationResult]:
    expected_ids = {item.transaction_id for item in transactions}
    descriptions_by_id = {item.transaction_id: item.description for item in transactions}
    openrouter_loaded, openai_loaded, xai_loaded = settings.categorisation_provider_keys()
    logger.info(
        "[AI] providers=openrouter,openai,xai openrouter_key_loaded=%s openai_key_loaded=%s xai_key_loaded=%s category_count=%s candidates=%s",
        openrouter_loaded,
        openai_loaded,
        xai_loaded,
        len(category_names),
        len(transactions),
    )
    if not transactions:
        logger.info("[AI] skipped reason=no_candidates")
        return {}
    if not category_names:
        logger.warning("[AI] skipped reason=empty_live_category_catalog")
        return {}
    if not (openrouter_loaded or openai_loaded or xai_loaded):
        logger.warning(
            "[AI] skipped reason=missing_api_keys expected_env=OPENROUTER_API_KEY|OPENAI_API_KEY|XAI_API_KEY"
        )
        return {}

    allowed = sorted(set(category_names))
    instructions = _build_instructions(transactions, allowed)
    schema = _category_schema()

    # Prefer OpenRouter, then direct OpenAI, then optional Grok (xAI).
    providers: list[tuple[str, object]] = []
    if openrouter_loaded:
        providers.append(("openrouter", _request_openrouter))
    if openai_loaded:
        providers.append(("openai", _request_openai))
    if xai_loaded:
        providers.append(("xai", _request_xai))

    for provider_name, requester in providers:
        try:
            output = requester(instructions, schema, len(transactions))  # type: ignore[operator]
        except Exception as error:  # noqa: BLE001 - AI must never interrupt imports
            logger.exception(
                "[AI] provider_request_failed provider=%s error_type=%s",
                provider_name,
                type(error).__name__,
            )
            continue
        if output is None:
            continue
        try:
            text = _chat_response_text(output, provider_name)
            results, rejected = _validate_results(
                json.loads(text),
                set(allowed),
                provider_name,
                expected_ids,
                descriptions_by_id,
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
        except Exception as error:  # noqa: BLE001 - keep imports resilient
            logger.exception(
                "[AI] unexpected_provider_failure provider=%s error_type=%s",
                provider_name,
                type(error).__name__,
            )
            continue
    return {}
