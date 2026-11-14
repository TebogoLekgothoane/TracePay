import logging
from pathlib import PurePath

from .extract import ExtractionError, extract_layers
from .mirrored_sections import drop_mirrored_text, has_mirrored_sections, is_mirror_table
from .models import ProcessingResult, StatementBalance, Transaction, UnparsedRow, ValidationResult
from .normalise import (
    normalize_row,
    parse_text_rows,
    split_same_row_fee,
    table_marks_debits_with_sign,
    unparsed_text_rows,
)
from .statement_schema import (
    period_from_text,
    printed_opening_balance,
    resolve_extracted_statement,
    statement_has_no_activity,
)
from .tables import (
    align_row_to_headers,
    infer_directions_from_balances,
    is_summary_row,
    is_transaction_table,
    last_printed_balance,
    merge_continuation_rows,
    table_headers,
)
from .text_chain import text_chain_transactions
from .validate import balance_chain_checks, reconcile_opening_closing, validate_transactions
from categorisation.ai_budget import consume_ai_budget
from categorisation.service import CategorisableTransaction, categorise_batch


class PdfProcessingError(ValueError):
    pass


logger = logging.getLogger("tracepay.pdf")

NO_ACTIVITY_MESSAGE = "No transactions in this period."


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

    mirrored = has_mirrored_sections(text)
    if mirrored:
        text = drop_mirrored_text(text)
        logger.info("pdf_mirrored_sections_dropped")

    transactions: list[Transaction] = []
    text_rows_used = False
    rows_rejected = 0
    ai_statement = None
    # Only a period printed on the statement can place year-less dates.
    header_period = period_from_text(text)

    running_balance = printed_opening_balance(text)
    chain_transactions = text_chain_transactions(text) if raw.extraction_method == "text" else None
    if chain_transactions is not None:
        transactions = chain_transactions
        raw = raw.model_copy(update={"rows_found": len(transactions)})
        logger.info("pdf_text_chain_used transactions=%s", len(transactions))
    elif raw.extraction_method != "unknown":
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
                if mirrored and is_mirror_table(headers):
                    logger.info("pdf_table_skipped table=%s reason=mirrored_section", table_index)
                    continue
                data_rows = table[header_index + 1 :]
                aligned_headers = headers
                aligned_rows = []
                for row in data_rows:
                    aligned_row, aligned_headers = align_row_to_headers(row, headers)
                    aligned_rows.append(aligned_row)
                merged_rows = merge_continuation_rows(
                    aligned_rows, aligned_headers, period=header_period
                )
                # Summary lines such as "Closing Balance" are printed in the table but are not transactions.
                merged_rows = [row for row in merged_rows if not is_summary_row(row)]
                logger.info(
                    "pdf_table_detected table=%s header_row=%s headers=%s data_rows=%s coalesced_rows=%s",
                    table_index,
                    header_index,
                    aligned_headers,
                    len(data_rows),
                    len(merged_rows),
                )
                table_rows_detected += len(merged_rows)
                unsigned_is_credit = table_marks_debits_with_sign(merged_rows, aligned_headers)
                if not unsigned_is_credit:
                    # Unsigned amounts with no direction column: the running balance decides.
                    # The chain runs across tables: each starts from the balance the last one ended on.
                    merged_rows, aligned_headers = infer_directions_from_balances(
                        merged_rows, aligned_headers, running_balance
                    )
                latest = last_printed_balance(merged_rows, aligned_headers)
                if latest is not None:
                    running_balance = latest
                for row in merged_rows:
                    transaction = normalize_row(
                        row,
                        aligned_headers,
                        len(transactions) + 1,
                        unsigned_is_credit=unsigned_is_credit,
                        period=header_period,
                    )
                    if transaction:
                        previous_balance = next(
                            (item.balance for item in reversed(transactions) if item.balance is not None),
                            None,
                        )
                        split = split_same_row_fee(transaction, row, aligned_headers, previous_balance)
                        transactions.extend(split or [transaction])
                        if split:
                            table_rows_detected += 1
            raw = raw.model_copy(update={"rows_found": table_rows_detected})
        rows_rejected = max(raw.rows_found - len(transactions), 0)
        if not transactions:
            transactions, detected_rows = parse_text_rows(text, period=header_period)
            text_rows_used = True
            raw = raw.model_copy(update={"rows_found": detected_rows})
            rows_rejected = max(detected_rows - len(transactions), 0)

    classical_validation = validate_transactions(
        transactions,
        raw.extraction_method,
        raw.rows_found or len(transactions),
        rows_rejected,
    )

    # Statements are read by the deterministic extractors and OCR only; the PDF is never
    # sent to an AI provider.
    no_activity = not transactions and statement_has_no_activity(text)
    if no_activity:
        logger.info("pdf_statement_no_activity method=%s", raw.extraction_method)

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
        ai_allowed=lambda amount: consume_ai_budget(authenticated_user_id, amount),
    )
    catalog = {name.casefold(): name for name in (category_names or [])}
    transactions = [
        _with_category(transaction, classifications[str(index)], catalog)
        for index, transaction in enumerate(transactions)
    ]
    balance_checks = balance_chain_checks(transactions)
    transactions = [
        item.model_copy(update={"balance_check": status})
        for item, status in zip(transactions, balance_checks)
    ]
    balance_break_rows = [
        item.source_row for item in transactions if item.balance_check == "break"
    ]
    if no_activity:
        validation = ValidationResult(
            status="valid",
            confidence=1.0,
            warnings=[NO_ACTIVITY_MESSAGE],
            transaction_count=0,
            no_activity=True,
        )
    else:
        validation = validate_transactions(
            transactions,
            raw.extraction_method,
            raw.rows_found or len(transactions),
            rows_rejected,
        )
    # source_row means a line of the extracted text only when the text parser read the rows.
    unparsed_rows = (
        [UnparsedRow(source_row=number, text=line) for number, line in unparsed_text_rows(text, transactions)]
        if text_rows_used
        else []
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
    if not no_activity:
        reconciliation, difference = reconcile_opening_closing(
            statement.opening_balance,
            statement.closing_balance,
            transactions,
            statement.account_type,
        )
        uncertain_dates = sum(1 for item in transactions if item.date_confidence != "high")
        extra_warnings = list(validation.warnings)
        extra_warnings.extend(_coverage_warnings(statement, transactions))
        if unparsed_rows:
            extra_warnings.append(
                f"{len(unparsed_rows)} row(s) with an amount could not be read with certainty and were "
                "not added. They are listed so you can check them against the statement."
            )
        if balance_break_rows:
            extra_warnings.append(
                f"The printed balance does not follow from the previous row on "
                f"{len(balance_break_rows)} row(s) (statement rows "
                f"{', '.join(str(row) for row in balance_break_rows)}). Check those rows against the statement."
            )
        if reconciliation == "mismatch":
            extra_warnings.append(
                "Opening balance plus extracted transactions does not equal the closing balance; "
                "some activity may be missing or misread."
            )
        if uncertain_dates:
            extra_warnings.append(
                f"{uncertain_dates} transaction date(s) could not be read with full confidence."
            )
        validation = validation.model_copy(
            update={
                "opening_closing_reconciliation": reconciliation,
                "reconciliation_difference": difference,
                "transactions_with_uncertain_dates": uncertain_dates,
                "balance_break_rows": balance_break_rows,
                "warnings": extra_warnings,
                "status": "warning" if extra_warnings and validation.status == "valid" else validation.status,
            }
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
        unparsed_rows=unparsed_rows,
        statement=statement,
        statement_balance=statement_balance,
    )


#: A quiet first or last week is normal; more than this many days without rows is not.
COVERAGE_GRACE_DAYS = 7


def _coverage_warnings(statement, transactions: list[Transaction]) -> list[str]:
    """Say when the rows do not reach the period the statement declares.

    A statement that declares April to July but lists only June and July has missing months,
    and every finding built on it would be too narrow without a warning.
    """
    start, end = statement.statement_start_date, statement.statement_end_date
    if not transactions or statement.period_source != "declared" or start is None or end is None:
        return []
    first = min(item.date for item in transactions)
    last = max(item.date for item in transactions)
    warnings: list[str] = []
    if (first - start).days > COVERAGE_GRACE_DAYS:
        warnings.append(
            f"The statement period starts {start:%d %b %Y}, but the first transaction is "
            f"{first:%d %b %Y}. Transactions from {start:%d %b %Y} to {first:%d %b %Y} are not shown."
        )
    if (end - last).days > COVERAGE_GRACE_DAYS:
        warnings.append(
            f"The statement period ends {end:%d %b %Y}, but the last transaction is "
            f"{last:%d %b %Y}. Transactions from {last:%d %b %Y} to {end:%d %b %Y} are not shown."
        )
    return warnings


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
