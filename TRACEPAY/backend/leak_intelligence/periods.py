"""Shared helpers for excluding incomplete trailing financial periods."""

from __future__ import annotations

from calendar import monthrange
from collections.abc import Callable, Sequence
from datetime import date
from typing import TypeVar

from .models import FinancialFeatureSnapshot, MonthlyFeature

T = TypeVar("T")


def exclude_incomplete_final_month(
    items: Sequence[T],
    observation_end: date | None,
    month_of: Callable[[T], str],
) -> list[T]:
    """Drop a trailing month that has not finished by observation_end."""
    ordered = list(items)
    if not ordered or observation_end is None:
        return ordered
    final_day = monthrange(observation_end.year, observation_end.month)[1]
    final_month = observation_end.strftime("%Y-%m")
    if month_of(ordered[-1]) == final_month and observation_end.day < final_day:
        return ordered[:-1]
    return ordered


# Statement history that begins after this day-of-month is treated as an
# incomplete opening month (not comparable to full calendar months).
INCOMPLETE_OPENING_MONTH_DAY = 14


def exclude_incomplete_opening_month(
    items: Sequence[T],
    observation_start: date | None,
    month_of: Callable[[T], str],
) -> list[T]:
    """Drop a leading month when observation starts too late in that month."""
    ordered = list(items)
    if not ordered or observation_start is None:
        return ordered
    if observation_start.day <= INCOMPLETE_OPENING_MONTH_DAY:
        return ordered
    opening_month = observation_start.strftime("%Y-%m")
    if month_of(ordered[0]) == opening_month:
        return ordered[1:]
    return ordered


def month_keys_are_adjacent(earlier: str, later: str) -> bool:
    """True when later is the calendar month immediately after earlier (YYYY-MM)."""
    try:
        earlier_year, earlier_month = (int(part) for part in earlier.split("-", 1))
        later_year, later_month = (int(part) for part in later.split("-", 1))
    except (TypeError, ValueError):
        return False
    if earlier_month == 12:
        return later_year == earlier_year + 1 and later_month == 1
    return later_year == earlier_year and later_month == earlier_month + 1


def contiguous_month_suffix(month_keys: Sequence[str]) -> list[str]:
    """Return the longest contiguous trailing run of YYYY-MM keys.

    Missing months are not treated as zero spending; gaps break contiguity so
    comparisons only use an unbroken recent history window.
    """
    ordered = sorted({key for key in month_keys if key})
    if not ordered:
        return []
    suffix = [ordered[-1]]
    for index in range(len(ordered) - 2, -1, -1):
        if month_keys_are_adjacent(ordered[index], suffix[0]):
            suffix.insert(0, ordered[index])
        else:
            break
    return suffix


def completed_months(snapshot: FinancialFeatureSnapshot) -> list[MonthlyFeature]:
    observation_end = snapshot.coverage_observation_end or snapshot.date_end
    observation_start = snapshot.coverage_observation_start or snapshot.date_start
    months = exclude_incomplete_final_month(
        snapshot.months,
        observation_end,
        lambda month: month.month,
    )
    return exclude_incomplete_opening_month(
        months,
        observation_start,
        lambda month: month.month,
    )
