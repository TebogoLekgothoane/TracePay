"""Balance-verified text-layer reading (ABSA layout) and the table fixes it came with."""

from datetime import date
from decimal import Decimal

from pdf_processor.normalise import normalize_row, table_marks_debits_with_sign
from pdf_processor.tables import canonical_header, is_transaction_table
from pdf_processor.text_chain import signed_amount_chain

# PyMuPDF text of an ABSA-style page: one cell per line, wrapped descriptions,
# a print stamp with a bare date between pages, and an unpaid debit order.
_ABSA_TEXT = """Statement for the Period 2026-04-16 - 2026-07-16
Date
Transaction Description
Amount
Balance
Balance Brought Forward
2026-06-01
MONTHLY ACC FEE
-R115.00
-R111.83
2026-06-02
NPF CREDIT EXAMPLE EMPLOYER/
PAYROLL
R8 000.00
R7 888.17
2026-06-02
PayShap Ext Debit example
-R1 000.00
R6 888.17
eStamp
Ref: 0000000000000000
2026-07-16
To confirm this statement call
2026-07-16 08:57:16
Page
2
of
2
Date
Transaction Description
Amount
Balance
2026-06-02
TRANSACTION FEE PayShap Ext Debit (EFF:020626 AMT:
1000,00-)
-R5.50
R6 882.67
2026-06-30
UNSUCCESSFUL INT EXAMPLE LOAN
R0.00
R6 882.67
2026-07-01
DIGITAL PAYMENT DT ABSA BANK example
-R882.67
R6 000.00
Balance Carried Forward
R6 000.00
"""


def test_absa_text_chain_reads_every_row_once_and_skips_unpaid_debit_orders() -> None:
    transactions = signed_amount_chain(_ABSA_TEXT)
    assert transactions is not None
    assert [(t.date, t.amount, t.type) for t in transactions] == [
        (date(2026, 6, 1), Decimal("-115.00"), "debit"),
        (date(2026, 6, 2), Decimal("8000.00"), "credit"),
        (date(2026, 6, 2), Decimal("-1000.00"), "debit"),
        (date(2026, 6, 2), Decimal("-5.50"), "debit"),
        (date(2026, 7, 1), Decimal("-882.67"), "debit"),
    ]
    assert transactions[1].description == "NPF CREDIT EXAMPLE EMPLOYER/ PAYROLL"
    assert transactions[3].description == "TRANSACTION FEE PayShap Ext Debit (EFF:020626 AMT: 1000,00-)"
    assert transactions[-1].balance == Decimal("6000.00")


def test_text_chain_is_not_used_when_a_row_breaks_the_running_balance() -> None:
    # A repeated or missing row cannot fit previous + amount == balance.
    assert signed_amount_chain(_ABSA_TEXT.replace("R6 888.17", "R6 889.17")) is None


def test_absa_headers_are_recognised() -> None:
    headers = [canonical_header(cell) for cell in ("D\nate", "Transaction Description", "Amount", "Balance")]
    assert headers == ["date", "transaction description", "amount", "balance"]
    assert is_transaction_table(headers)


def test_unsigned_amount_is_a_credit_only_when_the_table_signs_its_debits() -> None:
    headers = ["date", "transaction description", "amount", "balance"]
    rows = [
        ["2026-06-01", "MONTHLY ACC FEE", "-R115.00", "-R111.83"],
        ["2026-06-02", "NPF CREDIT EXAMPLE", "R8 000.00", "R7 888.17"],
    ]
    assert table_marks_debits_with_sign(rows, headers)
    credit = normalize_row(rows[1], headers, 2, unsigned_is_credit=True)
    assert credit is not None and (credit.amount, credit.type) == (Decimal("8000.00"), "credit")
    # Without evidence that debits are signed, an unsigned amount is still not guessed.
    assert not table_marks_debits_with_sign([rows[1]], headers)
    assert normalize_row(rows[1], headers, 2) is None
