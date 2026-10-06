"""Shared helpers for excluding incomplete trailing financial periods."""

from __future__ import annotations

from calendar import monthrange

from .models import FinancialFeatureSnapshot, MonthlyFeature


def completed_months(snapshot: FinancialFeatureSnapshot) -> list[MonthlyFeature]:
    months = list(snapshot.months)
    if not months or snapshot.date_end is None:
        return months
    final_day = monthrange(snapshot.date_end.year, snapshot.date_end.month)[1]
    final_month = snapshot.date_end.strftime("%Y-%m")
    if months[-1].month == final_month and snapshot.date_end.day < final_day:
        return months[:-1]
    return months
