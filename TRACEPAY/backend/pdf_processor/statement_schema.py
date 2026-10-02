import re
from datetime import date
from decimal import Decimal

from .models import ExtractedStatement, Transaction
from .normalise import parse_amount, parse_date
from .statement_balance import resolve_statement_balance

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

_LAST4 = re.compile(
    r"(?:account(?:\s*number)?|acc(?:ount)?(?:\s*no\.?)?|a/c)[^\d]{0,24}(?:\*+|x+|•+)?\s*(\d{4})\b",
    re.IGNORECASE,
)
_PERIOD = re.compile(
    r"(?:period|statement\s+period|from)\s*[:\-]?\s*"
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})"
    r"\s*(?:to|-|–|—)\s*"
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
    start, end = statement_start_date, statement_end_date
    if start is None or end is None:
        parsed_start, parsed_end = _period_from_text(header)
        start = start or parsed_start
        end = end or parsed_end
    if start is None and transactions:
        start = min(item.date for item in transactions)
    if end is None and transactions:
        end = max(item.date for item in transactions)

    opening = opening_balance if opening_balance is not None else _labelled_amount(text, _OPENING)
    balance = resolve_statement_balance(text, transactions)
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
    )


def _bank_from_text(text: str, source_filename: str | None = None) -> str | None:
    haystack = f"{text}\n{_filename_text(source_filename)}".casefold()
    for needle, label in _BANK_ALIASES:
        if re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack):
            return label
    return None


def _filename_text(source_filename: str | None) -> str:
    if not source_filename:
        return ""
    stem = re.sub(r"[\\/]+", " ", source_filename).rsplit(".", 1)[0]
    return stem.replace("_", " ").replace("-", " ")


def _last4_from_text(text: str) -> str | None:
    match = _LAST4.search(text)
    return match.group(1) if match else None


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
    match = _PERIOD.search(text)
    if not match:
        return None, None
    return parse_date(match.group(1)), parse_date(match.group(2))


def _first_money(line: str) -> Decimal | None:
    scrubbed = _DATE.sub(" ", line)
    for match in _MONEY.finditer(scrubbed):
        parsed = parse_amount(match.group(0))
        if parsed is not None and abs(parsed) >= 1:
            return parsed
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
