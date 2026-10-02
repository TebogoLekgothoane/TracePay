import logging
import os
import re
import tempfile
from typing import Any

from decimal import Decimal

logger = logging.getLogger("tracepay.pdf.tables")

_DATE_HEADERS = {"date", "transaction date", "value date", "trans date"}
_DESCRIPTION_HEADERS = {"description", "details", "narration", "narrative", "merchant"}
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
    return header in _DESCRIPTION_HEADERS or header.startswith("description")


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
    return header.rstrip("*").strip()


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
        if source in used:
            value = ""
        else:
            used.add(source)
        aligned.append(value)
    return aligned, aligned_headers


def merge_continuation_rows(rows: list[list[str]], headers: list[str]) -> list[list[str]]:
    """Append undated description-only wrap lines onto the previous dated row."""
    from .normalise import parse_amount, parse_date

    date_index = next((i for i, h in enumerate(headers) if h in _DATE_HEADERS), None)
    desc_index = next((i for i, h in enumerate(headers) if is_description_header(h)), None)
    merged: list[list[str]] = []
    for row in rows:
        date_value = row[date_index].strip() if date_index is not None and date_index < len(row) else ""
        if parse_date(date_value) is not None:
            merged.append(list(row))
            continue
        if not merged:
            continue
        has_amount = any(
            parse_amount(cell) not in (None, Decimal("0")) for cell in row if cell.strip()
        )
        extra = row[desc_index].strip() if desc_index is not None and desc_index < len(row) else ""
        if has_amount or not extra or desc_index is None:
            merged.append(list(row))
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
