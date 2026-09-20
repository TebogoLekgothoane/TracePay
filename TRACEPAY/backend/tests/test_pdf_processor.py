import io
from datetime import date
from decimal import Decimal

import pytest
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas

from pdf_processor.extract import InvalidPasswordError, PasswordRequiredError, extract_layers
from pdf_processor.models import Transaction
from pdf_processor.normalise import normalize_row, parse_amount, parse_date
from pdf_processor.tables import align_row_to_headers
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
    transaction = Transaction(date=date(2026, 9, 18), description="WOOLWORTHS", amount=Decimal("-450.00"), type="debit", balance=Decimal("12500.00"), source_row=2, confidence="medium")
    result = validate_transactions([transaction, transaction], "table", 2)
    assert result.status == "warning"
    assert "duplicate" in result.warnings[0].lower()


def test_unsigned_amount_balance_row_is_rejected_instead_of_guessing() -> None:
    transaction = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "450.00", "12500.00"],
        ["date", "description", "amount", "balance"],
        2,
    )
    assert transaction is None


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
    assert debit is not None and debit.amount == Decimal("-450.00") and debit.type == "debit"
    assert credit is not None and credit.amount == Decimal("900.00") and credit.type == "credit"


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


def test_plural_bank_statement_columns_are_normalized() -> None:
    debit = normalize_row(
        ["18/09/2026", "WOOLWORTHS", "", "", "450.00", "12550.00"],
        ["date", "details", "fees", "credits", "debits", "running balance"],
        2,
    )
    assert debit is not None
    assert debit.description == "WOOLWORTHS"
    assert debit.amount == Decimal("-450.00")
    assert debit.balance == Decimal("12550.00")
