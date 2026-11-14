"""Per-row running-balance checks."""

from datetime import date
from decimal import Decimal

from pdf_processor.models import Transaction
from pdf_processor.validate import balance_chain_checks, reconcile_balances


def _row(source_row: int, amount: str, balance: str | None) -> Transaction:
    return Transaction(
        date=date(2025, 3, source_row),
        description=f"row {source_row}",
        amount=Decimal(amount),
        type="debit" if Decimal(amount) < 0 else "credit",
        balance=Decimal(balance) if balance is not None else None,
        source_row=source_row,
        confidence="high",
    )


def test_consistent_chain_matches_on_every_checked_row():
    rows = [
        _row(1, "-100.00", "900.00"),
        _row(2, "50.00", "950.00"),
        _row(3, "-25.50", "924.50"),
    ]
    assert balance_chain_checks(rows) == ["unchecked", "match", "match"]
    assert reconcile_balances(rows) == "verified"


def test_only_the_misread_row_is_flagged_and_the_chain_continues():
    rows = [
        _row(1, "-100.00", "900.00"),
        _row(2, "-20.00", "880.00"),
        # Printed balance is 10 out: the row after it should still check against 800.
        _row(3, "-80.00", "810.00"),
        _row(4, "-10.00", "800.00"),
    ]
    assert balance_chain_checks(rows) == ["unchecked", "match", "break", "match"]
    assert reconcile_balances(rows) == "mismatch"


def test_rows_without_a_printed_balance_are_unchecked_but_count_as_movement():
    rows = [
        _row(1, "-100.00", "900.00"),
        _row(2, "-30.00", None),
        _row(3, "-20.00", "850.00"),
    ]
    assert balance_chain_checks(rows) == ["unchecked", "unchecked", "match"]
    assert reconcile_balances(rows) == "verified"


def test_a_single_balance_cannot_be_checked():
    rows = [_row(1, "-100.00", "900.00"), _row(2, "-5.00", None)]
    assert balance_chain_checks(rows) == ["unchecked", "unchecked"]
    assert reconcile_balances(rows) == "not_available"


def test_a_difference_within_two_cents_still_matches():
    # 900.00 - 10.00 = 890.00; printed 889.98 is exactly two cents out, which still matches.
    rows = [_row(1, "-100.00", "900.00"), _row(2, "-10.00", "889.98")]
    assert balance_chain_checks(rows) == ["unchecked", "match"]


