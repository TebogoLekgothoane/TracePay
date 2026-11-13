"""Independent GoTyme text-layer parser with a running-balance proof.

The table extractor decides for itself how many rows it saw, so it cannot tell
when it dropped rows. This parser reads the text layer on its own and checks
every row against the printed running balance
(``previous - fee - debit + credit == balance``). A row that does not fit the
chain is reported, never silently accepted, which makes it a ground truth for
extraction accuracy and a cross-check for the table extractor.

The text layer can scramble wrapped rows (a date on one line, the description
on another, ``*`` decoration in empty columns), so amount direction is taken
from the balance movement rather than from the column an amount landed in.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
import re

from .models import Transaction

CENT = Decimal("0.01")

_DATE_START = re.compile(r"^(\d{2} [A-Z][a-z]{2} \d{4})\b\s*(.*)$")
_MONEY = re.compile(r"^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\d+\.\d{1,2}$|^\d{1,3}$")
_PAGE = re.compile(r"^Page \d+ of \d+$")
_HEADER_ROW = re.compile(r"^Date Details Fees\*?\(-\)")
# PyMuPDF puts each header cell on its own line; the last one ends the header.
_HEADER_LAST_CELL = "Running Balance"
# The page footer opens with the e-stamp block and runs to "Page N of M".
_FOOTER_START = "Bank Statement"
_FOOTER = re.compile(r"^\*?All bank fees are inclusive")
_NOISE_EXACT = {"GoTyme Bank", "e-Stamp", "*"}
_NOISE_PREFIX = ("Branch:",)


@dataclass
class ChainRow:
    first_line: int
    last_line: int
    date: date
    description: str
    raw_description: str
    fee: Decimal | None
    credit: Decimal | None
    debit: Decimal | None
    balance: Decimal
    expected_balance: Decimal | None = None
    status: str = "unchecked"  # opening | ok | mismatch | unresolved

    @property
    def movement(self) -> Decimal:
        return (self.credit or Decimal("0")) - (self.debit or Decimal("0")) - (self.fee or Decimal("0"))


@dataclass
class GotymeParse:
    lines_scanned: int
    rows: list[ChainRow] = field(default_factory=list)
    unresolved: list[tuple[int, str, str]] = field(default_factory=list)

    @property
    def mismatches(self) -> list[ChainRow]:
        return [row for row in self.rows if row.status == "mismatch"]

    @property
    def validated(self) -> list[ChainRow]:
        return [row for row in self.rows if row.status in {"ok", "opening"}]


def _money(token: str) -> Decimal | None:
    return Decimal(token.replace(",", "")) if _MONEY.match(token) else None


def _tail(text: str) -> tuple[str, list[str], list[str]] | None:
    """Split ``text`` into (description, numeric tail tokens, raw tail cells) or None."""
    tokens = text.replace("*", " ").split()
    tail: list[str] = []
    while tokens and (tokens[-1] == "-" or _money(tokens[-1]) is not None):
        tail.append(tokens.pop())
    tail.reverse()
    numbers = [token for token in tail if token != "-"]
    if len(numbers) < 2:
        return None
    # A dash directly after the description belongs to the description only
    # when no number precedes it; the numbers are what matter.
    return " ".join(tokens), numbers, tail


def _printed_column(cells: list[str]) -> str | None:
    """Column of the single movement when all four cells (fee, credit, debit, balance) printed."""
    if len(cells) != 4:
        return None
    filled = [name for name, cell in zip(("fee", "credit", "debit"), cells) if cell != "-"]
    return filled[0] if len(filled) == 1 else None


def _clean_lines(text: str) -> list[tuple[int, str]]:
    requested: str | None = None
    kept: list[tuple[int, str]] = []
    in_header = False
    in_footer = False
    stamp_at: int | None = None
    raw = text.splitlines()
    for index, line in enumerate(raw):
        stripped = line.strip()
        if stripped == "Date requested:" and index + 1 < len(raw):
            requested = raw[index + 1].strip()
    for number, line in enumerate(raw, start=1):
        stripped = line.strip()
        if _PAGE.match(stripped):
            in_footer = False
            in_header = True
            continue
        if in_footer:
            continue
        if in_header:
            if _HEADER_ROW.match(stripped) or stripped == _HEADER_LAST_CELL:
                in_header = False
            continue
        if stripped == "e-Stamp":
            stamp_at = len(kept)
        if stripped == _FOOTER_START:
            # Drop the address lines between the e-stamp and the footer body.
            if stamp_at is not None:
                del kept[stamp_at:]
            stamp_at = None
            in_footer = True
            continue
        if (
            not stripped
            or _FOOTER.match(stripped)
            or stripped in _NOISE_EXACT
            or stripped.startswith(_NOISE_PREFIX)
            or (requested is not None and stripped == requested)
        ):
            continue
        kept.append((number, stripped))
    return kept


def parse_gotyme_text(text: str) -> GotymeParse:
    parse = GotymeParse(lines_scanned=len(text.splitlines()))
    cleaned = _clean_lines(text)

    # Group into records: a date starts one; text after its numeric tail is
    # carried to the next record, whose own description may be empty.
    records: list[dict] = []
    carry: list[str] = []
    current: dict | None = None
    for number, line in cleaned:
        match = _DATE_START.match(line)
        if match:
            if current is not None:
                records.append(current)
            current = {"first": number, "last": number, "date": match.group(1), "parts": [], "tail": None}
            current["parts"].extend(carry)
            carry = []
            rest = match.group(2)
            if rest:
                current["parts"].append(rest)
        elif current is not None:
            if current["tail"] is not None:
                carry.append(line)
                continue
            current["parts"].append(line)
            current["last"] = number
        else:
            continue
        if current is not None and current["tail"] is None:
            split = _tail(" ".join(current["parts"]))
            if split is not None:
                current["tail"] = split
                current["last"] = number
    if current is not None:
        records.append(current)

    previous: Decimal | None = None
    for record in records:
        if record["tail"] is None:
            parse.unresolved.append((record["first"], " ".join(record["parts"])[:120], "no amount/balance found"))
            continue
        description, numbers, cells = record["tail"]
        description = description.strip(" -")
        column = _printed_column(cells)
        # The printed column says fee vs debit; without it, fall back to the wording.
        is_fee = column == "fee" if column in {"fee", "debit"} else (
            description.upper().startswith("FEE") and "REVERSAL" not in description.upper()
        )
        balance = _money(numbers[-1])
        movements = [_money(token) for token in numbers[:-1]]
        if balance is None or len(movements) != 1 or movements[0] is None:
            parse.unresolved.append((record["first"], description[:120], f"{len(movements)} movement amounts"))
            continue
        amount = movements[0]
        fee = credit = debit = None
        expected = None
        if previous is None:
            # Opening row: no previous balance, so take direction from the column or the wording.
            status = "opening"
            if is_fee:
                fee = amount
            elif column == "credit" or (
                column is None and ("REVERSAL" in description.upper() or "REFUND" in description.upper())
            ):
                credit = amount
            else:
                debit = amount
        else:
            if abs(previous - amount - balance) <= CENT:
                status = "ok"
                if is_fee:
                    fee = amount
                else:
                    debit = amount
            elif abs(previous + amount - balance) <= CENT:
                status = "ok"
                credit = amount
            else:
                status = "mismatch"
                expected = previous - amount
                debit = amount
        parse.rows.append(
            ChainRow(
                first_line=record["first"],
                last_line=record["last"],
                date=datetime.strptime(record["date"], "%d %b %Y").date(),
                description=description,
                raw_description=description,
                fee=fee,
                credit=credit,
                debit=debit,
                balance=balance,
                expected_balance=expected,
                status=status,
            )
        )
        previous = balance
    return parse


def is_gotyme_statement(text: str) -> bool:
    return "GoTyme Bank" in text and _HEADER_LAST_CELL in text


def gotyme_transactions(text: str) -> list[Transaction] | None:
    """Transactions from a GoTyme text layer, or None unless every row fits the balance chain.

    Camelot centres the dated row inside wrapped GoTyme cells, so the first
    description line lands on the previous transaction. The text layer keeps
    rows in reading order, so it is preferred whenever its chain is complete.
    """
    if not is_gotyme_statement(text):
        return None
    parse = parse_gotyme_text(text)
    if len(parse.rows) < 2 or parse.mismatches or parse.unresolved:
        return None
    transactions: list[Transaction] = []
    for row in parse.rows:
        if row.credit is not None:
            amount, kind = row.credit, "credit"
        else:
            amount, kind = -(row.debit if row.debit is not None else row.fee), "debit"
        transactions.append(
            Transaction(
                date=row.date,
                description=row.description[:500] or "GoTyme transaction",
                amount=amount,
                type=kind,
                balance=row.balance,
                source_row=row.first_line,
                confidence="high",
            ),
        )
    return transactions
