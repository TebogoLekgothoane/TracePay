"""Balance-verified transactions read straight from a PDF text layer.

Table readers can drop rows (GoTyme wrapped cells) or read a region twice
(ABSA). When the text layer lists each row as a date line, description
lines, then a signed amount line and a balance line, the printed running
balance proves the result: every row must satisfy previous + amount ==
balance. A missing or repeated row breaks that, so the text rows are used
only when the whole chain holds.
"""

from __future__ import annotations

from decimal import Decimal
import re

from .gotyme_text import gotyme_transactions
from .models import Transaction
from .normalise import parse_date

CENT = Decimal("0.01")
_MIN_ROWS = 2

# A whole line that is only a date; "2026-07-16 08:57:16" (a print stamp) is not a row.
_DATE_LINE = re.compile(r"^(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{1,2} [A-Z][a-z]{2} \d{4})$")
# "-R1 000.00", "R8 000.00", "-1,250.00", "450.00": a lone amount on its own line.
_MONEY_LINE = re.compile(r"^-?R?\s?\d{1,3}(?:[ ,]\d{3})*\.\d{2}$|^-?R?\s?\d+\.\d{2}$")


def _money(line: str) -> Decimal:
    return Decimal(re.sub(r"[R ,]", "", line))


def signed_amount_chain(text: str) -> list[Transaction] | None:
    """Rows laid out as date / description / signed amount / balance, or None."""
    lines = [line.strip() for line in text.splitlines()]
    transactions: list[Transaction] = []
    previous: Decimal | None = None
    index = 0
    while index < len(lines):
        if not _DATE_LINE.match(lines[index]):
            index += 1
            continue
        end = index + 1
        description: list[str] = []
        while end < len(lines) and not _MONEY_LINE.match(lines[end]) and not _DATE_LINE.match(lines[end]):
            if lines[end]:
                description.append(lines[end])
            end += 1
        if not (end + 1 < len(lines) and _MONEY_LINE.match(lines[end]) and _MONEY_LINE.match(lines[end + 1])):
            # A lone date (page stamp, header) without amount and balance.
            index += 1
            continue
        amount, balance = _money(lines[end]), _money(lines[end + 1])
        if previous is not None and abs(previous + amount - balance) > CENT:
            return None
        row_date = parse_date(lines[index])
        if row_date is None or not description:
            return None
        if amount == 0:
            # An unpaid debit order ("UNSUCCESSFUL INT ...") moves no money.
            previous = balance
            index = end + 2
            continue
        transactions.append(
            Transaction(
                date=row_date,
                description=" ".join(description)[:500],
                amount=amount,
                type="credit" if amount > 0 else "debit",
                balance=balance,
                source_row=index + 1,
                confidence="high",
            ),
        )
        previous = balance
        index = end + 2
    return transactions if len(transactions) >= _MIN_ROWS else None


def text_chain_transactions(text: str) -> list[Transaction] | None:
    """The first text-layer reading whose running balance holds for every row."""
    return gotyme_transactions(text) or signed_amount_chain(text)
