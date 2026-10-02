import re
from datetime import date
from decimal import Decimal

from .models import StatementBalance, Transaction
from .normalise import parse_amount, parse_date

_CLOSING_LABEL = re.compile(
    r"(?:closing\s+bal(?:ance)?|end(?:ing)?\s+balance|final\s+balance|balance\s+brought\s+forward\s+to)",
    re.IGNORECASE,
)
_MONEY = re.compile(
    r"(?:R|ZAR)?\s*"
    r"\(?[-+]?"
    r"(?:\d{1,3}(?:[,\s\u00a0]\d{3})+|\d+)"
    r"(?:[.,]\d{2})?"
    r"\)?",
    re.IGNORECASE,
)
_DATE = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b"
)


def _money_candidates(line: str) -> list[Decimal]:
    # Strip dates so day/month fragments are not parsed as amounts.
    scrubbed = _DATE.sub(" ", line)
    values: list[Decimal] = []
    for match in _MONEY.finditer(scrubbed):
        token = match.group(0).strip()
        if not token or token in {"-", "+", "(", ")"}:
            continue
        # Ignore bare integers under 100 (often leftover date fragments).
        if re.fullmatch(r"\(?[-+]?\d{1,2}\)?", token):
            continue
        parsed = parse_amount(token)
        if parsed is not None:
            values.append(parsed)
    return values


def _closing_from_text(text: str) -> StatementBalance | None:
    if not text.strip():
        return None
    lines = text.splitlines()
    # Prefer matches near the end of the statement.
    search_from = max(0, len(lines) - 80)
    candidates: list[tuple[int, Decimal, date | None]] = []
    for index, line in enumerate(lines[search_from:], start=search_from):
        if not _CLOSING_LABEL.search(line):
            continue
        window = line
        if index + 1 < len(lines):
            window = f"{line} {lines[index + 1]}"
        amounts = _money_candidates(window)
        if not amounts:
            continue
        amount = amounts[-1]
        date_match = _DATE.search(window)
        as_of = parse_date(date_match.group(1)) if date_match else None
        candidates.append((index, amount, as_of))
    if not candidates:
        return None
    # Last closing-balance mention in the scanned window wins.
    _, amount, as_of = candidates[-1]
    return StatementBalance(
        amount=amount,
        as_of_date=as_of,
        source="closing_balance",
    )


def _running_from_transactions(
    transactions: list[Transaction],
) -> StatementBalance | None:
    with_balance = [item for item in transactions if item.balance is not None]
    if not with_balance:
        return None
    latest = max(with_balance, key=lambda item: (item.source_row, item.date))
    return StatementBalance(
        amount=latest.balance,
        as_of_date=latest.date,
        source="running_balance",
    )


def resolve_statement_balance(
    text: str,
    transactions: list[Transaction],
) -> StatementBalance:
    closing = _closing_from_text(text)
    running = _running_from_transactions(transactions)
    if closing is not None:
        if closing.as_of_date is None and transactions:
            closing = closing.model_copy(
                update={"as_of_date": max(item.date for item in transactions)},
            )
        # Prefer running balance when a printed closing of 0 looks like a false match.
        if (
            closing.amount == 0
            and running is not None
            and running.amount is not None
            and running.amount != 0
        ):
            return running
        return closing
    if running is not None:
        return running
    return StatementBalance(amount=None, as_of_date=None, source="unavailable")
