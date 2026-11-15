import re
from datetime import date
from decimal import Decimal

from .models import ExtractedStatement, StatementBalance, Transaction
from .normalise import parse_amount, parse_date
from .statement_balance import resolve_statement_balance
from .statement_figures import extract_printed_figures

_BANK_ALIASES = (
    ("gotyme", "GoTyme"),
    ("go tyme", "GoTyme"),
    ("tymebank", "TymeBank"),
    ("tyme bank", "TymeBank"),
    ("standard bank", "Standard Bank"),
    ("first national", "FNB"),
    ("discovery bank", "Discovery Bank"),
    ("african bank", "African Bank"),
    ("capitec", "Capitec"),
    ("nedbank", "Nedbank"),
    ("investec", "Investec"),
    ("absa", "Absa"),
    ("fnb", "FNB"),
)

# Whole-word label on the same line as the number, which may be spaced ("10 28 300 663 1")
# or masked ("****1234"); the label must not match inside words like "MYMOACC".
_LAST4 = re.compile(
    r"\b(?:account(?:[ \t]*(?:number|no\.?))?|acc[ \t]*no\.?|a/c(?:[ \t]*no\.?)?)(?![a-z])"
    r"[ \t:#.\-]*((?:[\d*xX•]+[ \t]?)+)",
    re.IGNORECASE,
)
_PERIOD = re.compile(
    r"(?:period|statement\s+period|from)\s*[:\-]?\s*"
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})"
    r"\s*(?:to|-|–|—)\s*:?\s*"
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})",
    re.IGNORECASE,
)
_OPENING = re.compile(
    r"(?:opening\s+bal(?:ance)?|balance\s+(?:b/f|brought\s+forward)|opening\s+bal)",
    re.IGNORECASE,
)
_ACCOUNT_TYPE = re.compile(
    r"\b(cheque|current|savings|credit\s*card|debit\s*card|transmission|flexi)\b",
    re.IGNORECASE,
)
_MONEY = re.compile(
    r"(?:R|ZAR)?\s*\(?[-+]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,]\d{2})?\)?",
    re.IGNORECASE,
)
_DATE = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b"
)


def resolve_extracted_statement(
    text: str,
    transactions: list[Transaction],
    *,
    bank: str | None = None,
    account_number_last4: str | None = None,
    account_type: str | None = None,
    statement_start_date: date | None = None,
    statement_end_date: date | None = None,
    opening_balance: Decimal | None = None,
    closing_balance: Decimal | None = None,
    source_filename: str | None = None,
) -> ExtractedStatement:
    # Prefer letterhead/filename over payee names in the transaction body.
    header = (text or "")[:2000]
    resolved_bank = bank or _bank_from_text(header, source_filename)
    last4 = _digits4(account_number_last4) or _last4_from_text(header)
    resolved_type = account_type or _account_type_from_text(header)
    if resolved_type is None and re.search(r"credit\s+limit", text or "", re.IGNORECASE):
        # A card statement prints a credit limit; a bank account does not. Amounts on a card are
        # owed, so the reconciliation must read them that way.
        resolved_type = "credit_card"
    start, end = statement_start_date, statement_end_date
    if start is None or end is None:
        parsed_start, parsed_end = _period_from_text(text or "")
        start = start or parsed_start
        end = end or parsed_end
    # A period read from the statement is evidence of coverage. One taken from
    # the first and last transaction is not: the days at either edge may hold
    # activity that was never extracted.
    period_source = "declared" if start is not None and end is not None else "unknown"
    if start is None and transactions:
        start = min(item.date for item in transactions)
        period_source = "inferred"
    if end is None and transactions:
        end = max(item.date for item in transactions)
        period_source = "inferred"

    carried_opening, carried_closing = _carry_balances(text)
    opening = opening_balance if opening_balance is not None else _labelled_amount(text, _OPENING)
    if opening is None:
        opening = _opening_from_first_row(text, transactions)
    if opening is None:
        opening = carried_opening
    balance = resolve_statement_balance(text, transactions)
    if balance.source == "unavailable" and carried_closing is not None:
        balance = StatementBalance(
            amount=carried_closing[0], as_of_date=carried_closing[1], source="closing_balance"
        )
    closing = closing_balance
    if closing is None or (closing == 0 and balance.amount not in (None, 0)):
        closing = balance.amount
        if end is None:
            end = balance.as_of_date

    return ExtractedStatement(
        bank=resolved_bank,
        account_number_last4=last4,
        account_type=resolved_type,
        statement_start_date=start,
        statement_end_date=end or balance.as_of_date,
        opening_balance=opening,
        closing_balance=closing,
        balance_source=balance.source if closing is not None else "unavailable",
        period_source=period_source,
        printed_figures=extract_printed_figures(text),
    )


def period_from_text(text: str) -> tuple[date | None, date | None]:
    """The statement period printed in the header, if any (never inferred)."""
    return _period_from_text(text or "")


_DATED_LINE = re.compile(
    r"^\W*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b"
)


def _letterhead(text: str) -> str:
    """The statement text above its first dated row: the letterhead and account block.

    Counterparty names inside the transaction rows (a payment to "Capitec" on a Nedbank
    statement, for example) must not decide which bank issued the statement.
    """
    lines: list[str] = []
    for line in (text or "").splitlines():
        if _DATED_LINE.match(line.strip()):
            break
        lines.append(line)
    return "\n".join(lines)


def _bank_from_text(text: str, source_filename: str | None = None) -> str | None:
    """The issuing bank, from the letterhead first, then the filename, then the start of the text."""
    for haystack in (
        _letterhead(text).casefold(),
        _filename_text(source_filename).casefold(),
        (text or "")[:2000].casefold(),
    ):
        for needle, label in _BANK_ALIASES:
            if re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack):
                return label
    return None


def _filename_text(source_filename: str | None) -> str:
    if not source_filename:
        return ""
    stem = re.sub(r"[\\/]+", " ", source_filename).rsplit(".", 1)[0]
    return stem.replace("_", " ").replace("-", " ")


_ACTIVITY_TOTALS = (
    re.compile(r"^(?:total\s+)?(?:payments|debits?|money\s+out|withdrawals)\b[\s:]*(.*)$", re.IGNORECASE),
    re.compile(r"^(?:total\s+)?(?:deposits|credits?|money\s+in)\b[\s:]*(.*)$", re.IGNORECASE),
)
_PLAIN_MONEY = re.compile(r"(?:R|ZAR)?\s*(-?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{2})?)", re.IGNORECASE)


def statement_has_no_activity(text: str) -> bool:
    """True when the printed summary shows zero money out and zero money in.

    Every labelled total must be zero, and both sides must be printed, so an
    unreadable statement is never mistaken for an empty one.
    """
    lines = [line.strip() for line in text.splitlines()]
    totals: list[list[Decimal]] = [[], []]
    for index, line in enumerate(lines):
        for side, label in enumerate(_ACTIVITY_TOTALS):
            match = label.match(line)
            if not match:
                continue
            candidate = match.group(1) or (lines[index + 1] if index + 1 < len(lines) else "")
            money = _PLAIN_MONEY.fullmatch(candidate)
            if money:
                totals[side].append(Decimal(re.sub(r"[,\s]", "", money.group(1))))
    return all(totals) and all(amount == 0 for side in totals for amount in side)


def _last4_from_text(text: str) -> str | None:
    for match in _LAST4.finditer(text):
        last4 = _digits4(match.group(1))
        if last4:
            return last4
    return None


def _digits4(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    return digits[-4:] if len(digits) >= 4 else None


def _account_type_from_text(text: str) -> str | None:
    match = _ACCOUNT_TYPE.search(text)
    if not match:
        return None
    token = re.sub(r"\s+", " ", match.group(1).strip().lower())
    if "credit" in token:
        return "credit_card"
    if "debit" in token:
        return "debit_card"
    if token in {"cheque", "current", "transmission", "flexi"}:
        return "cheque"
    if token == "savings":
        return "savings"
    return None


def _period_from_text(text: str) -> tuple[date | None, date | None]:
    head = (text or "")[:2000]
    match = _PERIOD.search(head)
    if match:
        return parse_date(match.group(1)), parse_date(match.group(2))
    labelled = _period_after_label(head)
    if labelled[0] is not None:
        return labelled
    return _period_from_edge_labels(text)


# A statement period can run a little over a year. Two dates further apart than that
# are not the period.
_MAX_STATED_PERIOD_DAYS = 400
_EDGE_DATE = re.compile(
    r"^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})$"
)
_FROM_EDGE = re.compile(r"^(?:from(?:\s+date)?|statement\s+from)\s*:?\s*(.*)$", re.IGNORECASE)
_TO_EDGE = re.compile(r"^(?:to(?:\s+date)?|statement\s+to)\s*:?\s*(.*)$", re.IGNORECASE)


def _date_on_its_own(value: str) -> date | None:
    """A line that is only a date. A transaction row starts with a date and then a payee."""
    text = value.strip()
    if not text or _EDGE_DATE.match(text) is None:
        return None
    return parse_date(text)


def _period_from_edge_labels(text: str) -> tuple[date | None, date | None]:
    """``From Date`` and ``To Date`` when each value is on the following line.

    Some statements print the two labels down one column and the dates down the next,
    so the text comes out as a label, then the date, then the other label.
    """
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()][:160]
    start = end = None
    for index, line in enumerate(lines):
        for pattern, which in ((_FROM_EDGE, "from"), (_TO_EDGE, "to")):
            match = pattern.match(line)
            if match is None:
                continue
            candidate = match.group(1).strip()
            if not candidate and index + 1 < len(lines):
                candidate = lines[index + 1]
            parsed = _date_on_its_own(candidate)
            if parsed is None:
                continue
            if which == "from" and start is None:
                start = parsed
            elif which == "to" and end is None:
                end = parsed
    if start is None or end is None or start > end:
        return None, None
    if (end - start).days > _MAX_STATED_PERIOD_DAYS:
        return None, None
    return start, end


_PERIOD_LABEL = re.compile(r"statement\s+period", re.IGNORECASE)


def _period_after_label(text: str) -> tuple[date | None, date | None]:
    """The period when OCR split "From" and "To" onto separate lines.

    Scanned layouts put the label, the two dates and the words From and To in boxes that read
    out in a different order. The two dates that follow the label are the period.
    """
    lines = (text or "").splitlines()
    for index, line in enumerate(lines[:80]):
        if not _PERIOD_LABEL.search(line):
            continue
        window = " ".join(lines[index : index + 6])
        found = [parse_date(item) for item in _DATE.findall(window)]
        dates = [item for item in found if item is not None]
        if len(dates) >= 2 and dates[0] <= dates[1]:
            return dates[0], dates[1]
    return None, None


def _carry_balances(text: str) -> tuple[Decimal | None, tuple[Decimal, date | None] | None]:
    """Opening and closing balance from the carry rows some banks print instead of labels.

    The first dated row "BROUGHT FORWARD" holds the opening balance, and a last dated row
    "CARRIED FORWARD" the closing one. Both must be the statement's own first and last rows,
    so a carry row at a page break is never taken.
    """
    from .normalise import (
        _HAS_CENTS,
        _NOTICE_LABEL,
        _TEXT_ROW_DATE,
        _row_label,
        _standalone_money,
        _tidy_ocr_money,
    )

    rows: list[tuple[str, Decimal | None, str]] = []
    for line in (text or "").splitlines():
        match = _TEXT_ROW_DATE.match(line.strip())
        if not match:
            continue
        body = _tidy_ocr_money(match.group(2))
        label = _row_label(body).upper()
        tokens = _standalone_money(body)
        balance = None
        if len(tokens) >= 2 and _HAS_CENTS.search(tokens[-1][0].group(0).strip()):
            balance = parse_amount(tokens[-1][0].group(0))
        rows.append((label, balance, match.group(1)))
    opening = None
    for label, balance, _date_text in rows:
        if label.startswith("BROUGHT FORWARD"):
            opening = balance
            break
        if balance is not None:
            break  # a real row came first, so a later brought-forward is a page break
        # A dated header line (the period "From" date) carries no balance: keep looking.
    closing = None
    for label, balance, date_text in reversed(rows):
        if label.startswith("PROVISIONAL") or label.startswith("BROUGHT FORWARD") or _NOTICE_LABEL.match(label):
            continue
        if label.startswith("CARRIED FORWARD") and balance is not None:
            closing = (balance, parse_date(date_text))
        break
    return opening, closing


def _first_money(line: str) -> Decimal | None:
    scrubbed = _DATE.sub(" ", line)
    for match in _MONEY.finditer(scrubbed):
        parsed = parse_amount(match.group(0))
        if parsed is not None and abs(parsed) >= 1:
            return parsed
    return None


_BROUGHT_FORWARD = re.compile(r"balance\s+brought\s+forward", re.IGNORECASE)


def _opening_from_first_row(text: str, transactions: list[Transaction]) -> Decimal | None:
    """Some statements print "Balance Brought Forward" with no figure beside it (Absa).

    The first row's printed balance, less that row's own movement, is the balance it started
    from. Only used when the label is printed, and the reconciliation check still tests it
    against the closing balance.
    """
    if not _BROUGHT_FORWARD.search(text or ""):
        return None
    rows = sorted(
        (item for item in transactions if item.balance is not None),
        key=lambda item: (item.source_row, item.date),
    )
    if not rows:
        return None
    first = rows[0]
    return first.balance - first.amount


def printed_opening_balance(text: str) -> Decimal | None:
    """The opening balance as printed, negative when marked Dr (overdrawn)."""
    lines = text.splitlines()
    for index, line in enumerate(lines[:80]):
        if not _OPENING.search(line):
            continue
        window = line if index + 1 >= len(lines) else f"{line} {lines[index + 1]}"
        amount = _first_money(window)
        if amount is not None:
            return -abs(amount) if re.search(r"\d\s*dr\b", window, re.IGNORECASE) else abs(amount)
    return None


def _labelled_amount(text: str, label: re.Pattern[str]) -> Decimal | None:
    lines = text.splitlines()
    for index, line in enumerate(lines[:80]):
        if not label.search(line):
            continue
        window = line if index + 1 >= len(lines) else f"{line} {lines[index + 1]}"
        amount = _first_money(window)
        if amount is not None:
            return amount
    return None
