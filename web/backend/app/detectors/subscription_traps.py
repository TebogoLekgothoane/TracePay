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


def detect_subscription_traps(df: pd.DataFrame) -> List[Leak]:
    """
    Subscription Traps:
    Detect recurring small deductions that haven't changed for 3+ months.
    These are often forgotten subscriptions that drain money silently.
    """
    if df.empty:
        return []

    debits = df[df["direction"] == "debit"].copy()
    if debits.empty:
        return []

    # Group by merchant/description and amount to find recurring patterns
    debits["merchant_normalized"] = debits["merchant"].fillna("").str.lower().str.strip()
    debits["description_normalized"] = debits["description"].fillna("").str.lower().str.strip()

    # Create a key for grouping similar transactions
    debits["transaction_key"] = (
        debits["merchant_normalized"] + "_" + debits["description_normalized"].str[:50] + "_" + debits["abs_amount"].round(2).astype(str)
    )

    leaks = []
    now = pd.Timestamp.utcnow().tz_localize("UTC") if not debits["timestamp"].empty else pd.Timestamp.utcnow()

    # Group by transaction key
    for key, group in debits.groupby("transaction_key"):
        if len(group) < 3:  # Need at least 3 occurrences
            continue

        group = group.sort_values("timestamp")
        amounts = group["abs_amount"].values
        first_amount = amounts[0]

        # Check if all amounts are the same (within 1% tolerance)
        if not all(abs(a - first_amount) / max(first_amount, 0.01) < 0.01 for a in amounts):
            continue

        # Check if recurring for 3+ months
        first_date = group["timestamp"].iloc[0]
        last_date = group["timestamp"].iloc[-1]
        months_span = (last_date - first_date).days / 30.0

        if months_span < 3:
            continue

        # Calculate frequency (transactions per month)
        freq_per_month = len(group) / max(months_span, 0.1)
        monthly_cost = first_amount * freq_per_month

        # Only flag if it's a meaningful amount
        if monthly_cost < 10:
            continue

        # Check last occurrence (should be recent)
        days_since_last = (now - last_date).days
        if days_since_last > 60:  # Not active anymore
            continue

        severity = "high" if monthly_cost >= 50 else "medium"
        merchant_name = group["merchant"].iloc[0] or group["description"].iloc[0] or "Unknown"

        leaks.append(
            Leak(
                id=f"subscription-trap-{key[:20]}",
                detector="SubscriptionTraps",
                title=f"Recurring charge: {merchant_name}",
                plain_language_reason=(
                    f"You've been paying R{first_amount:.2f} to {merchant_name} every month for {months_span:.1f} months. "
                    f"That's about R{monthly_cost:.0f} per month. Check if you still need this."
                ),
                severity=severity,
                transaction_id=str(group["id"].iloc[-1]),
                estimated_monthly_cost=monthly_cost,
                evidence={
                    "merchant": merchant_name,
                    "amount": float(first_amount),
                    "frequency_per_month": round(freq_per_month, 2),
                    "months_active": round(months_span, 1),
                    "total_occurrences": len(group),
                    "last_occurrence": last_date.isoformat(),
                },
            )
        )

    return leaks

