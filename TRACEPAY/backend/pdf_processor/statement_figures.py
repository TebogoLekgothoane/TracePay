"""Read the figures a statement prints outside its transaction rows.

Statement text arrives as a label on one line and its value on the next. A figure is read
only when its exact label is followed straight away by a value of the right kind; a label
with nothing after it (redacted, blank, or followed by another label) gives ``None``.
Nothing is estimated, summed or carried over from another statement.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from .models import PrintedFigures
from .normalise import parse_date

_PERCENT = re.compile(r"^(\d{0,3}(?:\.\d+)?)\s?%$")
# A printed amount, optionally marked Cr or Dr ("532.63 Dr"). The marker is not needed here: a
# fee or limit is a size, and the sign of a balance is read elsewhere.
_AMOUNT = re.compile(
    r"^(?:R|ZAR)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})|\d+\.\d{2})\s*(?:Cr|Dr)?$", re.IGNORECASE
)
_DATE = re.compile(r"^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$")

# The summary and header sit in the first pages; later pages repeat only the date.
_SCAN_LINES = 160


def _label(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


_AMOUNT_LABELS = {
    "facility": "facility",
    "facility limit": "facility",
    "credit limit": "credit_limit",
    "card purchases": "card_purchases",
    "online banking payments": "online_payments",
    "deposits / payments received": "deposits_received",
    "fees": "fees_total",
    "interest paid": "interest_paid",
    "interest received": "interest_received",
    # FNB-style "Bank Charges" block: the fee lines sum to the statement's fee total.
    "service fees": "service_fees",
    "other fees": "other_fees",
    "total vat": "vat",
    "total vat (zar)": "vat",
}
# Fee lines that add to the fee total but are not shown on their own.
_FEE_PART_LABELS = {"cash deposit fees", "cash handling fees"}
_PERCENT_LABELS = {
    "debit interest rate": "debit_interest_rate",
    "credit interest rate": "credit_interest_rate",
    "debit rate": "debit_interest_rate",
    "credit rate": "credit_interest_rate",
}


def _percent(value: str) -> Decimal | None:
    match = _PERCENT.match(value.strip())
    if not match or not match.group(1):
        return None
    try:
        return Decimal(match.group(1))
    except InvalidOperation:
        return None


def _amount(value: str) -> Decimal | None:
    match = _AMOUNT.match(value.strip())
    if not match:
        return None
    return Decimal(re.sub(r"[,\s]", "", match.group(1)))


def extract_printed_figures(text: str) -> PrintedFigures | None:
    """The printed header and summary figures, or ``None`` when the statement prints none."""
    lines = [line.strip() for line in (text or "").splitlines()]
    lines = [line for line in lines if line][:_SCAN_LINES]
    found: dict[str, Decimal | date] = {}
    fee_parts: list[Decimal] = []
    for index, line in enumerate(lines[:-1]):
        # Asterisks are footnote marks ("Credit Rate**", "Debit Rate*"), not part of the label.
        label = _label(line).replace("*", "").strip()
        following = lines[index + 1]
        if label == "statement date" and "statement_date" not in found and _DATE.match(following):
            parsed = parse_date(following)
            if parsed is not None:
                found["statement_date"] = parsed
        elif label in _PERCENT_LABELS and _PERCENT_LABELS[label] not in found:
            rate = _percent(following)
            if rate is not None:
                found[_PERCENT_LABELS[label]] = rate
        elif label in _AMOUNT_LABELS and _AMOUNT_LABELS[label] not in found:
            amount = _amount(following)
            if amount is not None:
                found[_AMOUNT_LABELS[label]] = amount
        elif label in _FEE_PART_LABELS:
            amount = _amount(following)
            if amount is not None:
                fee_parts.append(amount)
    # The statement's fee total is the sum of its printed fee lines (VAT is printed separately).
    fee_lines = [found[k] for k in ("service_fees", "other_fees") if k in found]  # type: ignore[misc]
    if "fees_total" not in found and fee_lines:
        found["fees_total"] = sum(fee_lines + fee_parts, Decimal("0"))  # type: ignore[arg-type]
    figures = PrintedFigures(**found)  # type: ignore[arg-type]
    return None if figures.is_empty() else figures
