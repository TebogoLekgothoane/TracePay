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


def completed_months(snapshot: FinancialFeatureSnapshot) -> list[MonthlyFeature]:
    return exclude_incomplete_final_month(
        snapshot.months,
        snapshot.date_end,
        lambda month: month.month,
    )
