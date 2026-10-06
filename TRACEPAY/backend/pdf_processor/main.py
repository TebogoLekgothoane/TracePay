import logging
from pathlib import PurePath

from .ai_extract import (
    AiExtractionError,
    ai_extraction_available,
    extract_transactions_with_ai,
)
from .extract import ExtractionError, extract_layers
from .models import ProcessingResult, StatementBalance, Transaction, ValidationResult
from .normalise import normalize_row, parse_text_rows
from .statement_schema import resolve_extracted_statement
from .tables import align_row_to_headers, is_transaction_table, merge_continuation_rows, table_headers
from .validate import validate_transactions
from categorisation.service import CategorisableTransaction, categorise_batch


class PdfProcessingError(ValueError):
    pass


logger = logging.getLogger("tracepay.pdf")


def process_pdf(
    content: bytes,
    filename: str,
    authenticated_user_id: str,
    password: str | None = None,
    category_names: list[str] | None = None,
    access_token: str | None = None,
) -> ProcessingResult:
    logger.info(
        "pdf_processing_started filename=%s size_bytes=%s user_id_prefix=%s",
        filename,
        len(content),
        authenticated_user_id[:8] if authenticated_user_id else "none",
    )
    if not authenticated_user_id:
        raise PdfProcessingError("An authenticated user is required for PDF processing.")
    if PurePath(filename).suffix.lower() != ".pdf":
        raise PdfProcessingError("Only PDF files can be processed.")
    try:
        raw, text, tables = extract_layers(content, password)
    except ExtractionError as error:
        raise PdfProcessingError(str(error)) from error

    transactions: list[Transaction] = []
    rows_rejected = 0
    ai_statement = None

    if raw.extraction_method != "unknown":
        table_rows_detected = 0
        if tables:
            for table_index, table in enumerate(tables, start=1):
                header_index, headers = table_headers(table)
                if not is_transaction_table(headers):
                    logger.info(
                        "pdf_table_skipped table=%s headers=%s reason=not_transaction_table",
                        table_index,
                        headers,
                    )
                    continue
                data_rows = table[header_index + 1 :]
                aligned_headers = headers
                aligned_rows = []
                for row in data_rows:
                    aligned_row, aligned_headers = align_row_to_headers(row, headers)
                    aligned_rows.append(aligned_row)
                merged_rows = merge_continuation_rows(aligned_rows, aligned_headers)
                logger.info(
                    "pdf_table_detected table=%s header_row=%s headers=%s data_rows=%s coalesced_rows=%s",
                    table_index,
                    header_index,
                    aligned_headers,
                    len(data_rows),
                    len(merged_rows),
                )
                table_rows_detected += len(merged_rows)
                for row in merged_rows:
                    transaction = normalize_row(row, aligned_headers, len(transactions) + 1)
                    if transaction:
                        transactions.append(transaction)
            raw = raw.model_copy(update={"rows_found": table_rows_detected})
        rows_rejected = max(raw.rows_found - len(transactions), 0)
        if not transactions:
            transactions, detected_rows = parse_text_rows(text)
            raw = raw.model_copy(update={"rows_found": detected_rows})
            rows_rejected = max(detected_rows - len(transactions), 0)

    classical_validation = validate_transactions(
        transactions,
        raw.extraction_method,
        raw.rows_found or len(transactions),
        rows_rejected,
    )

    if _needs_ai_fallback(raw.extraction_method, classical_validation, transactions):
        logger.info(
            "[AI_EXTRACT] fallback_triggered method=%s confidence=%s transactions=%s rejected=%s reconciliation=%s",
            raw.extraction_method,
            classical_validation.confidence,
            len(transactions),
            classical_validation.rows_rejected,
            classical_validation.balance_reconciliation,
        )
        try:
            ai_transactions, ai_statement = extract_transactions_with_ai(
                content,
                password=password,
                page_count_hint=raw.pages,
            )
            ai_validation = validate_transactions(
                ai_transactions,
                "ai",
                len(ai_transactions),
                0,
            )
            if _prefer_ai_result(classical_validation, transactions, ai_validation, ai_transactions):
                transactions = ai_transactions
                rows_rejected = 0
                raw = raw.model_copy(
                    update={
                        "extraction_method": "ai",
                        "extraction_confidence": ai_validation.confidence,
                        "rows_found": len(ai_transactions),
                    },
                )
                logger.info(
                    "[AI_EXTRACT] fallback_accepted ai_transactions=%s ai_confidence=%s",
                    len(ai_transactions),
                    ai_validation.confidence,
                )
            else:
                logger.info(
                    "[AI_EXTRACT] fallback_rejected keeping_classical classical=%s ai=%s",
                    len(transactions),
                    len(ai_transactions),
                )
        except AiExtractionError as error:
            logger.warning("[AI_EXTRACT] fallback_failed reason=%s", error)
            if raw.extraction_method == "unknown" and not transactions:
                raise PdfProcessingError(
                    "The PDF could not be read reliably. Classical extraction failed and AI fallback was unavailable.",
                ) from error

    if raw.extraction_method == "unknown" and not transactions:
        raise PdfProcessingError(
            "The PDF has insufficient readable content. OCR could not produce a reliable result.",
        )

    logger.info(
        "[CATEGORISATION] invoked_after_extraction=true total_transactions=%s live_category_count=%s",
        len(transactions),
        len(category_names or []),
    )
    classifications = categorise_batch(
        [
            CategorisableTransaction(
                str(index),
                transaction.description,
                transaction.amount,
                transaction.type,
                statement_category=transaction.category_name,
                bank=ai_statement.bank if ai_statement else None,
            )
            for index, transaction in enumerate(transactions)
        ],
        category_names,
        access_token=access_token,
    )
    catalog = {name.casefold(): name for name in (category_names or [])}
    transactions = [
        _with_category(transaction, classifications[str(index)], catalog)
        for index, transaction in enumerate(transactions)
    ]
    validation = validate_transactions(
        transactions,
        raw.extraction_method,
        raw.rows_found or len(transactions),
        rows_rejected,
    )
    statement = resolve_extracted_statement(
        text,
        transactions,
        bank=ai_statement.bank if ai_statement else None,
        account_number_last4=ai_statement.account_number_last4 if ai_statement else None,
        account_type=ai_statement.account_type if ai_statement else None,
        statement_start_date=ai_statement.statement_start_date if ai_statement else None,
        statement_end_date=ai_statement.statement_end_date if ai_statement else None,
        opening_balance=ai_statement.opening_balance if ai_statement else None,
        closing_balance=ai_statement.closing_balance if ai_statement else None,
        source_filename=filename,
    )
    statement_balance = StatementBalance(
        amount=statement.closing_balance,
        as_of_date=statement.statement_end_date,
        source=statement.balance_source,
    )
    logger.info(
        "pdf_processing_completed filename=%s method=%s extraction_confidence=%s pages=%s tables=%s rows_detected=%s rows_rejected=%s transactions=%s status=%s confidence=%s bank=%s closing_balance=%s period=%s:%s",
        filename,
        raw.extraction_method,
        raw.extraction_confidence,
        raw.pages,
        raw.tables_found,
        validation.rows_detected,
        validation.rows_rejected,
        len(transactions),
        validation.status,
        validation.confidence,
        statement.bank,
        statement.closing_balance,
        statement.statement_start_date,
        statement.statement_end_date,
    )
    return ProcessingResult(
        filename=filename,
        raw_extraction=raw.model_copy(
            update={"rows_found": max(raw.rows_found, len(transactions))},
        ),
        validation=validation,
        transactions=transactions,
        statement=statement,
        statement_balance=statement_balance,
    )


def _with_category(transaction: Transaction, classification, catalog: dict[str, str]) -> Transaction:
    """Apply TracePay classification. Statement category is evidence only (handled in categorise_batch)."""
    category = classification.category_name
    if category and catalog:
        category = catalog.get(category.casefold(), category)
    return transaction.model_copy(
        update={
            "category_name": category,
            "category_confidence": classification.category_confidence,
            "category_rule": classification.rule,
            "transaction_class": classification.transaction_class,
            "classification_confidence": classification.classification_confidence,
            "classification_reason": classification.classification_reason,
            "merchant_name": classification.merchant_name or transaction.merchant_name,
        },
    )


def _needs_ai_fallback(
    extraction_method: str,
    validation: ValidationResult,
    transactions: list[Transaction],
) -> bool:
    if not ai_extraction_available():
        return False
    if extraction_method == "unknown" or not transactions:
        return True
    detected = validation.rows_detected or len(transactions)
    if extraction_method in {"table", "text"} and detected > 0 and len(transactions) / detected >= 0.8:
        logger.info(
            "[AI_EXTRACT] skipped_usable_classical method=%s transactions=%s confidence=%s",
            extraction_method,
            len(transactions),
            validation.confidence,
        )
        return False
    if validation.confidence < 0.65:
        return True
    if validation.balance_reconciliation == "mismatch":
        return True
    if validation.rows_detected > 0 and validation.rows_rejected / validation.rows_detected >= 0.2:
        return True
    return False


def _prefer_ai_result(
    classical: ValidationResult,
    classical_transactions: list[Transaction],
    ai: ValidationResult,
    ai_transactions: list[Transaction],
) -> bool:
    if not classical_transactions:
        return bool(ai_transactions)
    if not ai_transactions:
        return False
    if ai.confidence > classical.confidence:
        return True
    if len(ai_transactions) > len(classical_transactions) and ai.confidence >= classical.confidence - 0.05:
        return True
    if classical.balance_reconciliation == "mismatch" and ai.balance_reconciliation != "mismatch":
        return True
    return False
