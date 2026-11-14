import logging
import os
import re
import tempfile
from typing import Any

from decimal import Decimal

logger = logging.getLogger("tracepay.pdf.tables")

_DATE_HEADERS = {"date", "transaction date", "value date", "trans date"}
_DESCRIPTION_HEADERS = {"description", "details", "narration", "narrative", "merchant"}
# A money cell holds only an amount ("-3 000.00", "R1,250.00 Cr", "-20.00 *"),
# never prose like "* Includes VAT at 15%".
_MONEY_CELL = re.compile(r"[\s*R()+\-]*\d[\d\s,.]*[\s*()\-]*(?:cr|dr)?\s*\**", re.IGNORECASE)
_TEXT_HEADERS = {"category", "reference", "ref", "type", "transaction type"}
_AMOUNT_HEADERS = {
    "amount",
    "debit",
    "debits",
    "credit",
    "credits",
    "withdrawal",
    "deposit",
    "money in",
    "money out",
    "transaction amount",
    "value",
}


def normalize_table(table: Any) -> list[list[str]]:
    data = getattr(table, "df", table)
    if hasattr(data, "fillna"):
        data = data.fillna("")
    if hasattr(data, "values"):
        data = data.values.tolist()
    return [[str(cell).strip() for cell in row] for row in data if any(str(cell).strip() for cell in row)]


def is_description_header(header: str) -> bool:
    # "transaction description" (ABSA) as well as "description*" variants.
    return header in _DESCRIPTION_HEADERS or header.startswith("description") or header.endswith(" description")


def is_transaction_table(headers: list[str]) -> bool:
    return (
        any(header in _DATE_HEADERS for header in headers)
        and any(is_description_header(header) for header in headers)
        and any(header in _AMOUNT_HEADERS for header in headers)
    )


def table_headers(rows: list[list[str]]) -> tuple[int, list[str]]:
    for index, row in enumerate(rows[:10]):
        headers = [canonical_header(cell) for cell in row]
        if is_transaction_table(headers):
            return index, headers
    return 0, [canonical_header(cell) for cell in rows[0]] if rows else []


def canonical_header(value: str) -> str:
    header = re.sub(r"\([^)]*\)|\[[^]]*\]", "", value.casefold())
    header = " ".join(header.replace("_", " ").replace("/", " ").split())
    header = header.rstrip("*").strip()
    # Camelot sometimes breaks a short header word ("D\nate").
    compact = header.replace(" ", "")
    if compact != header and compact in _DATE_HEADERS | _AMOUNT_HEADERS | {"balance", "description", "details"}:
        return compact
    return header


# A card or account reference printed in a statement's description area: digits, then "*", then
# digits ("479056*7701 05 Jul"). It identifies the card transaction, not the merchant.
_CARD_REFERENCE = re.compile(r"\d{4,}\*\d+|^\d{8,}$")


# A date followed by description text in the same cell: "25 Aug Magtape Credit Tcps …".
#: The year is taken as part of the date when it is present ("25 Jul 2026" stays whole); the text
#: after the date must start with a letter, so a year is never read as the start of a description.
_DATE_THEN_TEXT = re.compile(
    r"^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\s+(\S.*)$|^(\d{1,2}\s+[A-Za-z]{3,9})\s+([A-Za-z].*)$"
)


def _split_date_from_description(aligned: list[str], headers: list[str]) -> list[str]:
    """Move text printed after a date in the date cell into the description cell."""
    date_at = next((i for i, h in enumerate(headers) if h in _DATE_HEADERS), None)
    desc_at = next((i for i, h in enumerate(headers) if is_description_header(h)), None)
    if date_at is None or desc_at is None or date_at >= len(aligned):
        return aligned
    match = _DATE_THEN_TEXT.match(aligned[date_at].strip())
    if not match:
        return aligned
    date_text, text = (match.group(1), match.group(2)) if match.group(1) else (match.group(3), match.group(4))
    aligned = list(aligned)
    aligned[date_at] = date_text
    aligned[desc_at] = f"{text} {aligned[desc_at]}".strip()
    return aligned


def align_row_to_headers(row: list[str], headers: list[str]) -> tuple[list[str], list[str]]:
    """Drop blank Camelot separator columns so values stay under named headers."""
    named = [(index, header) for index, header in enumerate(headers) if header]
    aligned_headers = [header for _, header in named]
    aligned: list[str] = []
    used: set[int] = set()
    for index, _header in named:
        value = row[index].strip() if index < len(row) else ""
        source = index
        if not value:
            look = index + 1
            while look < len(headers) and look < len(row) and not headers[look].strip():
                if look not in used and row[look].strip():
                    value = row[look].strip()
                    source = look
                    break
                look += 1
        # Some layouts print the description in the blank column before its header (FNB:
        # "14 Jul | Payshapid ... | | | 32.00"). Only the description takes text from the left.
        # A card reference ("479056*7701 05 Jul") is not a description. When the right-hand blank
        # column holds only a reference, the merchant text on the left is the description.
        if is_description_header(_header) and (not value or _CARD_REFERENCE.search(value)):
            look = index - 1
            while look >= 0 and not headers[look].strip():
                if (
                    look < len(row)
                    and look not in used
                    and row[look].strip()
                    and not _CARD_REFERENCE.search(row[look].strip())
                ):
                    value = row[look].strip()
                    source = look
                    break
                look -= 1
        if not value and is_description_header(_header):
            look = index - 1
            while look >= 0 and not headers[look].strip():
                if look < len(row) and look not in used and row[look].strip():
                    value = row[look].strip()
                    source = look
                    break
                look -= 1
        if source in used:
            value = ""
        else:
            used.add(source)
        aligned.append(value)
    return _split_date_from_description(aligned, aligned_headers), aligned_headers


_DIRECTION_HEADERS = {"type", "transaction type", "direction", "debit/credit", "dr/cr"}
_BALANCE_HEADERS = {"balance", "running balance", "available balance", "balance after"}
_AMOUNT_COLUMN_HEADERS = {"amount", "transaction amount", "value"}
_BALANCE_TOLERANCE = Decimal("0.02")


_DR_SUFFIX_RE = re.compile(r"dr\s*$", re.IGNORECASE)


def _fitting_readings(previous: Decimal, amount: Decimal, balance_abs: Decimal, amount_text: str) -> set:
    """Every (direction, sign) pair the balance chain accepts for one row.

    direction: +1 money in, -1 money out. sign: +1 balance in credit, -1 overdrawn. A marked
    amount ("100.00Cr", "-20.00") fixes the direction, so only the sign is left to decide.
    """
    text = amount_text.strip()
    forced = None
    if re.search(r"dr\s*$", text, re.IGNORECASE) or text.startswith(("-", "(")):
        forced = -1
    elif re.search(r"cr\s*$", text, re.IGNORECASE) or text.startswith("+"):
        forced = 1
    readings = set()
    for direction in ((forced,) if forced is not None else (1, -1)):
        for sign in (1, -1):
            if abs(previous + direction * amount - sign * balance_abs) <= _BALANCE_TOLERANCE:
                readings.add((direction, sign))
    return readings


def infer_directions_from_balances(
    rows: list[list[str]],
    headers: list[str],
    opening: Decimal | None = None,
) -> tuple[list[list[str]], list[str]]:
    """Work out money in or out from the running balance, for unsigned amounts.

    Some statements print a single unsigned amount and no direction column (FNB: debits carry
    no marker, credits carry "Cr"). The balance says which way the money moved: if the balance
    rose by the amount it is money in, if it fell by the amount it is money out. The result
    is added as a ``direction`` column. A row is left blank unless one reading fits the
    balance exactly, so a misread balance cannot flip a row silently.
    """
    from .normalise import parse_amount, parse_balance

    if any(header in _DIRECTION_HEADERS or header == "direction" for header in headers):
        return rows, headers
    amount_at = next((i for i, h in enumerate(headers) if h in _AMOUNT_COLUMN_HEADERS), None)
    balance_at = next((i for i, h in enumerate(headers) if h in _BALANCE_HEADERS), None)
    if amount_at is None or balance_at is None:
        return rows, headers

    out: list[list[str]] = []
    previous = opening
    for row in rows:
        cells = list(row) + [""] * (len(headers) - len(row))
        amount_text = cells[amount_at].strip()
        balance_text = cells[balance_at].strip()
        direction = ""
        # A marked or signed amount already says its direction; the normaliser reads it.
        marked = bool(re.search(r"(cr|dr)\s*$", amount_text, re.IGNORECASE)) or amount_text.startswith(
            ("-", "+", "(")
        )
        amount = parse_amount(amount_text) if amount_text else None
        printed = parse_balance(balance_text) if balance_text else None
        balance_abs = abs(printed) if printed is not None else None
        if amount and previous is not None and balance_abs is not None:
            readings = _fitting_readings(previous, abs(amount), balance_abs, amount_text)
            directions = {d for d, _ in readings}
            signs = {s for _, s in readings}
            if not marked and len(directions) == 1:
                direction = "credit" if directions == {1} else "debit"
            sign = next(iter(signs)) if len(signs) == 1 else None
            if sign is not None:
                # The printed balance has no Dr marker but the chain says it is overdrawn.
                # Record it as negative, and say so in the cell so later reads agree.
                if sign < 0 and not _DR_SUFFIX_RE.search(balance_text):
                    cells[balance_at] = f"{balance_text} Dr"
                previous = sign * balance_abs
                out.append(cells + [direction])
                continue
        balance = parse_balance(balance_text) if balance_text else None
        if balance is not None:
            previous = balance
        out.append(cells + [direction])
    return out, list(headers) + ["direction"]


_SUMMARY_LABEL = re.compile(r"^(opening|closing)\s+balance\b|^total\b", re.IGNORECASE)


def is_summary_row(row: list[str]) -> bool:
    """A statement's own summary line ("Closing Balance 482.78Dr"), not a transaction."""
    return any(_SUMMARY_LABEL.match(cell.strip()) for cell in row if cell and cell.strip())


def last_printed_balance(rows: list[list[str]], headers: list[str]):
    """The balance printed on the last row that has one, or None. Carries the chain across tables."""
    from .normalise import parse_balance

    balance_at = next((i for i, h in enumerate(headers) if h in _BALANCE_HEADERS), None)
    if balance_at is None:
        return None
    for row in reversed(rows):
        if balance_at < len(row) and row[balance_at].strip():
            value = parse_balance(row[balance_at])
            if value is not None:
                return value
    return None


def merge_continuation_rows(
    rows: list[list[str]],
    headers: list[str],
    period: tuple | None = None,
) -> list[list[str]]:
    """Append undated description-only wrap lines onto the previous dated row.

    ``period`` lets year-less dates ("14 Jul") count as dated when the statement prints its
    period. Without it such rows read as undated, and a table whose first row is undated
    is dropped entirely.
    """
    from .dates import parse_statement_date
    from .normalise import parse_amount

    def parse_date(value: str):
        return parse_statement_date(value, period=period).value

    date_index = next((i for i, h in enumerate(headers) if h in _DATE_HEADERS), None)
    desc_index = next((i for i, h in enumerate(headers) if is_description_header(h)), None)
    def _cell(row: list[str], index: int | None) -> str:
        return row[index].strip() if index is not None and index < len(row) else ""

    def _has_money(row: list[str]) -> bool:
        return any(
            _MONEY_CELL.fullmatch(cell.strip()) and parse_amount(cell) not in (None, Decimal("0"))
            for index, cell in enumerate(row)
            if cell.strip() and index != desc_index and (index >= len(headers) or headers[index] not in _TEXT_HEADERS)
        )

    merged: list[list[str]] = []
    # A tall row can print its details line above the dated line (a payment received:
    # "Inter account transfer from ..." sits over "17 Mar | Transfer | R21 074.70"). Such a
    # line belongs to the dated row below it, not to the row above.
    leading: dict[int, str] = {}
    for position in range(len(rows) - 1):
        row, following = rows[position], rows[position + 1]
        if (
            desc_index is not None
            and parse_date(_cell(row, date_index)) is None
            and _cell(row, desc_index)
            and not _has_money(row)
            and parse_date(_cell(following, date_index)) is not None
            and not _cell(following, desc_index)
            and _has_money(following)
        ):
            leading[position] = _cell(row, desc_index)
    consumed = {position + 1: text for position, text in leading.items()}
    for position, row in enumerate(rows):
        if position in leading:
            continue
        date_value = row[date_index].strip() if date_index is not None and date_index < len(row) else ""
        if parse_date(date_value) is not None:
            current = list(row)
            if position in consumed and desc_index is not None:
                if desc_index >= len(current):
                    current.extend([""] * (desc_index - len(current) + 1))
                current[desc_index] = consumed[position]
            merged.append(current)
            continue
        if not merged:
            continue
        # Only money columns count: a wrapped reference number in the
        # description ("2715149863") is text, not an amount.
        has_amount = any(
            _MONEY_CELL.fullmatch(cell.strip()) and parse_amount(cell) not in (None, Decimal("0"))
            for index, cell in enumerate(row)
            if cell.strip() and index != desc_index and (index >= len(headers) or headers[index] not in _TEXT_HEADERS)
        )
        extra = row[desc_index].strip() if desc_index is not None and desc_index < len(row) else ""
        if has_amount or desc_index is None:
            merged.append(list(row))
            continue
        if not extra:
            # Undated, amountless, no description: a wrapped category or page footer.
            continue
        current = list(merged[-1])
        if desc_index >= len(current):
            current.extend([""] * (desc_index - len(current) + 1))
        current[desc_index] = f"{current[desc_index]} {extra}".strip()
        merged[-1] = current
    return merged


def extract_camelot_tables(content: bytes) -> tuple[list[list[list[str]]], float]:
    """Extract structured tables from a text-based PDF. Returns rows and 0-1 confidence."""
    try:
        import camelot
    except ImportError:
        return [], 0.0

    tables: list[list[list[str]]] = []
    accuracies: list[float] = []
    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary_file:
            temporary_file.write(content)
            temporary_path = temporary_file.name
        for flavor in ("lattice", "stream"):
            try:
                found: Any = camelot.read_pdf(temporary_path, pages="all", flavor=flavor)
                flavor_tables: list[list[list[str]]] = []
                flavor_accuracies: list[float] = []
                for table in found:
                    rows = normalize_table(table)
                    if not rows:
                        continue
                    flavor_tables.append(rows)
                    accuracy = getattr(table, "accuracy", None)
                    if isinstance(accuracy, (int, float)):
                        flavor_accuracies.append(
                            float(accuracy) / 100.0 if accuracy > 1 else float(accuracy),
                        )
                if flavor_tables:
                    tables = flavor_tables
                    accuracies = flavor_accuracies
                    break
            except Exception as error:
                logger.warning("camelot_failed flavor=%s error_type=%s", flavor, type(error).__name__)
                continue
    finally:
        if temporary_path:
            os.unlink(temporary_path)

    if not tables:
        return [], 0.0
    if accuracies:
        confidence = max(0.0, min(1.0, sum(accuracies) / len(accuracies)))
    else:
        confidence = 1.0
    return tables, round(confidence, 3)
