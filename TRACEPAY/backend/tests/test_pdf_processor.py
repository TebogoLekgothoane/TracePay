import io
from datetime import date
from decimal import Decimal

import pytest
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas

from pdf_processor.extract import InvalidPasswordError, PasswordRequiredError, extract_layers
from pdf_processor.models import Transaction
from pdf_processor.normalise import has_usable_structured_text, normalize_row, parse_amount, parse_date, parse_text_rows
from pdf_processor.tables import align_row_to_headers, is_transaction_table, merge_continuation_rows
from pdf_processor.validate import validate_transactions


def test_amount_and_date_normalisation() -> None:
    assert parse_amount("R 1,250.50") == Decimal("1250.50")
    assert parse_amount("(450.00)") == Decimal("-450.00")
    assert parse_date("18/09/26") == date(2026, 9, 18)


def test_debit_credit_columns_become_signed_canonical_amount() -> None:
    transaction = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "450.00", "", "12500.00"],
        ["date", "description", "debit", "credit", "balance"],
        2,
    )
    assert transaction is not None
    assert transaction.amount == Decimal("-450.00")
    assert transaction.type == "debit"


def test_duplicates_are_a_warning_not_silent_deletion() -> None:
    transaction = Transaction(
        date=date(2026, 9, 18),
        description="WOOLWORTHS",
        amount=Decimal("-450.00"),
        type="debit",
        balance=Decimal("12500.00"),
        source_row=2,
        confidence="medium",
    )
    result = validate_transactions([transaction, transaction], "table", 2)
    assert result.status == "warning"
    assert "duplicate" in result.warnings[0].lower()


def test_unsigned_amount_balance_row_is_rejected_instead_of_guessing() -> None:
    assert (
        normalize_row(
            ["18/09/2026", "WOOLWORTHS", "450.00", "12500.00"],
            ["date", "description", "amount", "balance"],
            2,
        )
        is None
    )


def test_signed_amount_column_preserves_direction() -> None:
    debit = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "-450.00", "12500.00"],
        ["date", "description", "amount", "balance"],
        2,
    )
    credit = normalize_row(
        ["19/09/2026", "SALARY", "+900.00", "13400.00"],
        ["date", "description", "amount", "balance"],
        3,
    )
    assert debit is not None and debit.amount == Decimal("-450.00")
    assert credit is not None and credit.amount == Decimal("900.00")


def test_camelot_separator_columns_are_aligned() -> None:
    row, headers = align_row_to_headers(
        ["18/09/2026", "WOOLWORTHS", "", "450.00", "", "0.00", "", "12550.00"],
        ["date", "description", "debit", "", "credit", "", "balance", ""],
    )
    transaction = normalize_row(row, headers, 2)
    assert transaction is not None
    assert transaction.amount == Decimal("-450.00")
    assert transaction.balance == Decimal("12550.00")


def test_password_protected_pdf_requires_and_accepts_password() -> None:
    source = io.BytesIO()
    canvas = Canvas(source)
    canvas.drawString(50, 750, "Private statement")
    canvas.save()

    encrypted = io.BytesIO()
    reader = PdfReader(io.BytesIO(source.getvalue()))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.encrypt("correct-password")
    writer.write(encrypted)
    content = encrypted.getvalue()

    with pytest.raises(PasswordRequiredError, match="password protected"):
        extract_layers(content)
    with pytest.raises(InvalidPasswordError, match="password is incorrect"):
        extract_layers(content, "wrong-password")
    raw, _, _ = extract_layers(content, "correct-password")
    assert raw.pages == 1
    assert 0 <= raw.extraction_confidence <= 1


def test_plural_bank_statement_columns_are_normalized() -> None:
    debit = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "", "", "450.00", "12550.00"],
        ["date", "details", "fees", "credits", "debits", "running balance"],
        2,
    )
    assert debit is not None
    assert debit.amount == Decimal("-450.00")


def test_extracted_statement_header_is_tracepay_shaped() -> None:
    from pdf_processor.statement_schema import resolve_extracted_statement

    transactions = [
        Transaction(
            date=date(2026, 9, 1),
            description="NETFLIX.COM",
            amount=Decimal("-199.00"),
            type="debit",
            balance=Decimal("4210.50"),
            source_row=2,
            confidence="high",
        ),
        Transaction(
            date=date(2026, 9, 15),
            description="SALARY",
            amount=Decimal("15000.00"),
            type="credit",
            balance=Decimal("19210.50"),
            source_row=3,
            confidence="high",
        ),
    ]
    text = (
        "Capitec Bank\nAccount number ****1234\nStatement period 01 Sep 2026 to 30 Sep 2026\n"
        "Opening balance R 4,409.50\nClosing balance R 19,210.50\nCheque account"
    )
    statement = resolve_extracted_statement(text, transactions)
    assert statement.bank == "Capitec"
    assert statement.account_number_last4 == "1234"
    assert statement.account_type == "cheque"


def test_summary_tables_are_not_transaction_tables() -> None:
    assert not is_transaction_table(["main account statement", ""])
    assert is_transaction_table(
        ["date", "description", "category", "money in", "money out", "fee*", "balance"],
    )


def test_description_category_header_is_normalised() -> None:
    transaction = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "", "450.00", "0.00", "12500.00"],
        ["date", "description category", "money in", "money out", "fee*", "balance"],
        2,
    )
    assert transaction is not None
    assert transaction.description == "WOOLWORTHS"
    assert transaction.amount == Decimal("-450.00")


def test_usable_classical_extract_skips_ai_fallback() -> None:
    from pdf_processor.main import _needs_ai_fallback
    from pdf_processor.models import ValidationResult

    transactions = [
        Transaction(
            date=date(2026, 9, 18),
            description="WOOLWORTHS",
            amount=Decimal("-450.00"),
            type="debit",
            source_row=2,
            confidence="medium",
        )
        for _ in range(80)
    ]
    validation = ValidationResult(
        status="warning",
        confidence=0.65,
        transaction_count=80,
        rows_detected=90,
        rows_rejected=10,
        balance_reconciliation="mismatch",
    )
    assert _needs_ai_fallback("table", validation, transactions) is False


def test_empty_or_unknown_extract_still_requests_ai() -> None:
    from pdf_processor.main import _needs_ai_fallback
    from pdf_processor.models import ValidationResult

    empty = ValidationResult(
        status="failed",
        confidence=0,
        transaction_count=0,
        rows_detected=0,
        rows_rejected=0,
    )
    assert _needs_ai_fallback("unknown", empty, []) is True


def test_gotyme_blank_separator_and_wrap() -> None:
    headers = ["date", "details", "", "fees*", "credits", "debits", "running balance"]
    row, aligned = align_row_to_headers(
        ["20/09/2025", "Grab", "", "", "1,250.00", "", "8,400.50"],
        headers,
    )
    transaction = normalize_row(row, aligned, 2)
    assert transaction is not None
    assert transaction.amount == Decimal("1250.00")

    merged = merge_continuation_rows(
        [
            ["20/09/2025", "Grab", "", "", "150.00", "1000.00"],
            ["", "Food Palawan", "", "", "", ""],
            ["21/09/2025", "Salary", "", "5000.00", "", "6000.00"],
        ],
        ["date", "details", "fees", "credits", "debits", "running balance"],
    )
    assert len(merged) == 2
    first = normalize_row(merged[0], ["date", "details", "fees", "credits", "debits", "running balance"], 2)
    assert first is not None
    assert first.description == "Grab Food Palawan"


def test_money_out_is_preferred_over_fee_column() -> None:
    transaction = normalize_row(
        ["16/09/2026", "PayShap Payment", "Transfers", "", "25.00", "15.00", "24.80"],
        ["date", "description", "category", "money in", "money out", "fee", "balance"],
        1,
    )
    assert transaction is not None
    assert transaction.amount == Decimal("-25.00")


def test_capitec_fee_correction_is_a_credit() -> None:
    transaction = normalize_row(
        ["03/08/2026", "Correction: SMS Notification Fee", "Bank Fees", "", "0.35", "0.00", "118.45"],
        ["date", "description", "category", "money in", "money out", "fee", "balance"],
        8,
    )
    assert transaction is not None
    assert transaction.type == "credit"
    assert transaction.amount == Decimal("0.35")


def test_capitec_statement_category_is_preserved() -> None:
    transaction = normalize_row(
        ["18/09/2026", "CHECKERS", "Groceries", "", "120.00", "0.00", "880.00"],
        ["date", "description", "category", "money in", "money out", "fee", "balance"],
        1,
    )
    assert transaction is not None
    assert transaction.category_name == "Groceries"


def test_gotyme_bank_from_filename_not_payee() -> None:
    from pdf_processor.statement_schema import resolve_extracted_statement

    statement = resolve_extracted_statement(
        "01/04/2025 Transfer to Capitec 250.00 800.00",
        [],
        source_filename="GoTyme_BankStatement_CurrentAccount7586.pdf",
    )
    assert statement.bank == "GoTyme"


def _text_pdf(lines: list[str]) -> bytes:
    source = io.BytesIO()
    canvas = Canvas(source)
    y = 750
    for line in lines:
        canvas.drawString(50, y, line)
        y -= 18
    canvas.save()
    return source.getvalue()


def test_pymupdf_extracts_signed_text_rows_without_camelot(monkeypatch: pytest.MonkeyPatch) -> None:
    content = _text_pdf(
        [
            "18/09/2026 TEXT PAYMENT -450.00",
            "19/09/2026 TEXT DEPOSIT +900.00",
        ]
    )
    monkeypatch.setattr(
        "pdf_processor.extract.extract_camelot_tables",
        lambda _content: (_ for _ in ()).throw(AssertionError("Camelot should not run")),
    )
    monkeypatch.setattr(
        "pdf_processor.extract.ocr_page_images",
        lambda _images: (_ for _ in ()).throw(AssertionError("OCR should not run")),
    )
    raw, text, tables = extract_layers(content)
    assert raw.extraction_method == "text"
    assert raw.extraction_confidence == 0.75
    assert tables == []
    assert "TEXT PAYMENT" in text
    rows, detected = parse_text_rows(text)
    assert detected == 2
    assert [row.amount for row in rows] == [Decimal("-450.00"), Decimal("900.00")]


def test_camelot_runs_when_pymupdf_text_is_not_structured(monkeypatch: pytest.MonkeyPatch) -> None:
    content = _text_pdf(
        [
            "Date Description Debit Credit Balance",
            "18/09/2026 WOOLWORTHS 450.00 0.00 12550.00",
            "19/09/2026 SALARY 0.00 900.00 13450.00",
        ]
    )
    table = [
        ["Date", "Description", "Debit", "Credit", "Balance"],
        ["18/09/2026", "WOOLWORTHS", "450.00", "0.00", "12550.00"],
        ["19/09/2026", "SALARY", "0.00", "900.00", "13450.00"],
    ]
    monkeypatch.setattr(
        "pdf_processor.extract.extract_camelot_tables",
        lambda _content: ([table], 0.91),
    )
    raw, _text, tables = extract_layers(content)
    assert raw.extraction_method == "table"
    assert raw.extraction_confidence == 0.91
    assert raw.tables_found == 1
    assert tables == [table]


def test_unsigned_table_text_is_not_usable_structured_text() -> None:
    text = (
        "18/09/2026 WOOLWORTHS 450.00 0.00 12550.00\n"
        "19/09/2026 SALARY 0.00 900.00 13450.00"
    )
    assert has_usable_structured_text(text) is False


def test_ocr_validation_keeps_review_warning() -> None:
    transaction = Transaction(
        date=date(2026, 9, 18),
        description="SCANNED PAYMENT",
        amount=Decimal("-450.00"),
        type="debit",
        source_row=2,
        confidence="low",
    )
    result = validate_transactions([transaction], "ocr", 1)
    assert result.confidence <= 0.75
    assert any("OCR" in warning for warning in result.warnings)


def test_process_pdf_keeps_extraction_confidence_and_canonical_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pdf_processor.main import process_pdf
    from pdf_processor.models import RawExtraction

    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: False)
    monkeypatch.setattr(
        "pdf_processor.main.extract_layers",
        lambda *_args, **_kwargs: (
            RawExtraction(
                pages=1,
                extraction_method="text",
                extraction_confidence=0.75,
                raw_text_available=True,
                useful_text_characters=120,
                tables_found=0,
                rows_found=2,
            ),
            "18/09/2026 TEXT PAYMENT -450.00\n19/09/2026 TEXT DEPOSIT +900.00",
            [],
        ),
    )
    result = process_pdf(b"%PDF", "statement.pdf", "user-id-12345678")
    assert result.raw_extraction.extraction_method == "text"
    assert result.raw_extraction.extraction_confidence == 0.75
    assert [item.amount for item in result.transactions] == [Decimal("-450.00"), Decimal("900.00")]
    assert all(item.source == "pdf" for item in result.transactions)
