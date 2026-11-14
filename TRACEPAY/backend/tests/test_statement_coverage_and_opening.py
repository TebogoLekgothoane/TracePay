"""A declared period the rows do not reach is flagged, and a brought-forward balance with no
figure is derived from the first row."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from pdf_processor.main import _coverage_warnings
from pdf_processor.models import Transaction
from pdf_processor.statement_schema import _opening_from_first_row


def _tx(day, amount, balance, row):
    return Transaction(
        date=day,
        description=f"row {row}",
        amount=Decimal(amount),
        type="debit" if Decimal(amount) < 0 else "credit",
        balance=Decimal(balance),
        source_row=row,
        confidence="high",
    )


def _statement(start, end, source="declared"):
    return SimpleNamespace(statement_start_date=start, statement_end_date=end, period_source=source)


def test_rows_that_start_well_after_the_declared_period_are_flagged():
    rows = [_tx(date(2026, 6, 1), "-115.00", "-111.83", 1), _tx(date(2026, 7, 15), "-5.00", "-116.83", 2)]
    warnings = _coverage_warnings(_statement(date(2026, 4, 16), date(2026, 7, 16)), rows)
    assert any("16 Apr 2026" in w and "01 Jun 2026" in w for w in warnings)


def test_a_quiet_first_week_is_within_the_grace_period():
    rows = [_tx(date(2026, 4, 20), "-5.00", "100.00", 1), _tx(date(2026, 7, 14), "-5.00", "90.00", 2)]
    assert _coverage_warnings(_statement(date(2026, 4, 16), date(2026, 7, 16)), rows) == []


def test_no_warning_when_the_period_is_not_declared():
    rows = [_tx(date(2026, 6, 1), "-5.00", "100.00", 1)]
    assert _coverage_warnings(_statement(date(2026, 4, 16), date(2026, 7, 16), "inferred"), rows) == []


def test_brought_forward_balance_is_the_first_row_balance_less_its_movement():
    rows = [_tx(date(2026, 6, 1), "-115.00", "-111.83", 1), _tx(date(2026, 6, 2), "8000.00", "7888.17", 2)]
    text = "Balance Brought Forward\n2026-06-01\nMONTHLY ACC FEE"
    assert _opening_from_first_row(text, rows) == Decimal("3.17")


def test_no_derived_opening_without_the_brought_forward_label():
    rows = [_tx(date(2026, 6, 1), "-115.00", "-111.83", 1)]
    assert _opening_from_first_row("Transaction History", rows) is None
