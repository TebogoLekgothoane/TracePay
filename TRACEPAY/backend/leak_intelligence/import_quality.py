"""Statement-import quality signals for period-comparison reliability.

These helpers reuse thresholds already applied by the PDF extraction pipeline.
Missing quality fields are treated as unknown, never as a confirmed failure.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal, Sequence

from pydantic import BaseModel

ImportQualityStatus = Literal["reliable", "unreliable", "unknown"]

# Same gates as pdf_processor.main._needs_ai_extraction / validate.py.
REJECT_RATIO_THRESHOLD = Decimal("0.20")
EXTRACTION_CONFIDENCE_FLOOR = Decimal("0.65")


class StatementImportQuality(BaseModel):
    """Sanitised import metadata — no file content or transaction descriptions."""

    import_id: str
    balance_reconciliation: str | None = None
    rows_detected: int | None = None
    rows_rejected: int | None = None
    extraction_confidence: Decimal | None = None
    statement_start_date: date | None = None
    statement_end_date: date | None = None


def classify_import_quality(item: StatementImportQuality) -> ImportQualityStatus:
    """Return reliable, unreliable, or unknown for one import row."""
    has_signal = False

    if item.balance_reconciliation == "mismatch":
        return "unreliable"
    if item.balance_reconciliation in {"verified", "not_available"}:
        has_signal = True

    if item.rows_detected is not None and item.rows_rejected is not None:
        has_signal = True
        if item.rows_detected > 0:
            ratio = Decimal(item.rows_rejected) / Decimal(item.rows_detected)
            if ratio >= REJECT_RATIO_THRESHOLD:
                return "unreliable"

    if item.extraction_confidence is not None:
        has_signal = True
        if item.extraction_confidence < EXTRACTION_CONFIDENCE_FLOOR:
            return "unreliable"

    if not has_signal:
        return "unknown"
    return "reliable"


def parse_import_quality_row(row: dict) -> StatementImportQuality | None:
    """Build a quality record from a statement_imports REST row."""
    import_id = row.get("id")
    if not isinstance(import_id, str) or not import_id.strip():
        return None
    return StatementImportQuality(
        import_id=import_id.strip(),
        balance_reconciliation=_optional_text(row.get("balance_reconciliation")),
        rows_detected=_optional_non_negative_int(row.get("rows_detected")),
        rows_rejected=_optional_non_negative_int(row.get("rows_rejected")),
        extraction_confidence=_optional_confidence(row.get("extraction_confidence")),
        statement_start_date=_optional_date(row.get("statement_start_date")),
        statement_end_date=_optional_date(row.get("statement_end_date")),
    )


def resolve_coverage_observation_bounds(
    txn_start: date | None,
    txn_end: date | None,
    imports: Sequence[StatementImportQuality],
) -> tuple[date | None, date | None]:
    """Derive incompleteness bounds from txn dates and declared statement dates.

    Declared dates may make a period look more incomplete, never less.
    Contradictory start>end pairs on one import are ignored.
    Declared dates alone do not prove every transaction was extracted.
    """
    if txn_start is None or txn_end is None:
        return txn_start, txn_end

    observation_start = txn_start
    observation_end = txn_end
    for item in imports:
        start = item.statement_start_date
        end = item.statement_end_date
        if start is not None and end is not None and start > end:
            continue
        if (
            start is not None
            and (start.year, start.month) == (txn_start.year, txn_start.month)
            and start.day > observation_start.day
        ):
            observation_start = start
        if (
            end is not None
            and (end.year, end.month) == (txn_end.year, txn_end.month)
            and end.day < observation_end.day
        ):
            observation_end = end
    return observation_start, observation_end


def unreliable_quality_affects_months(
    *,
    month_keys: Sequence[str],
    import_ids_by_month: dict[str, list[str]],
    imports_by_id: dict[str, StatementImportQuality],
) -> bool:
    """True when a confirmed-unreliable import contributed rows to these months."""
    import_ids: set[str] = set()
    for month in month_keys:
        import_ids.update(import_ids_by_month.get(month) or [])
    for import_id in import_ids:
        quality = imports_by_id.get(import_id)
        if quality is None:
            continue
        if classify_import_quality(quality) == "unreliable":
            return True
    return False


def _optional_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _optional_non_negative_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _optional_confidence(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not number.is_finite() or number < 0 or number > 1:
        return None
    return number


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None
