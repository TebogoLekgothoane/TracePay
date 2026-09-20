import re
import logging
from pathlib import PurePath

from .extract import ExtractionError, extract_layers
from .models import ProcessingResult, Transaction
from .normalise import normalize_row, parse_amount, parse_date
from .tables import align_row_to_headers, table_headers
from .validate import validate_transactions
from categorisation.service import CategorisableTransaction, categorise_batch


class PdfProcessingError(ValueError):
    pass


logger = logging.getLogger("tracepay.pdf")


def process_pdf(content: bytes, filename: str, authenticated_user_id: str, password: str | None = None, category_names: list[str] | None = None) -> ProcessingResult:
    logger.info("pdf_processing_started filename=%s size_bytes=%s user_id_prefix=%s", filename, len(content), authenticated_user_id[:8] if authenticated_user_id else "none")
    if not authenticated_user_id:
        raise PdfProcessingError("An authenticated user is required for PDF processing.")
    if PurePath(filename).suffix.lower() != ".pdf":
        raise PdfProcessingError("Only PDF files can be processed.")
    try:
        raw, text, tables = extract_layers(content, password)
    except ExtractionError as error:
        raise PdfProcessingError(str(error)) from error
    if raw.extraction_method == "unknown":
        logger.warning("pdf_extraction_unknown filename=%s pages=%s", filename, raw.pages)
        raise PdfProcessingError("The PDF has insufficient readable content. OCR could not produce a reliable result.")

    transactions: list[Transaction] = []
    table_rows_detected = 0
    if tables:
        for table_index, table in enumerate(tables, start=1):
            header_index, headers = table_headers(table)
            logger.info("pdf_table_detected table=%s header_row=%s headers=%s data_rows=%s", table_index, header_index, headers, max(len(table) - header_index - 1, 0))
            table_rows_detected += max(len(table) - header_index - 1, 0)
            for row_number, row in enumerate(table[header_index + 1 :], start=header_index + 2):
                aligned_row, aligned_headers = align_row_to_headers(row, headers)
                transaction = normalize_row(aligned_row, aligned_headers, row_number)
                if transaction:
                    transactions.append(transaction)
        raw = raw.model_copy(update={"rows_found": table_rows_detected})
    rows_rejected = max(raw.rows_found - len(transactions), 0)
    if not transactions:
        transactions, detected_rows = _parse_text_rows(text)
        raw = raw.model_copy(update={"rows_found": detected_rows})
        rows_rejected = max(detected_rows - len(transactions), 0)
    logger.info("[CATEGORISATION] invoked_after_extraction=true total_transactions=%s live_category_count=%s", len(transactions), len(category_names or []))
    classifications = categorise_batch([
        CategorisableTransaction(str(index), transaction.description, transaction.amount, transaction.type)
        for index, transaction in enumerate(transactions)
    ], category_names)
    transactions = [transaction.model_copy(update={
        "category_name": classifications[str(index)].category_name,
        "category_confidence": classifications[str(index)].confidence,
        "category_rule": classifications[str(index)].rule,
        "transaction_class": classifications[str(index)].transaction_class,
        "classification_confidence": classifications[str(index)].classification_confidence,
        "classification_reason": classifications[str(index)].classification_reason,
        "merchant_name": classifications[str(index)].merchant_name,
    }) for index, transaction in enumerate(transactions)]
    validation = validate_transactions(transactions, raw.extraction_method, raw.rows_found or len(transactions), rows_rejected)
    logger.info("pdf_processing_completed filename=%s method=%s pages=%s tables=%s rows_detected=%s rows_rejected=%s transactions=%s status=%s confidence=%s", filename, raw.extraction_method, raw.pages, raw.tables_found, validation.rows_detected, validation.rows_rejected, len(transactions), validation.status, validation.confidence)
    return ProcessingResult(filename=filename, raw_extraction=raw.model_copy(update={"rows_found": max(raw.rows_found, len(transactions))}), validation=validation, transactions=transactions)


def _parse_text_rows(text: str) -> tuple[list[Transaction], int]:
    rows: list[Transaction] = []
    detected_rows = 0
    number = re.compile(r"(?:R|ZAR)?\s*\(?[-+]?\d[\d\s]*(?:[,.]\d{2})?\)?")
    for row_number, line in enumerate(text.splitlines(), start=1):
        match = re.match(r"^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s+(.+)$", line.strip())
        if not match:
            continue
        detected_rows += 1
        amounts = list(number.finditer(match.group(2)))
        signed_amounts = [item for item in amounts if item.group(0).lstrip().startswith(("-", "+", "("))]
        if len(signed_amounts) != 1:
            continue
        amount_match = signed_amounts[0]
        transaction_date = parse_date(match.group(1))
        amount = parse_amount(amount_match.group(0))
        description = match.group(2)[: amount_match.start()].strip(" |-:")
        if transaction_date is None or amount is None or not description:
            continue
        rows.append(Transaction(date=transaction_date, description=description, amount=amount, type="credit" if amount > 0 else "debit", source_row=row_number, confidence="low"))
    return rows, detected_rows
