import re
from dataclasses import dataclass
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


_DR_SUFFIX = re.compile(r"dr\s*$", re.IGNORECASE)
_CR_SUFFIX = re.compile(r"cr\s*$", re.IGNORECASE)


def parse_balance(value: str) -> Decimal | None:
    """A running balance with its Cr/Dr marker. Dr means overdrawn, so it is negative."""
    amount = parse_amount(value)
    if amount is None:
        return None
    if _DR_SUFFIX.search(value.strip()):
        return -abs(amount)
    return amount


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


_DIRECTION_WORD = r"\b(debit|debited|dr|withdrawal|out|credit|credited|cr|deposit|in)\b"


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
    if not date_value:
        return None
    if not description:
        # Some statements print small charges with no label (FNB: "06 Jul | 3.00 | 2,485.74Cr").
        # Keep such a row only when the balance chain has already given it a date, an amount,
        # a balance and a direction. A footer or wrapped line has none of these, so it is still
        # rejected.
        amount_marked = bool(
            _DR_SUFFIX.search(values.get("amount", "") or "") or _CR_SUFFIX.search(values.get("amount", "") or "")
        )
        direction_known = amount_marked or any(values[name] for name in values if name == "direction")
        if not (direction_known and values.get("balance") and parse_amount(values.get("amount", ""))):
            return None
        description = "No description printed"
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
            # A type such as "Transfer" or "Re-direct" names no direction, so it is no
            # evidence against the table's own rule: debits carry a sign, this one does not.
            or (unsigned_is_credit and not re.search(_DIRECTION_WORD, direction))
        ):
            signed_amount, transaction_type = abs(amount), "credit"
        # Some statements print the direction on the amount itself: "100.00Cr" is money in.
        elif _DR_SUFFIX.search(amount_value.strip()):
            signed_amount, transaction_type = -abs(amount), "debit"
        elif _CR_SUFFIX.search(amount_value.strip()):
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
        balance=parse_balance(balance_value),
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


#: Rows that carry balances, not movements. They are never transactions.
_NON_MOVEMENT_LABEL = re.compile(
    r"^(?:carried|brought)\s+forward$|^provisional\s+statement$", re.IGNORECASE
)
_MAX_INTEGER_DIGITS = 7  # R9,999,999: longer digit runs are account or reference numbers


def _standalone_money(body: str) -> list[tuple[re.Match[str], bool]]:
    """Money tokens in a row body with whether each is signed, leaving out IDs and dates.

    A printed amount stands apart from its neighbours. "-7SMS" in "eNote Service Fee -7SMS",
    "-5179920" glued to "20.00", and "-27" in the date range "25/04-27/05" are not amounts.
    """
    found: list[tuple[re.Match[str], bool]] = []
    for item in _TEXT_ROW_AMOUNT.finditer(body):
        # The match may open with the currency marker: "R -3,50" is a signed amount.
        lead = re.match(r"\s*(?:R|ZAR)?\s*", item.group(0)).end()
        token = item.group(0)[lead:]
        if not token:
            continue
        sign_at = item.start() + lead
        before = body[sign_at - 1] if sign_at > 0 else " "
        after = body[item.end()] if item.end() < len(body) else " "
        if re.match(r"[A-Za-z0-9/.\-]", before) or re.match(r"[A-Za-z0-9/]", after):
            continue
        integer_digits = len(re.sub(r"\D", "", re.split(r"[.,]", token)[0]))
        if integer_digits > _MAX_INTEGER_DIGITS:
            continue
        found.append((item, token.startswith(("-", "+", "("))))
    return found


def _row_label(body: str) -> str:
    """The description part of a row: the text before its first money token."""
    return re.split(r"\s+(?:R\s*)?[-+(]?\d", body, maxsplit=1)[0].strip()


_CENT = Decimal("0.01")


def _chain_amount(
    previous: Decimal | None, tokens: list[tuple[re.Match[str], bool]]
) -> tuple[re.Match[str], Decimal, Decimal] | None:
    """The movement and balance in a row's last two money tokens, when the balance proves it.

    The last column is the running balance and the one before it the movement. The movement
    counts only if the previous balance plus or minus it equals the printed balance, so a
    number that merely looks like an amount is never taken, and a credit printed without a
    sign is still read as a credit.
    """
    if previous is None or len(tokens) < 2:
        return None
    (amount_item, amount_signed), (balance_item, _) = tokens[-2], tokens[-1]
    amount = parse_amount(amount_item.group(0))
    balance = parse_amount(balance_item.group(0))
    if amount is None or balance is None or amount == 0:
        return None
    if not _HAS_CENTS.search(balance_item.group(0).strip()):
        return None
    size = abs(amount)
    if abs(previous + size - balance) < _CENT and not (amount_signed and amount < 0):
        return amount_item, size, balance
    if abs(previous - size - balance) < _CENT and not (amount_signed and amount > 0):
        return amount_item, -size, balance
    return None


def _tidy_ocr_money(body: str) -> str:
    """Undo two OCR slips inside money: a doubled minus ("--1,50") and a gap after the comma ("20, 00")."""
    return re.sub(r"(\d),\s+(\d{2})\b", r"\1,\2", re.sub(r"-{2,}", "-", body))


_HAS_CENTS = re.compile(r"[.,]\d{2}$")


@dataclass
class _TextRecord:
    """One dated line: a transaction read as printed, a balance-only row, or a row held back."""

    kind: str  # "row", "balance" or "held"
    balance_after: Decimal | None = None
    transaction: Transaction | None = None
    # For a held row: what is needed to build it once its direction is known.
    row_number: int = 0
    date_match: re.Match[str] | None = None
    parsed_date: ParsedDate | None = None
    description: str = ""
    amount: Decimal | None = None
    fixed_sign: bool = False


def _text_transaction(
    row_number: int,
    date_match: re.Match[str],
    parsed_date: ParsedDate,
    description: str,
    amount: Decimal,
) -> Transaction:
    return Transaction(
        date=parsed_date.value,
        description=description,
        amount=amount,
        type="credit" if amount > 0 else "debit",
        source_row=row_number,
        confidence="low",
        date_text=date_match.group(1)[:40],
        date_confidence=parsed_date.confidence if parsed_date.confidence != "none" else "low",
        date_warnings=list(parsed_date.warnings),
    )


def _clean_description(body: str, end: int) -> str:
    text = body[:end].strip(" |-:~")
    return re.sub(r"(?:\s+R)+\s*$", "", text).strip(" |-:~")


def parse_text_rows(
    text: str, *, period: tuple[date | None, date | None] | None = None
) -> tuple[list[Transaction], int]:
    """Parse transaction lines from extracted statement text.

    An amount is a signed number, or the movement a printed running balance confirms. A row
    whose balance is unreadable is held back, then recovered when the balances on either side
    of it prove its direction (see ``_recover_held_rows``).
    """
    records: list[_TextRecord] = []
    detected_rows = 0
    previous_balance: Decimal | None = None
    for row_number, line in enumerate(text.splitlines(), start=1):
        match = _TEXT_ROW_DATE.match(line.strip())
        if not match:
            continue
        detected_rows += 1
        body = _tidy_ocr_money(match.group(2))
        tokens = _standalone_money(body)
        # A balance is trusted only if printed with cents: "181,7" is a clipped "181,73".
        last = (
            parse_amount(tokens[-1][0].group(0))
            if tokens and _HAS_CENTS.search(tokens[-1][0].group(0).strip())
            else None
        )
        if _NON_MOVEMENT_LABEL.match(_row_label(body)):
            if len(tokens) >= 2 and last is not None:
                previous_balance = last
                records.append(_TextRecord("balance", balance_after=last))
            continue
        parsed_date = parse_statement_date(match.group(1), period=period)
        chained = _chain_amount(previous_balance, tokens)
        if chained is not None:
            amount_match, amount, previous_balance = chained
            known_balance: Decimal | None = previous_balance
        else:
            signed = [item for item, is_signed in tokens if is_signed]
            # The balance after this row is only known if the last column was read as a balance.
            known_balance = last if len(tokens) >= 2 and not tokens[-1][1] else None
            previous_balance = known_balance
            if len(signed) != 1:
                held = _held_row(row_number, match, parsed_date, body, tokens)
                if held is not None:
                    records.append(held)
                continue
            amount_match = signed[0]
            amount = parse_amount(amount_match.group(0))
        description = _clean_description(body, amount_match.start())
        if parsed_date.value is None or amount is None or amount == 0 or not description:
            continue
        records.append(
            _TextRecord(
                "row",
                balance_after=known_balance,
                transaction=_text_transaction(row_number, match, parsed_date, description, amount),
            )
        )
    return _repair_dropped_day_digits(_recover_held_rows(records)), detected_rows


def _held_row(
    row_number: int,
    date_match: re.Match[str],
    parsed_date: ParsedDate,
    body: str,
    tokens: list[tuple[re.Match[str], bool]],
) -> _TextRecord | None:
    """A rejected row worth a second look: one clear amount with cents, direction unknown."""
    if parsed_date.value is None:
        return None
    cents = [(item, signed) for item, signed in tokens if _HAS_CENTS.search(item.group(0).strip())]
    if not cents:
        return None
    # With a readable balance too, the amount is the token before it; otherwise the only one.
    item, signed = cents[-2] if len(cents) >= 2 else cents[0]
    amount = parse_amount(item.group(0))
    description = _clean_description(body, item.start())
    if amount is None or amount == 0 or not description:
        return None
    if signed:
        return _TextRecord(
            "held", row_number=row_number, date_match=date_match, parsed_date=parsed_date,
            description=description, amount=amount, fixed_sign=True,
        )
    return _TextRecord(
        "held", row_number=row_number, date_match=date_match, parsed_date=parsed_date,
        description=description, amount=abs(amount),
    )


def _recover_held_rows(records: list[_TextRecord]) -> list[Transaction]:
    """Read held rows back in when the balances on either side prove their direction.

    A held row sits between a row whose balance is trusted and a later row whose balance is
    trusted. What the later balance implies before that row, minus the earlier balance, is the
    net of everything in between. A held row is kept only if exactly one choice of direction
    for the held rows in that stretch makes the net add up, so nothing is guessed.
    """
    transactions: list[Transaction] = []
    anchor: Decimal | None = None  # balance after the last trusted record
    stretch: list[_TextRecord] = []
    for record in records:
        if record.kind == "held" or (record.kind == "row" and record.balance_after is None):
            stretch.append(record)
            continue
        if record.kind == "row" and record.transaction is not None:
            before = record.balance_after - record.transaction.amount
        else:
            before = record.balance_after
        if stretch and anchor is not None and before is not None:
            transactions.extend(_resolve_stretch(stretch, before - anchor))
        else:
            transactions.extend(item.transaction for item in stretch if item.transaction is not None)
        stretch = []
        anchor = record.balance_after
        if record.transaction is not None:
            transactions.append(record.transaction)
    transactions.extend(item.transaction for item in stretch if item.transaction is not None)
    return transactions


_MAX_HELD_IN_STRETCH = 8


def _resolve_stretch(stretch: list[_TextRecord], net: Decimal) -> list[Transaction]:
    known = sum((item.transaction.amount for item in stretch if item.transaction is not None), Decimal(0))
    held = [item for item in stretch if item.transaction is None]
    fixed = sum((item.amount for item in held if item.fixed_sign and item.amount is not None), Decimal(0))
    free = [item for item in held if not item.fixed_sign]
    remaining = net - known - fixed
    choices: list[tuple[int, ...]] = []
    if len(free) <= _MAX_HELD_IN_STRETCH:
        for mask in range(1 << len(free)):
            signs = tuple(1 if mask >> bit & 1 else -1 for bit in range(len(free)))
            total = sum((sign * item.amount for sign, item in zip(signs, free)), Decimal(0))
            if abs(total - remaining) < _CENT:
                choices.append(signs)
    signs_by_row: dict[int, int] = {}
    if len(choices) == 1:
        signs_by_row = {id(item): sign for item, sign in zip(free, choices[0])}
    elif not free and abs(remaining) < _CENT:
        signs_by_row = {}
    elif free:
        # Not provable: keep only the held rows whose sign was printed.
        free = []
    result: list[Transaction] = []
    for item in stretch:
        if item.transaction is not None:
            result.append(item.transaction)
        elif item.fixed_sign or id(item) in signs_by_row:
            amount = item.amount if item.fixed_sign else signs_by_row[id(item)] * item.amount
            result.append(
                _text_transaction(item.row_number, item.date_match, item.parsed_date, item.description, amount)
            )
    return result

_NOTICE_LABEL = re.compile(r"^vat\b", re.IGNORECASE)
_MAX_UNPARSED_ROWS = 200


def unparsed_text_rows(text: str, transactions: list[Transaction]) -> list[tuple[int, str]]:
    """Dated lines that carry an amount but were not read as a transaction.

    These are rows the reader could not prove, so they are handed back for the customer to
    check instead of being dropped. Balance-only rows and notices are left out.
    """
    accepted = {item.source_row for item in transactions}
    found: list[tuple[int, str]] = []
    for row_number, line in enumerate(text.splitlines(), start=1):
        match = _TEXT_ROW_DATE.match(line.strip())
        if not match or row_number in accepted:
            continue
        body = _tidy_ocr_money(match.group(2))
        label = _row_label(body)
        if _NON_MOVEMENT_LABEL.match(label) or _NOTICE_LABEL.match(label):
            continue
        if not any(_HAS_CENTS.search(item.group(0).strip()) for item, _ in _standalone_money(body)):
            continue
        found.append((row_number, line.strip()[:200]))
        if len(found) >= _MAX_UNPARSED_ROWS:
            break
    return found


_SINGLE_DIGIT_DAY = re.compile(r"^\d[/-]")


def _repair_dropped_day_digits(rows: list[Transaction]) -> list[Transaction]:
    """Restore a day whose first digit the OCR lost, using the order of the statement.

    Rows are printed oldest first. "4/05/2025" between a 23 May row and a 26 May row cannot be
    4 May, and of 14, 24 and 4 May only 24 May fits between its neighbours. A date is changed
    only when it breaks the order and exactly one candidate fits, so a correct date is never
    touched and an ambiguous one is left for the reader to check.
    """
    repaired = list(rows)
    lower = date.min
    for index, row in enumerate(repaired):
        shortened = bool(row.date_text and _SINGLE_DIGIT_DAY.match(row.date_text))
        upper = _next_anchor_date(repaired, index)
        if shortened and (row.date < lower or row.date > upper):
            candidates = [
                candidate
                for candidate in (_safe_day(row.date, tens + row.date.day) for tens in (10, 20, 30))
                if candidate is not None and lower <= candidate <= upper
            ]
            if len(candidates) == 1:
                repaired[index] = row.model_copy(
                    update={
                        "date": candidates[0],
                        "date_confidence": "medium",
                        "date_warnings": [*row.date_warnings, "day_digit_restored_from_order"],
                    }
                )
        lower = max(lower, repaired[index].date)
    return repaired


def _safe_day(base: date, day: int) -> date | None:
    try:
        return base.replace(day=day)
    except ValueError:
        return None


def _next_anchor_date(rows: list[Transaction], index: int) -> date:
    """The date of the next row whose day has two digits, which the OCR did not shorten."""
    for later in rows[index + 1 :]:
        if later.date_text and not _SINGLE_DIGIT_DAY.match(later.date_text):
            return later.date
    return date.max


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
