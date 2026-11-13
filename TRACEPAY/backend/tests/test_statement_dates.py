"""Date handling: formats, year-less dates, value/posting dates, embedded dates."""

from datetime import date
from decimal import Decimal

import pytest

from pdf_processor.dates import (
    find_embedded_dates,
    infer_years_from_sequence,
    parse_statement_date,
)
from pdf_processor.models import Transaction
from pdf_processor.normalise import normalize_row, parse_date, parse_text_rows
from pdf_processor.validate import reconcile_opening_closing

PERIOD_DEC_JAN = (date(2025, 12, 1), date(2026, 1, 31))


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2025-03-14", date(2025, 3, 14)),
        ("14/03/2025", date(2025, 3, 14)),
        ("14-03-2025", date(2025, 3, 14)),
        ("14.03.2025", date(2025, 3, 14)),
        ("14 Mar 2025", date(2025, 3, 14)),
        ("14 March 2025", date(2025, 3, 14)),
        ("14Mar2025", None),  # no separator: not a layout any supported bank prints
        ("Mar 14, 2025", date(2025, 3, 14)),
        ("14/03/25", date(2025, 3, 14)),
        ("29/02/2024", date(2024, 2, 29)),
    ],
)
def test_supported_formats(text: str, expected: date | None) -> None:
    assert parse_statement_date(text).value == expected


def test_impossible_dates_are_rejected_not_adjusted() -> None:
    assert parse_statement_date("30/02/2025").value is None
    assert parse_statement_date("31/04/2025").value is None
    assert parse_statement_date("29/02/2025").value is None
    assert parse_statement_date("2025-13-01").value is None


def test_month_end_and_year_end_dates() -> None:
    assert parse_statement_date("31/12/2025").value == date(2025, 12, 31)
    assert parse_statement_date("01/01/2026").value == date(2026, 1, 1)
    assert parse_statement_date("28/02/2025").value == date(2025, 2, 28)


def test_day_first_is_assumed_and_flagged_when_nothing_disambiguates() -> None:
    parsed = parse_statement_date("03/04/2025")
    assert parsed.value == date(2025, 4, 3)
    assert parsed.confidence == "medium"
    assert "day_first_assumed" in parsed.warnings


def test_unambiguous_day_first_is_high_confidence() -> None:
    parsed = parse_statement_date("25/04/2025")
    assert parsed.value == date(2025, 4, 25)
    assert parsed.confidence == "high"


def test_period_can_prefer_month_first_only_when_day_first_cannot_fit() -> None:
    period = (date(2025, 3, 1), date(2025, 3, 31))
    parsed = parse_statement_date("03/15/2025", period=period)
    assert parsed.value == date(2025, 3, 15)
    assert parsed.confidence == "low"
    inside = parse_statement_date("03/04/2025", period=(date(2025, 4, 1), date(2025, 4, 30)))
    assert inside.value == date(2025, 4, 3)
    assert inside.confidence == "high"
    month_first = parse_statement_date("04/03/2025", period=(date(2025, 4, 1), date(2025, 4, 30)))
    assert month_first.value == date(2025, 4, 3)
    assert "month_first_reading_fits_statement_period" in month_first.warnings


def test_yearless_date_takes_year_from_period_across_year_end() -> None:
    december = parse_statement_date("28 Dec", period=PERIOD_DEC_JAN)
    january = parse_statement_date("02 Jan", period=PERIOD_DEC_JAN)
    assert december.value == date(2025, 12, 28)
    assert january.value == date(2026, 1, 2)
    assert december.year_was_inferred and december.confidence == "medium"
    assert "year_inferred_from_statement_period" in january.warnings


def test_yearless_date_without_a_period_is_not_guessed() -> None:
    parsed = parse_statement_date("28 Dec")
    assert parsed.value is None
    assert parsed.confidence == "none"
    assert "year_missing_no_statement_period" in parsed.warnings


def test_yearless_date_outside_period_is_not_guessed() -> None:
    parsed = parse_statement_date("15 Jun", period=PERIOD_DEC_JAN)
    assert parsed.value is None
    assert "date_outside_statement_period" in parsed.warnings


def test_yearless_date_in_a_period_longer_than_a_year_is_ambiguous() -> None:
    parsed = parse_statement_date("15 Mar", period=(date(2024, 1, 1), date(2025, 12, 31)))
    assert parsed.value is None
    assert "year_ambiguous_long_period" in parsed.warnings


def test_numeric_yearless_date_is_placed_only_when_one_reading_fits() -> None:
    unique = parse_statement_date("25/12", period=PERIOD_DEC_JAN)
    assert unique.value == date(2025, 12, 25)
    ambiguous = parse_statement_date("03/04", period=(date(2025, 3, 1), date(2025, 4, 30)))
    assert ambiguous.value is None
    assert "ambiguous_day_month_and_year" in ambiguous.warnings


def test_only_the_leading_date_is_read() -> None:
    parsed = parse_statement_date("05/03/2026 DEBIT ORDER 01/02/2026 NETFLIX")
    assert parsed.value == date(2026, 3, 5)


def test_embedded_description_dates_are_found_but_never_used() -> None:
    description = "DEBIT ORDER 01/02/2026 NETFLIX 2026-01-15 AUTH 12 Jan"
    assert find_embedded_dates(description) == ["01/02/2026", "2026-01-15", "12 Jan"]
    assert parse_statement_date(description).value is None


def test_text_row_uses_leading_date_not_description_date() -> None:
    rows, detected = parse_text_rows(
        "07/03/2026 DEBIT ORDER 01/02/2026 GYM -450.00 9550.00\n",
    )
    assert detected == 1
    assert rows[0].date == date(2026, 3, 7)
    assert rows[0].date_text == "07/03/2026"
    assert rows[0].amount == Decimal("-450.00")


def test_text_rows_with_yearless_dates_use_the_statement_period() -> None:
    text = "28 Dec Shoprite -120.00\n02 Jan Salary +25,000.00\n"
    rows, _ = parse_text_rows(text, period=PERIOD_DEC_JAN)
    assert [row.date for row in rows] == [date(2025, 12, 28), date(2026, 1, 2)]
    assert all(row.date_confidence == "medium" for row in rows)
    assert all("year_inferred_from_statement_period" in row.date_warnings for row in rows)
    unplaced, detected = parse_text_rows(text)
    assert unplaced == [] and detected == 2


def test_transaction_date_wins_over_value_date_regardless_of_column_order() -> None:
    headers = ["value date", "transaction date", "description", "debit", "balance"]
    row = ["03/03/2026", "28/02/2026", "CARD PURCHASE CHECKERS", "150.00", "1850.00"]
    transaction = normalize_row(row, headers, 1)
    assert transaction is not None
    assert transaction.date == date(2026, 2, 28)
    assert transaction.value_date == date(2026, 3, 3)
    assert transaction.date_confidence == "high"
    assert transaction.date_text == "28/02/2026"


def test_posting_date_column_is_kept_separate() -> None:
    headers = ["date", "posting date", "description", "credit"]
    transaction = normalize_row(["27/02/2026", "02/03/2026", "SALARY ACME", "20000.00"], headers, 1)
    assert transaction is not None
    assert transaction.date == date(2026, 2, 27)
    assert transaction.booking_date == date(2026, 3, 2)


def test_value_date_only_statement_flags_that_transaction_date_is_unknown() -> None:
    headers = ["value date", "description", "debit"]
    transaction = normalize_row(["03/03/2026", "ATM WITHDRAWAL", "500.00"], headers, 1)
    assert transaction is not None
    assert transaction.date == date(2026, 3, 3)
    assert transaction.date_confidence == "medium"
    assert "date_is_value_date" in transaction.date_warnings


def test_legacy_parse_date_keeps_existing_behaviour() -> None:
    assert parse_date("2026-01-31") == date(2026, 1, 31)
    assert parse_date("31/01/2026 12:30") == date(2026, 1, 31)
    assert parse_date("not a date") is None
    assert parse_date("28 Dec") is None


def test_sequence_inference_rolls_the_year_back_from_the_end_anchor() -> None:
    rows = [(28, 12), (30, 12), (2, 1), (15, 1)]
    inferred = infer_years_from_sequence(rows, date(2026, 1, 31), anchor_is_last=True)
    assert inferred == [date(2025, 12, 28), date(2025, 12, 30), date(2026, 1, 2), date(2026, 1, 15)]


def test_sequence_inference_stops_at_a_row_that_breaks_the_order() -> None:
    # Newest-first rows from a start anchor; the third row jumps backwards.
    rows = [(5, 1), (10, 1), (3, 1), (20, 1)]
    inferred = infer_years_from_sequence(rows, date(2026, 1, 1), anchor_is_last=False)
    assert inferred[0] == date(2026, 1, 5)
    assert inferred[1] == date(2026, 1, 10)
    assert inferred[2] is not None  # 3 Jan next year is within 366 days of 10 Jan
    # ...but a real calendar impossibility is never filled in.
    impossible = infer_years_from_sequence([(31, 2)], date(2026, 3, 1), anchor_is_last=True)
    assert impossible == [None]


def _tx(amount: str) -> Transaction:
    value = Decimal(amount)
    return Transaction(
        date=date(2026, 1, 5),
        description="X",
        amount=value,
        type="credit" if value > 0 else "debit",
        source_row=1,
        confidence="high",
    )


def test_opening_closing_reconciliation_verified() -> None:
    status, difference = reconcile_opening_closing(
        Decimal("1000"), Decimal("1850"), [_tx("-150"), _tx("1000")]
    )
    assert status == "verified" and difference == 0


def test_opening_closing_reconciliation_reports_the_missing_amount() -> None:
    status, difference = reconcile_opening_closing(
        Decimal("1000"), Decimal("1000"), [_tx("-150")]
    )
    assert status == "mismatch"
    assert difference == Decimal("150")


def test_credit_card_owed_balance_convention_is_accepted() -> None:
    # Owed R2,000; spent R300; paid R500 -> owed R1,800 printed as a positive number.
    status, _ = reconcile_opening_closing(
        Decimal("2000"), Decimal("1800"), [_tx("-300"), _tx("500")], "credit_card"
    )
    assert status == "verified"
    cheque_status, _ = reconcile_opening_closing(
        Decimal("2000"), Decimal("1800"), [_tx("-300"), _tx("500")], "cheque"
    )
    assert cheque_status == "mismatch"


def test_reconciliation_is_not_attempted_without_both_balances() -> None:
    assert reconcile_opening_closing(None, Decimal("1"), [_tx("-1")]) == ("not_available", None)
    assert reconcile_opening_closing(Decimal("1"), Decimal("1"), []) == ("not_available", None)


# ---------------------------------------------------------------- end to end


def _statement_pdf(lines: list[str]) -> bytes:
    import io

    from reportlab.pdfgen.canvas import Canvas

    buffer = io.BytesIO()
    canvas = Canvas(buffer)
    y = 800
    for line in lines:
        canvas.drawString(40, y, line)
        y -= 20
    canvas.save()
    return buffer.getvalue()


def test_yearless_statement_across_year_end_is_read_with_the_printed_period() -> None:
    from pdf_processor.main import process_pdf

    result = process_pdf(
        _statement_pdf(
            [
                "Capitec Bank Statement",
                "Account number 1234 5678 91",
                "Statement period: 01/12/2025 to 31/01/2026",
                "Opening balance 1000.00",
                "28 Dec Checkers Sandton -120.00 880.00",
                "30 Dec Salary Acme +25000.00 25880.00",
                "02 Jan Netflix.com -199.00 25681.00",
                "15 Jan Uber Trip -88.00 25593.00",
                "Closing balance 25593.00",
            ]
        ),
        "s.pdf",
        "user-1",
    )
    assert [item.date for item in result.transactions] == [
        date(2025, 12, 28), date(2025, 12, 30), date(2026, 1, 2), date(2026, 1, 15),
    ]
    assert [item.date_text for item in result.transactions] == ["28 Dec", "30 Dec", "02 Jan", "15 Jan"]
    assert all(item.date_confidence == "medium" for item in result.transactions)
    assert result.statement.period_source == "declared"
    assert result.statement.statement_start_date == date(2025, 12, 1)
    assert result.validation.opening_closing_reconciliation == "verified"
    assert result.validation.transactions_with_uncertain_dates == 4
    assert any("could not be read with full confidence" in w for w in result.validation.warnings)


def test_yearless_statement_without_a_printed_period_does_not_invent_years() -> None:
    from pdf_processor.main import process_pdf

    result = process_pdf(
        _statement_pdf(
            [
                "Capitec Bank Statement",
                "28 Dec Checkers Sandton -120.00 880.00",
                "30 Dec Salary Acme +25000.00 25880.00",
            ]
        ),
        "s.pdf",
        "user-1",
    )
    # Rows whose year cannot be established are rejected, never dated by guesswork.
    assert result.transactions == []
    assert result.validation.status == "failed"
    assert result.validation.rows_detected == 2 and result.validation.rows_rejected == 2


def test_a_statement_without_a_printed_period_is_marked_as_inferred() -> None:
    from pdf_processor.main import process_pdf

    result = process_pdf(
        _statement_pdf(
            [
                "Capitec Bank Statement",
                "18/09/2026 Checkers Sandton -120.00 880.00",
                "19/09/2026 Salary Acme +500.00 1380.00",
            ]
        ),
        "s.pdf",
        "user-1",
    )
    assert result.statement.period_source == "inferred"
    assert result.statement.statement_start_date == date(2026, 9, 18)


def test_a_mismatching_closing_balance_is_reported_not_hidden() -> None:
    from pdf_processor.main import process_pdf

    result = process_pdf(
        _statement_pdf(
            [
                "Capitec Bank Statement",
                "Statement period: 01/03/2026 to 31/03/2026",
                "Opening balance 1000.00",
                "05/03/2026 Checkers Sandton -120.00 880.00",
                "06/03/2026 Salary Acme +500.00 1380.00",
                "Closing balance 2000.00",
            ]
        ),
        "s.pdf",
        "user-1",
    )
    assert result.validation.opening_closing_reconciliation == "mismatch"
    assert result.validation.reconciliation_difference == Decimal("620.00")
    assert result.validation.status == "warning"
