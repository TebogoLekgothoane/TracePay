from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import pandas as pd


@dataclass
class Leak:
    id: str
    detector: str
    title: str
    plain_language_reason: str
    severity: str
    transaction_id: str | None = None
    estimated_monthly_cost: float | None = None
    evidence: Dict[str, Any] | None = None


def detect_weekend_spending(df: pd.DataFrame) -> List[Leak]:
    """
    Weekend Spending Spikes:
    Detect if spending is significantly higher on weekends, which might indicate
    impulse purchases or social spending pressure.
    """
    if df.empty:
        return []

    debits = df[df["direction"] == "debit"].copy()
    if debits.empty:
        return []

    # Add day of week
    debits["day_of_week"] = debits["timestamp"].dt.dayofweek  # 0=Monday, 6=Sunday
    debits["is_weekend"] = debits["day_of_week"].isin([5, 6])  # Saturday, Sunday

    now = pd.Timestamp.utcnow().tz_localize("UTC") if not df["timestamp"].empty else pd.Timestamp.utcnow()
    last_30 = debits[debits["timestamp"] >= (now - pd.Timedelta(days=30))]

    if len(last_30) < 10:  # Need enough data
        return []

    weekend_spending = float(last_30[last_30["is_weekend"]]["abs_amount"].sum())
    weekday_spending = float(last_30[~last_30["is_weekend"]]["abs_amount"].sum())

    weekend_days = (last_30["is_weekend"]).sum()
    weekday_days = (~last_30["is_weekend"]).sum()

    if weekday_days == 0 or weekend_days == 0:
        return []

    # Calculate average spending per day
    weekend_avg = weekend_spending / max(weekend_days, 1)
    weekday_avg = weekday_spending / max(weekday_days, 1)

    # Flag if weekend spending is 50%+ higher than weekday
    if weekend_avg > 0 and weekday_avg > 0:
        ratio = weekend_avg / weekday_avg
        if ratio >= 1.5 and weekend_spending >= 200:  # 50%+ higher and meaningful amount
            severity = "medium" if ratio < 2.0 else "high"
            return [
                Leak(
                    id="weekend-spending-spike",
                    detector="WeekendSpending",
                    title="Weekend spending is much higher than weekdays",
                    plain_language_reason=(
                        f"Your weekend spending (R{weekend_spending:.0f}) is {ratio:.1f}x higher than weekday spending. "
                        f"This might be impulse purchases or social spending. Consider planning weekend expenses."
                    ),
                    severity=severity,
                    estimated_monthly_cost=weekend_spending * 4.33,  # Approximate monthly
                    evidence={
                        "weekend_spending": round(weekend_spending, 2),
                        "weekday_spending": round(weekday_spending, 2),
                        "weekend_avg_per_day": round(weekend_avg, 2),
                        "weekday_avg_per_day": round(weekday_avg, 2),
                        "ratio": round(ratio, 2),
                        "weekend_transactions": int(weekend_days),
                        "weekday_transactions": int(weekday_days),
                    },
                )
            ]

    return []

