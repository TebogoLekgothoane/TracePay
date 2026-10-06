"""Plausible recurring-payment interval rules (subscription-like cadence only)."""

from __future__ import annotations

from decimal import Decimal

ZERO = Decimal("0")

# Average intervals at or below this are treated as frequent spending, not recurring billing.
MAX_FREQUENT_INTERVAL_DAYS = Decimal("3")

# (center days, half-width tolerance)
_RECURRING_INTERVAL_WINDOWS: tuple[tuple[Decimal, Decimal], ...] = (
    (Decimal("7"), Decimal("2")),
    (Decimal("14"), Decimal("3")),
    (Decimal("21"), Decimal("4")),
    (Decimal("30"), Decimal("5")),
    (Decimal("60"), Decimal("5")),
    (Decimal("90"), Decimal("6")),
    (Decimal("180"), Decimal("12")),
    (Decimal("365"), Decimal("21")),
)


def is_implausibly_frequent_interval(average_interval_days: Decimal | None) -> bool:
    if average_interval_days is None:
        return True
    return average_interval_days <= MAX_FREQUENT_INTERVAL_DAYS


def matches_plausible_recurring_interval(average_interval_days: Decimal | None) -> bool:
    """True when the average spacing looks like billing cadence, not daily habit spending."""
    if average_interval_days is None or is_implausibly_frequent_interval(average_interval_days):
        return False
    if average_interval_days > Decimal("400"):
        return False
    if Decimal("28") <= average_interval_days <= Decimal("35"):
        return True
    if Decimal("56") <= average_interval_days <= Decimal("65"):
        return True
    if Decimal("84") <= average_interval_days <= Decimal("95"):
        return True
    for center, tolerance in _RECURRING_INTERVAL_WINDOWS:
        if abs(average_interval_days - center) <= tolerance:
            return True
    return False


def recurrence_strength_cap_for_interval(
    average_interval_days: Decimal | None,
    proposed: str,
) -> str:
    """Downgrade medium/high recurrence when the interval is not billing-like."""
    if proposed not in {"medium", "high"}:
        return proposed
    if matches_plausible_recurring_interval(average_interval_days):
        return proposed
    return "low"
