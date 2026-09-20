import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .models import Transaction

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d %b %Y", "%d %B %Y")


def parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
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
        cleaned = cleaned.replace(",", "") if cleaned.rfind(".") > cleaned.rfind(",") else cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        amount = abs(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        return None
    return -amount if negative else amount


def normalize_row(row: list[str], headers: list[str], row_number: int) -> Transaction | None:
    values = {header: row[index].strip() if index < len(row) else "" for index, header in enumerate(headers)}
    date_value = next((values[name] for name in values if name in {"date", "transaction date", "value date", "trans date"}), "")
    description = next((values[name] for name in values if name in {"description", "details", "narration", "narrative", "merchant"}), "")
    if not date_value or not description:
        return None
    transaction_date = parse_date(date_value)
    if transaction_date is None:
        return None

    debit = next((parsed for name in values if name in {"debit", "withdrawal", "money out"} and values[name]
                  for parsed in [parse_amount(values[name])] if parsed not in (None, Decimal("0"))), None)
    credit = next((parsed for name in values if name in {"credit", "deposit", "money in"} and values[name]
                   for parsed in [parse_amount(values[name])] if parsed not in (None, Decimal("0"))), None)
    amount_value = next((values[name] for name in values if name in {"amount", "transaction amount", "value"} and values[name]), "")
    amount = parse_amount(amount_value) if amount_value else None
    if debit is not None:
        signed_amount, transaction_type = -abs(debit), "debit"
    elif credit is not None:
        signed_amount, transaction_type = abs(credit), "credit"
    elif amount is not None and amount != 0:
        direction = next((values[name].casefold() for name in values if name in {"type", "transaction type", "direction", "debit/credit", "dr/cr"} and values[name]), "")
        if re.search(r"\b(debit|debited|dr|withdrawal|out)\b", direction):
            signed_amount, transaction_type = -abs(amount), "debit"
        elif re.search(r"\b(credit|credited|cr|deposit|in)\b", direction):
            signed_amount, transaction_type = abs(amount), "credit"
        elif amount_value.strip().startswith(("-", "(")):
            signed_amount, transaction_type = -abs(amount), "debit"
        elif amount_value.strip().startswith("+"):
            signed_amount, transaction_type = abs(amount), "credit"
        else:
            return None
    else:
        return None

    balance_value = next((values[name] for name in values if name in {"balance", "running balance", "available balance"} and values[name]), "")
    return Transaction(
        date=transaction_date,
        description=description,
        amount=signed_amount,
        type=transaction_type,
        balance=parse_amount(balance_value),
        source_row=row_number,
        currency=None,
        confidence="medium",
    )
