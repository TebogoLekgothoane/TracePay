import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .models import Transaction

_TEXT_ROW_AMOUNT = re.compile(r"(?:R|ZAR)?\s*\(?[-+]?\d[\d\s]*(?:[,.]\d{2})?\)?")
_TEXT_ROW_DATE = re.compile(
    r"^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s+(.+)$",
)

DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d/%m/%y",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%d %b %Y",
    "%d %B %Y",
    "%d %b %y",
    "%b %d %Y",
    "%b %d, %Y",
)


def parse_date(value: str) -> date | None:
    value = value.strip()
    for candidate in (value, value.split()[0] if value else ""):
        if not candidate:
            continue
        for fmt in DATE_FORMATS:
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None


def parse_amount(value: str) -> Decimal | None:
    raw = value.strip()
    if not raw:
        return None
    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    cleaned = re.sub(r"[^0-9,.-]", "", raw)
    if "," in cleaned and "." in cleaned:
        cleaned = (
            cleaned.replace(",", "")
            if cleaned.rfind(".") > cleaned.rfind(",")
            else cleaned.replace(".", "").replace(",", ".")
        )
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        amount = abs(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        return None
    return -amount if negative else amount


def normalize_row(row: list[str], headers: list[str], row_number: int) -> Transaction | None:
    values = {header: row[index].strip() if index < len(row) else "" for index, header in enumerate(headers)}
    date_value = next(
        (values[name] for name in values if name in {"date", "transaction date", "value date", "trans date"}),
        "",
    )
    description = next(
        (
            values[name]
            for name in values
            if name in {"description", "details", "narration", "narrative", "merchant"}
            or name.startswith("description")
        ),
        "",
    )
    if not date_value or not description:
        return None
    transaction_date = parse_date(date_value)
    if transaction_date is None:
        return None

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
        elif re.search(r"\b(credit|credited|cr|deposit|in)\b", direction) or amount_value.strip().startswith("+"):
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
        description=description,
        amount=signed_amount,
        type=transaction_type,
        balance=parse_amount(balance_value),
        source_row=row_number,
        currency=None,
        confidence="medium",
        reference=reference_value[:80] or None,
        category_name=statement_category[:80] or None,
        category_confidence=0.85 if statement_category else 0,
        category_rule="statement:category" if statement_category else None,
    )


def parse_text_rows(text: str) -> tuple[list[Transaction], int]:
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
        transaction_date = parse_date(match.group(1))
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
            ),
        )
    return rows, detected_rows


def has_usable_structured_text(text: str) -> bool:
    """True when PyMuPDF text already yields reliable signed transaction rows."""
    rows, detected = parse_text_rows(text)
    return detected >= 2 and len(rows) / detected >= 0.8
