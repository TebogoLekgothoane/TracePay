import io
from datetime import date, time
from decimal import Decimal

import pytest
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas

from pdf_processor.extract import InvalidPasswordError, PasswordRequiredError, extract_layers
from pdf_processor.models import Transaction
from pdf_processor.normalise import has_usable_structured_text, normalize_row, parse_amount, parse_date, parse_text_rows, parse_time
from pdf_processor.tables import align_row_to_headers, is_transaction_table, merge_continuation_rows
from pdf_processor.validate import validate_transactions


def test_amount_and_date_normalisation() -> None:
    assert parse_amount("R 1,250.50") == Decimal("1250.50")
    assert parse_amount("(450.00)") == Decimal("-450.00")
    assert parse_amount("22,000") == Decimal("22000")
    assert parse_amount("-1,500") == Decimal("-1500")
    assert parse_amount("22,000.00") == Decimal("22000.00")
    assert parse_amount("-1,500.00") == Decimal("-1500.00")
    assert parse_amount("1 500") == Decimal("1500")
    assert parse_amount("(1,500)") == Decimal("-1500")
    assert parse_amount("186,40") == Decimal("186.40")
    assert parse_amount("1.500,00") == Decimal("1500.00")
    assert parse_amount("12,3456") is None
    assert parse_date("18/09/26") == date(2026, 9, 18)
    assert parse_time("18/09/2026 14:30:05") == time(14, 30, 5)
    assert parse_time("18/09/2026") is None


def test_transaction_time_is_preserved_when_statement_has_a_time_column() -> None:
    transaction = normalize_row(
        ["18/09/2026", "14:30", "WOOLWORTHS", "450.00"],
        ["date", "time", "description", "debit"],
        2,
    )
    assert transaction is not None
    assert transaction.transaction_time == time(14, 30)


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


def test_empty_user_password_pdf_opens_without_prompt() -> None:
    """Bank PDFs often encrypt with an empty user password — Files opens them silently."""
    source = io.BytesIO()
    canvas = Canvas(source)
    canvas.drawString(50, 750, "Standard Bank statement")
    canvas.save()

    encrypted = io.BytesIO()
    reader = PdfReader(io.BytesIO(source.getvalue()))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.encrypt(user_password="", owner_password="owner-only")
    writer.write(encrypted)
    content = encrypted.getvalue()

    probe = PdfReader(io.BytesIO(content), strict=False)
    assert probe.is_encrypted

    raw, _, _ = extract_layers(content)
    assert raw.pages == 1


def test_password_candidates_include_sa_id_last_six() -> None:
    from pdf_processor.extract import _password_candidates

    assert _password_candidates(" 9001015800087 ") == [
        "9001015800087",
        "800087",
    ]
    assert _password_candidates("800087") == ["800087"]
    assert _password_candidates("90 0101 5800 087") == [
        "90 0101 5800 087",
        "9001015800087",
        "800087",
    ]


def test_password_protected_pdf_accepts_full_sa_id_when_last_six_is_password() -> None:
    source = io.BytesIO()
    canvas = Canvas(source)
    canvas.drawString(50, 750, "SBSA statement")
    canvas.save()

    encrypted = io.BytesIO()
    reader = PdfReader(io.BytesIO(source.getvalue()))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    writer.encrypt("800087")
    writer.write(encrypted)
    content = encrypted.getvalue()

    raw, _, _ = extract_layers(content, "9001015800087")
    assert raw.pages == 1


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


def test_usable_classical_extract_skips_ai_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings
    from pdf_processor.main import _needs_ai_fallback
    from pdf_processor.models import ValidationResult

    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

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
        balance_reconciliation="not_available",
    )
    assert _needs_ai_fallback("table", validation, transactions) is False


def test_balance_mismatch_requests_ai_even_when_most_rows_convert(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings
    from pdf_processor.main import _needs_ai_fallback
    from pdf_processor.models import ValidationResult

    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    transactions = [
        Transaction(
            date=date(2026, 9, 18),
            description="WOOLWORTHS",
            amount=Decimal("-450.00"),
            type="debit",
            source_row=2,
            confidence="medium",
        )
        for _ in range(90)
    ]
    validation = ValidationResult(
        status="warning",
        confidence=0.8,
        transaction_count=90,
        rows_detected=90,
        rows_rejected=0,
        balance_reconciliation="mismatch",
    )
    assert _needs_ai_fallback("table", validation, transactions) is True


def test_empty_or_unknown_extract_still_requests_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings
    from pdf_processor.main import _needs_ai_fallback
    from pdf_processor.models import ValidationResult

    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
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


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Account number: 10 28 300 663 1\n", "6631"),
        ("Account Number: 51105557586\n", "7586"),
        ("A/C No. XXXX 9876\n", "9876"),
        # "ACC" inside a product name must not pick up the postal code below it.
        ("Account holder:\nMR A EXAMPLE\nProduct name:\nMYMOACC\nEAST LONDON\nQUIGNEY\n5201\n", None),
    ],
)
def test_account_last4_handles_spaced_unmasked_and_embedded_labels(text: str, expected: str | None) -> None:
    from pdf_processor.statement_schema import _last4_from_text

    assert _last4_from_text(text) == expected


def test_standard_bank_from_to_period_with_two_digit_years() -> None:
    from pdf_processor.statement_schema import _period_from_text

    assert _period_from_text("6 month statement\nFrom: 15 Apr 26\nTo: 12 Oct 26\n") == (date(2026, 4, 15), date(2026, 10, 12))


_EMPTY_SB_TEXT = (
    "6 month statement\nFrom: 15 Apr 26\nTo: 12 Oct 26\nTransaction details\n"
    "Date\nDescription\nPayments\nDeposits\nBalance\nSTATEMENT OPENING BALANCE\n0.00\n"
    "Statement Summary\nPayments\nR0.00\nDeposits\nR0.00\n"
)


def _table_layers(text: str):
    from pdf_processor.models import RawExtraction

    raw = RawExtraction(
        pages=1,
        extraction_method="table",
        extraction_confidence=0.96,
        raw_text_available=True,
        useful_text_characters=len(text),
        tables_found=1,
        rows_found=0,
    )
    return lambda *_args, **_kwargs: (raw, text, [])


def test_zero_activity_statement_is_a_valid_empty_result_without_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    from pdf_processor.main import NO_ACTIVITY_MESSAGE, process_pdf

    def no_ai(*_args, **_kwargs):
        raise AssertionError("AI fallback must not run for an empty statement")

    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: True)
    monkeypatch.setattr("pdf_processor.main.extract_transactions_with_ai", no_ai)
    monkeypatch.setattr("pdf_processor.main.extract_layers", _table_layers(_EMPTY_SB_TEXT))

    result = process_pdf(b"%PDF", "statement.pdf", "user-id-12345678")
    assert result.transactions == []
    assert result.validation.status == "valid"
    assert result.validation.no_activity is True
    assert result.validation.errors == []
    assert result.validation.warnings == [NO_ACTIVITY_MESSAGE]
    assert (result.statement.statement_start_date, result.statement.statement_end_date) == (date(2026, 4, 15), date(2026, 10, 12))


@pytest.mark.parametrize(
    "text",
    [
        _EMPTY_SB_TEXT.replace("Deposits\nR0.00", "Deposits\nR1,250.00"),
        # Totals not printed: unreadable, not empty.
        "Date\nDescription\nPayments\nDeposits\nBalance\n",
    ],
)
def test_statement_with_activity_or_no_summary_still_fails_when_no_rows_extract(
    monkeypatch: pytest.MonkeyPatch, text: str
) -> None:
    from pdf_processor.main import process_pdf

    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: False)
    monkeypatch.setattr("pdf_processor.main.extract_layers", _table_layers(text))

    result = process_pdf(b"%PDF", "statement.pdf", "user-id-12345678")
    assert result.validation.status == "failed"
    assert result.validation.no_activity is False


_CAPITEC_HEADERS = ["date", "description", "category", "money in", "money out", "fee", "balance"]


def _capitec_split(row: list[str], previous_balance: str):
    from pdf_processor.normalise import split_same_row_fee

    transaction = normalize_row(row, _CAPITEC_HEADERS, 5)
    assert transaction is not None
    return transaction, split_same_row_fee(transaction, row, _CAPITEC_HEADERS, Decimal(previous_balance))


def test_capitec_same_row_fee_becomes_its_own_debit_when_the_balance_deducts_it() -> None:
    transaction, split = _capitec_split(
        ["01/10/2025", "Banking App External PayShap Payment: Example", "Transfer", "", "-3 000.00", "-6.00", "228.00"],
        "3234.00",
    )
    assert split is not None
    payment, fee = split
    assert (payment.amount, payment.balance) == (Decimal("-3000.00"), Decimal("234.00"))
    assert (fee.amount, fee.type, fee.balance, fee.source_row) == (Decimal("-6.00"), "debit", Decimal("228.00"), 6)
    assert fee.description == "Fee: Banking App External PayShap Payment: Example"
    assert reconcile_balances_from([Decimal("3234.00")], [payment, fee]) == "verified"


def test_same_row_fee_is_not_split_when_the_balance_does_not_deduct_it() -> None:
    # The fee is charged on a separate row, so splitting would double-count it.
    _transaction, split = _capitec_split(
        ["16/09/2026", "PayShap Payment", "Transfers", "", "25.00", "15.00", "24.80"],
        "49.80",
    )
    assert split is None


def test_refunded_fee_on_a_correction_becomes_a_credit() -> None:
    transaction, split = _capitec_split(
        ["04/12/2025", "Banking App Correction: Prepaid Purchase", "Cellphone", "25.00", "", "0.50", "91.54"],
        "66.04",
    )
    assert split is not None
    payment, refund = split
    assert payment.amount == Decimal("25.00")
    assert (refund.amount, refund.type) == (Decimal("0.50"), "credit")
    assert refund.description.startswith("Fee refund: ")


def reconcile_balances_from(opening: list[Decimal], rows: list[Transaction]) -> str:
    previous = opening[0]
    for row in rows:
        if abs(previous + row.amount - (row.balance or Decimal("0"))) > Decimal("0.01"):
            return "mismatch"
        previous = row.balance or Decimal("0")
    return "verified"


def test_wrapped_reference_numbers_join_the_description_and_layout_noise_is_dropped() -> None:
    merged = merge_continuation_rows(
        [
            ["01/10/2025", "Banking App External PayShap Payment: Example", "Children &", "", "-3 000.00", "-6.00", "228.00"],
            ["", "", "Dependants", "", "", "", ""],
            ["", "2715149863", "", "", "", "", ""],
            ["", "", "", "", "", "* Includes VAT at 15%", ""],
            ["02/10/2025", "Payment Received: Example", "Other Income", "500.00", "", "", "728.00"],
        ],
        _CAPITEC_HEADERS,
    )
    assert [row[1] for row in merged] == [
        "Banking App External PayShap Payment: Example 2715149863",
        "Payment Received: Example",
    ]
