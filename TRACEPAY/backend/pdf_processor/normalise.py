import re
from datetime import date, time
from decimal import Decimal, InvalidOperation

from .dates import ParsedDate, parse_statement_date
from .models import Transaction

# Thousands groups must stay inside the amount token. Stopping at the first
# comma turned "+22,000.00" into 22.00 before parse_amount could see it.
_TEXT_ROW_AMOUNT = re.compile(
    r"(?:R|ZAR)?\s*"
    r"\(?[-+]?"
    r"(?:\d{1,3}(?:[ ,]\d{3})+|\d+)"
    r"(?:[.,]\d{2})?"
    r"\)?"
)
_TEXT_ROW_DATE = re.compile(
    r"^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}"
    r"|\d{1,2}\s?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s\d{4})?)\s+(.+)$",
    re.IGNORECASE,
)

def parse_time(value: str) -> time | None:
    match = re.search(r"\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b", value.strip())
    if not match:
        return None
    try:
        return time(int(match.group(1)), int(match.group(2)), int(match.group(3) or 0))
    except ValueError:
        return None


def parse_date(value: str) -> date | None:
    """Full-date parse kept for callers that only need the value.

    Year-less dates return ``None`` here because no statement period is
    available; use ``parse_statement_date`` when provenance matters.
    """
    return parse_statement_date(value).value


# 22,000 is thousands. 186,40 stays a decimal comma. Other comma shapes are
# not interpreted.
_THOUSANDS_GROUPS = re.compile(r"\d{1,3}(?:,\d{3})+")
_DECIMAL_COMMA = re.compile(r"\d+,\d{1,2}")
_PLAIN_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def parse_amount(value: str) -> Decimal | None:
    raw = value.strip()
    if not raw:
        return None
    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    cleaned = re.sub(r"[^0-9,.-]", "", raw)
    if cleaned.startswith("-"):
        negative = True
        cleaned = cleaned[1:]
    normalized = _normalize_amount_body(cleaned)
    if normalized is None:
        return None
    try:
        amount = abs(Decimal(normalized))
    except (InvalidOperation, ValueError):
        return None
    return -amount if negative else amount


def _normalize_amount_body(cleaned: str) -> str | None:
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(".") > cleaned.rfind(","):
            body = cleaned.replace(",", "")
        else:
            body = cleaned.replace(".", "").replace(",", ".")
        return body if _PLAIN_NUMBER.fullmatch(body) else None
    if "," not in cleaned:
        return cleaned if _PLAIN_NUMBER.fullmatch(cleaned) else None
    if _THOUSANDS_GROUPS.fullmatch(cleaned):
        return cleaned.replace(",", "")
    if _DECIMAL_COMMA.fullmatch(cleaned):
        return cleaned.replace(",", ".")
    return None


_TRANSACTION_DATE_HEADERS = ("transaction date", "date", "trans date", "tran date")
# Last-resort headers: used only when no transaction date column exists.
_NON_TRANSACTION_DATE_HEADERS = frozenset(
    {"posting date", "booking date", "post date", "value date"}
)


def _pick_date_cell(values: dict[str, str]) -> tuple[str, str]:
    """Choose the transaction-date column by precedence, not column order.

    ``value date`` and ``posting date`` columns can appear before the
    transaction date, so the first date-like header must not win.
    """
    for header in (*_TRANSACTION_DATE_HEADERS, "posting date", "booking date", "post date", "value date"):
        if values.get(header):
            return values[header], header
    return "", ""


def _date_confidence(parsed: ParsedDate, warnings: list[str]) -> str:
    if parsed.confidence in {"low", "medium"}:
        return parsed.confidence
    return "medium" if any(w.startswith("date_is_") for w in warnings) else "high"


def _secondary_date(
    text: str, transaction_date: date, period: tuple[date | None, date | None] | None
) -> date | None:
    if not text:
        return None
    parsed = parse_statement_date(text, period=period)
    return parsed.value


def normalize_row(
    row: list[str],
    headers: list[str],
    row_number: int,
    *,
    unsigned_is_credit: bool = False,
    period: tuple[date | None, date | None] | None = None,
) -> Transaction | None:
    """Build one transaction from a table row.

    ``unsigned_is_credit``: the table's amount column marks debits with a sign
    (ABSA "-R115.00" vs "R8 000.00"), so an unsigned amount is a credit.
    Without that evidence an unsigned single amount is rejected, not guessed.
    """
    values = {header: row[index].strip() if index < len(row) else "" for index, header in enumerate(headers)}
    date_value, date_header = _pick_date_cell(values)
    value_date_text = next(
        (values[name] for name in values if name == "value date" and values[name]), ""
    )
    posting_date_text = next(
        (
            values[name]
            for name in values
            if name in {"posting date", "booking date", "post date"} and values[name]
        ),
        "",
    )
    description = next(
        (
            values[name]
            for name in values
            if name in {"description", "details", "narration", "narrative", "merchant"}
            or name.startswith("description")
            or name.endswith(" description")
        ),
        "",
    )
    if not date_value or not description:
        return None
    parsed_date = parse_statement_date(date_value, period=period)
    if parsed_date.value is None:
        return None
    transaction_date = parsed_date.value
    date_warnings = list(parsed_date.warnings)
    if date_header in _NON_TRANSACTION_DATE_HEADERS:
        # The statement only prints a value/posting date, so the transaction
        # date itself is unknown. Keep the date but say what it really is.
        date_warnings.append(f"date_is_{date_header.replace(' ', '_')}")
    confidence = _date_confidence(parsed_date, date_warnings)

    debit = next(
        (
            parsed
            for name in values
            if name in {"debit", "debits", "withdrawal", "money out"} and values[name]
            for parsed in [parse_amount(values[name])]
            if parsed not in (None, Decimal("0"))
        ),
        None,
    )
    credit = next(
        (
            parsed
            for name in values
            if name in {"credit", "credits", "deposit", "money in"} and values[name]
            for parsed in [parse_amount(values[name])]
            if parsed not in (None, Decimal("0"))
        ),
        None,
    )
    fee = next(
        (
            parsed
            for name in values
            if name in {"fee", "fees", "bank fee"} and values[name]
            for parsed in [parse_amount(values[name])]
            if parsed not in (None, Decimal("0"))
        ),
        None,
    )
    amount_value = next(
        (values[name] for name in values if name in {"amount", "transaction amount", "value"} and values[name]),
        "",
    )
    amount = parse_amount(amount_value) if amount_value else None

    # Prefer money-out/in. Use fee only when there is no other movement (avoids Capite double-count).
    if debit is not None:
        signed_amount, transaction_type = -abs(debit), "debit"
    elif credit is not None:
        signed_amount, transaction_type = abs(credit), "credit"
    elif fee is not None:
        signed_amount, transaction_type = -abs(fee), "debit"
    elif amount is not None and amount != 0:
        direction = next(
            (
                values[name].casefold()
                for name in values
                if name in {"type", "transaction type", "direction", "debit/credit", "dr/cr"} and values[name]
            ),
            "",
        )
        if re.search(r"\b(debit|debited|dr|withdrawal|out)\b", direction) or amount_value.strip().startswith(("-", "(")):
            signed_amount, transaction_type = -abs(amount), "debit"
        elif (
            re.search(r"\b(credit|credited|cr|deposit|in)\b", direction)
            or amount_value.strip().startswith("+")
            or (unsigned_is_credit and not direction)
        ):
            signed_amount, transaction_type = abs(amount), "credit"
        else:
            return None
    else:
        return None

    if transaction_type == "debit" and re.search(r"\b(correction|reversal)\b", description, re.I):
        signed_amount, transaction_type = abs(signed_amount), "credit"

    balance_value = next(
        (
            values[name]
            for name in values
            if name in {"balance", "running balance", "available balance", "balance after"} and values[name]
        ),
        "",
    )
    reference_value = next(
        (
            values[name]
            for name in values
            if name in {"reference", "ref", "ref no", "reference number"} and values[name]
        ),
        "",
    )
    statement_category = next(
        (values[name].strip() for name in values if name == "category" and values[name].strip()),
        "",
    )
    return Transaction(
        date=transaction_date,
        transaction_time=parse_time(date_value)
        or parse_time(next((values[name] for name in values if name in {"time", "transaction time"} and values[name]), "")),
        description=description,
        amount=signed_amount,
        type=transaction_type,
        balance=parse_amount(balance_value),
        source_row=row_number,
        currency=None,
        confidence="medium",
        date_text=date_value[:40],
        date_confidence=confidence,
        date_warnings=date_warnings,
        value_date=_secondary_date(value_date_text, transaction_date, period),
        booking_date=_secondary_date(posting_date_text, transaction_date, period),
        reference=reference_value[:80] or None,
        category_name=statement_category[:80] or None,
        category_confidence=0.85 if statement_category else 0,
        category_rule="statement:category" if statement_category else None,
    )


def parse_text_rows(
    text: str, *, period: tuple[date | None, date | None] | None = None
) -> tuple[list[Transaction], int]:
    """Parse signed-amount transaction lines from extracted statement text."""
    rows: list[Transaction] = []
    detected_rows = 0
    for row_number, line in enumerate(text.splitlines(), start=1):
        match = _TEXT_ROW_DATE.match(line.strip())
        if not match:
            continue
        detected_rows += 1
        amounts = list(_TEXT_ROW_AMOUNT.finditer(match.group(2)))
        signed_amounts = [
            item for item in amounts if item.group(0).lstrip().startswith(("-", "+", "("))
        ]
        if len(signed_amounts) != 1:
            continue
        amount_match = signed_amounts[0]
        parsed_date = parse_statement_date(match.group(1), period=period)
        transaction_date = parsed_date.value
        amount = parse_amount(amount_match.group(0))
        description = match.group(2)[: amount_match.start()].strip(" |-:")
        if transaction_date is None or amount is None or not description:
            continue
        rows.append(
            Transaction(
                date=transaction_date,
                description=description,
                amount=amount,
                type="credit" if amount > 0 else "debit",
                source_row=row_number,
                confidence="low",
                date_text=match.group(1)[:40],
                date_confidence=parsed_date.confidence if parsed_date.confidence != "none" else "low",
                date_warnings=list(parsed_date.warnings),
            ),
        )
    return rows, detected_rows


def has_usable_structured_text(text: str) -> bool:
    """True when PyMuPDF text already yields reliable signed transaction rows."""
    rows, detected = parse_text_rows(text)
    return detected >= 2 and len(rows) / detected >= 0.8


_FEE_HEADERS = {"fee", "fees", "bank fee"}
_MOVEMENT_HEADERS = {"debit", "debits", "withdrawal", "money out", "credit", "credits", "deposit", "money in"}


def split_same_row_fee(
    transaction: Transaction,
    row: list[str],
    headers: list[str],
    previous_balance: Decimal | None,
) -> tuple[Transaction, Transaction] | None:
    """Split a fee printed beside a payment into its own row when the balance proves it.

    ``normalize_row`` keeps only the payment when a row has both. Some banks
    (Capitec) deduct both on that row, others print the fee again as its own
    row, so the fee is split out only when previous + amount - fee == balance.
    A positive fee next to a correction is a refunded fee and becomes a credit.
    Returns (payment with its balance before the fee, fee row) or None.
    """
    if previous_balance is None or transaction.balance is None:
        return None
    values = {header: row[index].strip() if index < len(row) else "" for index, header in enumerate(headers)}
    printed_fee = next(
        (parsed for name in values if name in _FEE_HEADERS and values[name]
         for parsed in [parse_amount(values[name])] if parsed not in (None, Decimal("0"))),
        None,
    )
    has_movement = any(
        parse_amount(values[name]) not in (None, Decimal("0"))
        for name in values if name in _MOVEMENT_HEADERS and values[name]
    )
    if printed_fee is None or not has_movement:
        return None
    # Signed as printed first (Capitec: "-6.00" charge, "0.50" refund); unsigned means a charge.
    fee = next(
        (
            candidate
            for candidate in (printed_fee, -abs(printed_fee))
            if abs(previous_balance + transaction.amount + candidate - transaction.balance) <= Decimal("0.01")
        ),
        None,
    )
    if fee is None:
        return None
    payment = transaction.model_copy(update={"balance": transaction.balance - fee})
    fee_row = Transaction(
        date=transaction.date,
        transaction_time=transaction.transaction_time,
        description=f"{'Fee' if fee < 0 else 'Fee refund'}: {transaction.description}"[:500],
        amount=fee,
        type="debit" if fee < 0 else "credit",
        balance=transaction.balance,
        source_row=transaction.source_row + 1,
        confidence=transaction.confidence,
        reference=transaction.reference,
        category_name="Bank Fees",
        category_confidence=0.85,
        category_rule="statement:same-row-fee",
    )
    return payment, fee_row


_SINGLE_AMOUNT_HEADERS = {"amount", "transaction amount", "value"}


def table_marks_debits_with_sign(rows: list[list[str]], headers: list[str]) -> bool:
    """True when the single amount column prints debits as negative ("-R115.00")."""
    columns = [index for index, header in enumerate(headers) if header in _SINGLE_AMOUNT_HEADERS]
    return any(
        row[index].strip().startswith(("-", "("))
        for row in rows
        for index in columns
        if index < len(row) and parse_amount(row[index]) not in (None, Decimal("0"))
    )
