import re
from typing import Any


def normalize_table(table: Any) -> list[list[str]]:
    """Convert a Camelot table/DataFrame-like object to clean rows."""
    data = getattr(table, "df", table)
    if hasattr(data, "fillna"):
        data = data.fillna("")
    if hasattr(data, "values"):
        data = data.values.tolist()
    return [[str(cell).strip() for cell in row] for row in data if any(str(cell).strip() for cell in row)]


def table_headers(rows: list[list[str]]) -> tuple[int, list[str]]:
    aliases = {
        "date": {"date", "transaction date", "value date", "trans date"},
        "description": {"description", "details", "narration", "narrative", "merchant"},
        "amount": {"amount", "debit", "debits", "credit", "credits", "withdrawal", "deposit"},
    }
    for index, row in enumerate(rows[:10]):
        headers = [canonical_header(cell) for cell in row]
        if any(item in aliases["date"] for item in headers) and any(item in aliases["description"] for item in headers):
            return index, headers
    return 0, [canonical_header(cell) for cell in rows[0]] if rows else []


def canonical_header(value: str) -> str:
    """Normalize common bank-statement header annotations without changing row values."""
    header = re.sub(r"\([^)]*\)|\[[^]]*\]", "", value.casefold())
    return " ".join(header.replace("_", " ").replace("/", " ").split())


def align_row_to_headers(row: list[str], headers: list[str]) -> tuple[list[str], list[str]]:
    """Align Camelot rows when blank visual separator columns shift values right."""
    named_positions = [(index, header) for index, header in enumerate(headers) if header]
    aligned_headers = [header for _, header in named_positions]
    aligned_values: list[str] = []
    used: set[int] = set()
    for index, _header in named_positions:
        value = row[index].strip() if index < len(row) else ""
        source_index = index
        if not value and index + 1 < len(row) and row[index + 1].strip():
            value = row[index + 1].strip()
            source_index = index + 1
        if source_index in used:
            value = ""
        else:
            used.add(source_index)
        aligned_values.append(value)
    return aligned_values, aligned_headers
