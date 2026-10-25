"""Date parsing for South African bank statements, with provenance.

Every parse returns the original text, the interpreted date, a confidence and
warnings. A date is never invented: when the evidence does not settle a
reading (a year-less date with no statement period, a month/day pair that fits
two periods) the result has ``value=None`` and says why.

Conventions used here, in order of authority:

1. An explicit four-digit year with an ISO layout is unambiguous.
2. South African banks print day-first (``DD/MM/YYYY``). A numeric date whose
   day-first reading is valid is read day-first. If the statement period is
   known and only the month-first reading falls inside it, month-first is used
   with reduced confidence.
3. A date without a year takes its year from the statement period, and only
   when exactly one year places it inside the period.
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Literal, Sequence

Confidence = Literal["high", "medium", "low", "none"]

_MONTHS = {
    name.lower(): index
    for index, name in enumerate(calendar.month_name)
    if name
}
_MONTHS.update(
    {name.lower(): index for index, name in enumerate(calendar.month_abbr) if name}
)
_MONTHS["sept"] = 9

_MONTH_WORD = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

_ISO = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])")
_NUMERIC = re.compile(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?![\d])")
_NUMERIC_NO_YEAR = re.compile(r"^(\d{1,2})[/.](\d{1,2})(?![\d/.\-])")
_DAY_MONTH_WORD = re.compile(
    rf"^(\d{{1,2}})[ \-]?({_MONTH_WORD})\.?(?:[ ,\-]+(\d{{4}}|\d{{2}}))?(?![A-Za-z\d])",
    re.IGNORECASE,
)
_MONTH_WORD_DAY = re.compile(
    rf"^({_MONTH_WORD})\.?[ ]+(\d{{1,2}})(?:,?[ ]+(\d{{4}}))?(?![A-Za-z\d])",
    re.IGNORECASE,
)

#: Dates found anywhere in free text, used only to *recognise* embedded dates.
_EMBEDDED = re.compile(
    rf"(?<![\d/.\-])(?:\d{{4}}-\d{{1,2}}-\d{{1,2}}|\d{{1,2}}[/.\-]\d{{1,2}}[/.\-](?:\d{{4}}|\d{{2}})|\d{{1,2}}[ \-]{_MONTH_WORD}(?:[ \-]\d{{4}})?)(?![\d])",
    re.IGNORECASE,
)

#: Largest statement period (days) for which a year-less date can be placed.
MAX_YEARLESS_PERIOD_DAYS = 366


@dataclass(frozen=True)
class ParsedDate:
    text: str
    value: date | None
    confidence: Confidence
    warnings: tuple[str, ...] = field(default_factory=tuple)
    year_was_inferred: bool = False

    @property
    def ok(self) -> bool:
        return self.value is not None


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _expand_year(raw: str) -> tuple[int, bool]:
    """Two-digit years pivot at 70: 70-99 -> 19xx, 00-69 -> 20xx. Returns (year, was_two_digit)."""
    year = int(raw)
    if len(raw) == 4:
        return year, False
    return (1900 + year if year >= 70 else 2000 + year), True


def _in_period(candidate: date, period: tuple[date, date] | None) -> bool:
    return period is not None and period[0] <= candidate <= period[1]


def _normalise_period(
    period: tuple[date | None, date | None] | None,
) -> tuple[date, date] | None:
    if not period or period[0] is None or period[1] is None:
        return None
    start, end = period
    if start > end:
        return None
    return start, end


def parse_statement_date(
    text: str | None,
    *,
    period: tuple[date | None, date | None] | None = None,
) -> ParsedDate:
    """Parse the date at the start of ``text``; text after the date is ignored.

    Only the leading token is read. A date later in a string (for example a
    debit-order date inside a description) is never taken as the transaction
    date.
    """
    original = (text or "").strip()
    if not original:
        return ParsedDate(original, None, "none", ("empty_date",))
    bounds = _normalise_period(period)

    if (match := _ISO.match(original)) is not None:
        year, month, day = (int(match.group(i)) for i in (1, 2, 3))
        parsed = _safe_date(year, month, day)
        if parsed is None:
            return ParsedDate(original, None, "none", ("invalid_calendar_date",))
        return ParsedDate(original, parsed, "high")

    if (match := _NUMERIC.match(original)) is not None:
        return _numeric(original, match, bounds)

    if (match := _DAY_MONTH_WORD.match(original)) is not None:
        day = int(match.group(1))
        month = _MONTHS[match.group(2).lower()]
        year_raw = match.group(3)
        if year_raw:
            year, two_digit = _expand_year(year_raw)
            parsed = _safe_date(year, month, day)
            if parsed is None:
                return ParsedDate(original, None, "none", ("invalid_calendar_date",))
            return ParsedDate(
                original,
                parsed,
                "medium" if two_digit else "high",
                ("two_digit_year",) if two_digit else (),
            )
        return _place_yearless(original, month, day, bounds)

    if (match := _MONTH_WORD_DAY.match(original)) is not None:
        month = _MONTHS[match.group(1).lower()]
        day = int(match.group(2))
        if match.group(3):
            parsed = _safe_date(int(match.group(3)), month, day)
            if parsed is None:
                return ParsedDate(original, None, "none", ("invalid_calendar_date",))
            return ParsedDate(original, parsed, "high")
        return _place_yearless(original, month, day, bounds)

    if (match := _NUMERIC_NO_YEAR.match(original)) is not None:
        first, second = int(match.group(1)), int(match.group(2))
        return _place_yearless_numeric(original, first, second, bounds)

    return ParsedDate(original, None, "none", ("unrecognised_date_format",))


def _numeric(
    original: str, match: re.Match[str], bounds: tuple[date, date] | None
) -> ParsedDate:
    first, second = int(match.group(1)), int(match.group(2))
    year, two_digit = _expand_year(match.group(3))
    warnings: list[str] = ["two_digit_year"] if two_digit else []

    day_first = _safe_date(year, second, first)
    month_first = _safe_date(year, first, second)

    if day_first is None and month_first is None:
        return ParsedDate(original, None, "none", ("invalid_calendar_date",))
    if day_first is None:
        # day > 12 in the second slot: only a month-first reading exists.
        warnings.append("month_first_reading")
        return ParsedDate(original, month_first, "low", tuple(warnings))
    if month_first is None or first == second:
        return ParsedDate(
            original, day_first, "medium" if two_digit else "high", tuple(warnings)
        )

    # Both readings are valid calendar dates and differ.
    if bounds is not None:
        day_in = _in_period(day_first, bounds)
        month_in = _in_period(month_first, bounds)
        if month_in and not day_in:
            warnings.append("month_first_reading_fits_statement_period")
            return ParsedDate(original, month_first, "low", tuple(warnings))
        if day_in and not month_in:
            return ParsedDate(
                original, day_first, "medium" if two_digit else "high", tuple(warnings)
            )
        if day_in and month_in:
            warnings.append("ambiguous_day_month_both_fit_period")
            return ParsedDate(original, day_first, "medium", tuple(warnings))
        warnings.append("outside_statement_period")
        return ParsedDate(original, day_first, "low", tuple(warnings))
    warnings.append("day_first_assumed")
    return ParsedDate(original, day_first, "medium", tuple(warnings))


def _candidate_years(bounds: tuple[date, date]) -> range:
    return range(bounds[0].year, bounds[1].year + 1)


def _place_yearless(
    original: str, month: int, day: int, bounds: tuple[date, date] | None
) -> ParsedDate:
    if bounds is None:
        return ParsedDate(original, None, "none", ("year_missing_no_statement_period",))
    if (bounds[1] - bounds[0]).days > MAX_YEARLESS_PERIOD_DAYS:
        return ParsedDate(original, None, "none", ("year_ambiguous_long_period",))
    fits = [
        candidate
        for year in _candidate_years(bounds)
        if (candidate := _safe_date(year, month, day)) is not None
        and _in_period(candidate, bounds)
    ]
    if len(fits) == 1:
        return ParsedDate(
            original, fits[0], "medium", ("year_inferred_from_statement_period",), True
        )
    if not fits:
        return ParsedDate(original, None, "none", ("date_outside_statement_period",))
    return ParsedDate(original, None, "none", ("year_ambiguous",))


def _place_yearless_numeric(
    original: str, first: int, second: int, bounds: tuple[date, date] | None
) -> ParsedDate:
    """``DD/MM`` with no year. Only placed when exactly one reading fits the period."""
    if bounds is None:
        return ParsedDate(original, None, "none", ("year_missing_no_statement_period",))
    if (bounds[1] - bounds[0]).days > MAX_YEARLESS_PERIOD_DAYS:
        return ParsedDate(original, None, "none", ("year_ambiguous_long_period",))
    readings: list[date] = []
    for day, month in {(first, second), (second, first)}:
        for year in _candidate_years(bounds):
            candidate = _safe_date(year, month, day)
            if candidate is not None and _in_period(candidate, bounds):
                readings.append(candidate)
    distinct = sorted(set(readings))
    if len(distinct) == 1:
        return ParsedDate(
            original, distinct[0], "medium", ("year_inferred_from_statement_period",), True
        )
    if not distinct:
        return ParsedDate(original, None, "none", ("date_outside_statement_period",))
    # Day-first and month-first both fit the period: do not guess.
    return ParsedDate(original, None, "none", ("ambiguous_day_month_and_year",))


def infer_years_from_sequence(
    day_months: Sequence[tuple[int, int]],
    anchor: date,
    *,
    anchor_is_last: bool,
) -> list[date | None]:
    """Give year-less ``(day, month)`` rows a year by walking from a known anchor.

    ``anchor`` is the statement's known end date when rows run oldest-first
    (``anchor_is_last=True``) or its start date when they run newest-first.
    The walk only proceeds while rows are monotonic in calendar order; a row
    that breaks the order, or that cannot be a real date, ends inference and
    every remaining row stays ``None``. Rows are never reordered.
    """
    results: list[date | None] = [None] * len(day_months)
    if not day_months:
        return results
    indexes = (
        range(len(day_months) - 1, -1, -1) if anchor_is_last else range(len(day_months))
    )
    previous = anchor
    for index in indexes:
        day, month = day_months[index]
        candidates = [
            c
            for year in (previous.year - 1, previous.year, previous.year + 1)
            if (c := _safe_date(year, month, day)) is not None
        ]
        if anchor_is_last:
            # Walking backwards: the row must not be after the previous (later) row.
            fitting = [c for c in candidates if c <= previous and (previous - c).days <= 366]
            pick = max(fitting) if fitting else None
        else:
            fitting = [c for c in candidates if c >= previous and (c - previous).days <= 366]
            pick = min(fitting) if fitting else None
        if pick is None:
            break
        results[index] = pick
        previous = pick
    return results


def find_embedded_dates(description: str | None) -> list[str]:
    """Date-like strings inside free text (debit-order dates, card auth dates).

    These are descriptive. They must never replace the transaction date.
    """
    return [match.group(0) for match in _EMBEDDED.finditer(description or "")]
