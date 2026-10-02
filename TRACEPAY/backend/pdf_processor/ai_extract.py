import base64
import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from categorisation.sanitizer import sanitize_for_ai

from .extract import decrypt_pdf_content
from .models import ExtractedStatement, Transaction
from .normalise import parse_date
from .statement_schema import resolve_extracted_statement

logger = logging.getLogger("tracepay.pdf.ai_extract")

_ANTHROPIC_TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "bank": {"type": ["string", "null"]},
        "account_number_last4": {"type": ["string", "null"]},
        "account_type": {"type": ["string", "null"]},
        "statement_start_date": {"type": ["string", "null"]},
        "statement_end_date": {"type": ["string", "null"]},
        "opening_balance": {"type": ["number", "null"]},
        "closing_balance": {"type": ["number", "null"]},
        "transactions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
                    "description": {"type": "string"},
                    "amount": {
                        "type": "number",
                        "description": "Signed amount: debit negative, credit positive",
                    },
                    "direction": {"type": "string", "enum": ["debit", "credit"]},
                    "balance_after": {
                        "type": ["number", "null"],
                        "description": "Running balance after this row when present",
                    },
                    "reference": {"type": ["string", "null"]},
                },
                "required": ["date", "description", "amount", "direction"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "bank",
        "account_number_last4",
        "account_type",
        "statement_start_date",
        "statement_end_date",
        "opening_balance",
        "closing_balance",
        "transactions",
    ],
    "additionalProperties": False,
}

_GEMINI_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "bank": {"type": "STRING", "nullable": True},
        "account_number_last4": {"type": "STRING", "nullable": True},
        "account_type": {"type": "STRING", "nullable": True},
        "statement_start_date": {"type": "STRING", "nullable": True},
        "statement_end_date": {"type": "STRING", "nullable": True},
        "opening_balance": {"type": "NUMBER", "nullable": True},
        "closing_balance": {"type": "NUMBER", "nullable": True},
        "transactions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "date": {"type": "STRING"},
                    "description": {"type": "STRING"},
                    "amount": {"type": "NUMBER"},
                    "direction": {"type": "STRING", "enum": ["debit", "credit"]},
                    "balance_after": {"type": "NUMBER", "nullable": True},
                    "reference": {"type": "STRING", "nullable": True},
                },
                "required": ["date", "description", "amount", "direction"],
            },
        },
    },
    "required": ["transactions"],
}

_INSTRUCTIONS = (
    "Extract this South African bank statement into TRACEPAY's statement schema. "
    "Return only facts printed on the document. Never invent rows or balances. "
    "Fill bank, account_number_last4, account_type, statement_start_date, statement_end_date, "
    "opening_balance and closing_balance when they appear. Dates must be YYYY-MM-DD. "
    "Each transaction needs date, description, signed amount (debits negative, credits positive), "
    "direction (debit or credit), balance_after when shown, and reference when shown."
)


class AiExtractionError(ValueError):
    pass


def ai_extraction_available() -> bool:
    if not settings.ai_extraction_enabled:
        return False
    return bool(
        settings.anthropic_api_key.strip()
        or settings.openai_api_key.strip()
        or settings.gemini_api_key.strip(),
    )


def extract_transactions_with_ai(
    content: bytes,
    password: str | None = None,
    page_count_hint: int | None = None,
) -> tuple[list[Transaction], ExtractedStatement]:
    if not ai_extraction_available():
        raise AiExtractionError("AI extraction is not configured.")

    pdf_bytes = decrypt_pdf_content(content, password)
    if page_count_hint and page_count_hint > settings.ai_extraction_max_pages:
        raise AiExtractionError(
            f"AI extraction is limited to {settings.ai_extraction_max_pages} pages.",
        )

    errors: list[str] = []
    parsed: dict | None = None
    provider_used = ""

    if settings.anthropic_api_key.strip():
        try:
            parsed = _request_anthropic_pdf(_INSTRUCTIONS, pdf_bytes)
            provider_used = "anthropic"
        except AiExtractionError as error:
            errors.append(f"anthropic: {error}")
            logger.warning("[AI_EXTRACT] anthropic_failed reason=%s", error)

    if parsed is None and settings.openai_api_key.strip():
        try:
            parsed = _request_openai_pdf(_INSTRUCTIONS, pdf_bytes)
            provider_used = "openai"
        except AiExtractionError as error:
            errors.append(f"openai: {error}")
            logger.warning("[AI_EXTRACT] openai_failed reason=%s", error)

    if parsed is None and settings.gemini_api_key.strip():
        try:
            payload = _request_gemini_pdf(_INSTRUCTIONS, pdf_bytes)
            text = _gemini_response_text(payload)
            parsed = json.loads(text)
            provider_used = "gemini"
        except (AiExtractionError, json.JSONDecodeError) as error:
            errors.append(f"gemini: {error}")
            logger.warning("[AI_EXTRACT] gemini_failed reason=%s", error)

    if parsed is None:
        raise AiExtractionError(
            "AI extraction request failed. " + "; ".join(errors[:3]),
        )

    transactions = _parse_transactions(parsed)
    if not transactions:
        raise AiExtractionError("AI extraction returned no valid transactions.")

    statement = _parse_extracted_statement(parsed, transactions)
    logger.info(
        "[AI_EXTRACT] success provider=%s transactions=%s closing_balance=%s",
        provider_used,
        len(transactions),
        statement.closing_balance,
    )
    return transactions, statement


def _request_anthropic_pdf(instructions: str, pdf_bytes: bytes) -> dict:
    api_key = settings.anthropic_api_key.strip()
    model = settings.anthropic_model.strip() or "claude-sonnet-4-6"
    base_url = settings.anthropic_base_url.rstrip("/")
    timeout = max(
        settings.ai_extraction_timeout_seconds,
        settings.anthropic_timeout_seconds,
    )
    body = json.dumps(
        {
            "model": model,
            "max_tokens": 16384,
            "tools": [
                {
                    "name": "extract_statement",
                    "description": "Return every transaction found on the bank statement PDF.",
                    "input_schema": _ANTHROPIC_TOOL_SCHEMA,
                }
            ],
            "tool_choice": {"type": "tool", "name": "extract_statement"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": base64.b64encode(pdf_bytes).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": instructions},
                    ],
                }
            ],
        }
    ).encode()
    request = Request(
        f"{base_url}/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    logger.info(
        "[AI_EXTRACT] request_started provider=anthropic model=%s pdf_bytes=%s",
        model,
        len(pdf_bytes),
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI_EXTRACT] request_success provider=anthropic model=%s", model)
        return _anthropic_tool_input(output)
    except HTTPError as error:
        body_preview = _safe_error_body(error)
        logger.error(
            "[AI_EXTRACT] request_failed provider=anthropic status=%s body=%s",
            error.code,
            body_preview,
        )
        raise AiExtractionError("Anthropic extraction request failed.") from error
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        logger.exception(
            "[AI_EXTRACT] request_failed provider=anthropic error_type=%s",
            type(error).__name__,
        )
        raise AiExtractionError("Anthropic extraction request failed.") from error


def _anthropic_tool_input(payload: dict) -> dict:
    content = payload.get("content")
    if not isinstance(content, list):
        raise AiExtractionError("Anthropic response missing content.")
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") != "tool_use":
            continue
        if block.get("name") != "extract_statement":
            continue
        tool_input = block.get("input")
        if isinstance(tool_input, dict):
            return tool_input
    raise AiExtractionError("Anthropic response did not include extract_statement output.")


def _request_openai_pdf(instructions: str, pdf_bytes: bytes) -> dict:
    api_key = settings.openai_api_key.strip()
    model = settings.openai_model.strip() or "gpt-4.1-mini"
    base_url = settings.openai_base_url.rstrip("/")
    timeout = max(settings.ai_extraction_timeout_seconds, settings.openai_timeout_seconds)
    page_images = _pdf_page_images_base64(pdf_bytes)
    if not page_images:
        raise AiExtractionError("Could not render PDF pages for OpenAI.")

    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"{instructions}\n"
                "Respond with a single JSON object only, no markdown. "
                "Shape: TRACEPAY statement schema with bank, account_number_last4, "
                "account_type, statement_start_date, statement_end_date, opening_balance, "
                "closing_balance, and transactions[{date,description,amount,direction,balance_after,reference}]."
            ),
        }
    ]
    for image in page_images:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image}"},
            },
        )

    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": content}],
        }
    ).encode()
    request = Request(
        f"{base_url}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    logger.info(
        "[AI_EXTRACT] request_started provider=openai model=%s pages=%s",
        model,
        len(page_images),
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            output = json.loads(response.read().decode("utf-8"))
        logger.info("[AI_EXTRACT] request_success provider=openai model=%s", model)
        text = (
            output.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not isinstance(text, str) or not text.strip():
            raise AiExtractionError("OpenAI response contained empty text.")
        return json.loads(text)
    except HTTPError as error:
        logger.error(
            "[AI_EXTRACT] request_failed provider=openai status=%s body=%s",
            error.code,
            _safe_error_body(error),
        )
        raise AiExtractionError("OpenAI extraction request failed.") from error
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        logger.exception(
            "[AI_EXTRACT] request_failed provider=openai error_type=%s",
            type(error).__name__,
        )
        raise AiExtractionError("OpenAI extraction request failed.") from error


def _pdf_page_images_base64(pdf_bytes: bytes) -> list[str]:
    try:
        import fitz
    except ImportError as error:
        raise AiExtractionError("PyMuPDF is required for OpenAI PDF fallback.") from error

    images: list[str] = []
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        max_pages = min(document.page_count, settings.ai_extraction_max_pages)
        matrix = fitz.Matrix(140 / 72, 140 / 72)
        for index in range(max_pages):
            try:
                pixmap = document.load_page(index).get_pixmap(matrix=matrix, alpha=False)
                images.append(base64.b64encode(pixmap.tobytes("jpeg")).decode("ascii"))
            except Exception as error:
                logger.warning(
                    "[AI_EXTRACT] page_render_failed page=%s error_type=%s",
                    index + 1,
                    type(error).__name__,
                )
                continue
    finally:
        document.close()
    return images


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


def _request_gemini_pdf(instructions: str, pdf_bytes: bytes) -> dict:
    api_key = settings.gemini_api_key.strip()
    base_url = settings.gemini_base_url.rstrip("/")
    last_error: Exception | None = None
    for model in _gemini_model_candidates():
        body = json.dumps(
            {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": instructions},
                            {
                                "inline_data": {
                                    "mime_type": "application/pdf",
                                    "data": base64.b64encode(pdf_bytes).decode("ascii"),
                                }
                            },
                        ],
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": _GEMINI_SCHEMA,
                },
            }
        ).encode()
        request_url = f"{base_url}/models/{model}:generateContent"
        request = Request(
            request_url,
            data=body,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            method="POST",
        )
        logger.info(
            "[AI_EXTRACT] request_started provider=gemini model=%s pdf_bytes=%s",
            model,
            len(pdf_bytes),
        )
        try:
            with urlopen(request, timeout=settings.ai_extraction_timeout_seconds) as response:
                output = json.loads(response.read().decode("utf-8"))
            logger.info("[AI_EXTRACT] request_success provider=gemini model=%s", model)
            return output
        except HTTPError as error:
            last_error = error
            logger.error(
                "[AI_EXTRACT] request_failed provider=gemini model=%s status=%s body=%s",
                model,
                error.code,
                _safe_error_body(error),
            )
            if error.code not in {429, 503, 500, 404}:
                break
            continue
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            logger.exception(
                "[AI_EXTRACT] request_failed provider=gemini model=%s error_type=%s",
                model,
                type(error).__name__,
            )
            continue
    raise AiExtractionError("Gemini extraction request failed.") from last_error


def _gemini_response_text(payload: dict) -> str:
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if isinstance(part.get("text"), str):
                return part["text"]
    raise AiExtractionError("AI response did not contain text output.")


def _safe_error_body(error: HTTPError) -> str:
    try:
        return sanitize_for_ai(
            error.read(1500).decode("utf-8", errors="replace"),
        )[:800]
    except (OSError, UnicodeError):
        return "<unavailable>"


def _to_decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _parse_transactions(parsed: dict) -> list[Transaction]:
    rows = parsed.get("transactions")
    if not isinstance(rows, list):
        return []
    transactions: list[Transaction] = []
    for index, item in enumerate(rows, start=1):
        if not isinstance(item, dict):
            continue
        date_value = parse_date(str(item.get("date", "")).strip())
        description = sanitize_for_ai(str(item.get("description", ""))).strip()[:500]
        amount = _to_decimal(item.get("amount"))
        raw_type = str(item.get("direction") or item.get("type") or "").strip().lower()
        if date_value is None or not description or amount is None:
            continue
        if raw_type not in {"debit", "credit"}:
            raw_type = "credit" if amount > 0 else "debit"
        signed = abs(amount) if raw_type == "credit" else -abs(amount)
        balance = _to_decimal(item.get("balance_after") if "balance_after" in item else item.get("balance"))
        reference = item.get("reference")
        reference_text = (
            sanitize_for_ai(str(reference)).strip()[:80] if reference else None
        )
        try:
            transactions.append(
                Transaction(
                    date=date_value,
                    description=description,
                    amount=signed,
                    type=raw_type,  # type: ignore[arg-type]
                    balance=balance,
                    source_row=index,
                    confidence="medium",
                    reference=reference_text or None,
                )
            )
        except (TypeError, ValueError):
            continue
    return transactions


def _parse_extracted_statement(
    parsed: dict,
    transactions: list[Transaction],
) -> ExtractedStatement:
    last4_raw = parsed.get("account_number_last4")
    last4 = re.sub(r"\D", "", str(last4_raw))[-4:] if last4_raw else None
    return resolve_extracted_statement(
        "",
        transactions,
        bank=str(parsed.get("bank")).strip() if parsed.get("bank") else None,
        account_number_last4=last4 if last4 and len(last4) == 4 else None,
        account_type=str(parsed.get("account_type")).strip() if parsed.get("account_type") else None,
        statement_start_date=parse_date(str(parsed.get("statement_start_date") or "").strip()),
        statement_end_date=parse_date(str(parsed.get("statement_end_date") or "").strip()),
        opening_balance=_to_decimal(parsed.get("opening_balance")),
        closing_balance=_to_decimal(parsed.get("closing_balance")),
    )
