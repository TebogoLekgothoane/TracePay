from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from .models import Leak


def detect_vas_charges(df: pd.DataFrame) -> List[Leak]:
    """
    VAS (Value-Added Service) Charges:
    Detect unauthorized or excessive value-added service charges.
    These are often subscription services, premium SMS, or app charges.
    """
    if df.empty:
        return []

    vas_keywords = [
        "vas",
        "value added",
        "premium sms",
        "sms service",
        "subscription",
        "opt-in",
        "opt in",
        "service charge",
        "content charge",
        "ringtone",
        "wallpaper",
        "game",
        "app purchase",
        "in-app",
    ]

    text = (df["description"].fillna("") + " " + df["merchant"].fillna("") + " " + df["category"].fillna("")).str.lower()
    is_vas = text.apply(lambda s: any(k in s for k in vas_keywords))

    vas_transactions = df[is_vas & (df["direction"] == "debit") & (df["abs_amount"] > 0)].copy()
    if vas_transactions.empty:
        return []

    now = pd.Timestamp.now(tz="UTC") if not df["timestamp"].empty else pd.Timestamp.now(tz="UTC")
    last_30 = vas_transactions[vas_transactions["timestamp"] >= (now - pd.Timedelta(days=30))]

    if last_30.empty:
        return []

    monthly_cost = float(last_30["abs_amount"].sum())
    count = len(last_30)

    if monthly_cost < 20 and count < 3:
        return []

    severity = "high" if monthly_cost >= 100 or count >= 10 else "medium"

    # Group by merchant to identify top offenders
    top_merchant = last_30.groupby("merchant")["abs_amount"].sum().sort_values(ascending=False)
    top_merchant_name = top_merchant.index[0] if not top_merchant.empty else "Various services"

    return [
        Leak(
            id="vas-charges",
            detector="VASCharges",
            title="Value-added service charges are adding up",
            plain_language_reason=(
                f"You've paid R{monthly_cost:.0f} in value-added service charges in the last 30 days ({count} charges). "
                f"These are often subscriptions, premium SMS, or app purchases you might have forgotten about. "
                f"Top charge: {top_merchant_name}."
            ),
            severity=severity,
            transaction_id=str(last_30.sort_values("timestamp").iloc[-1]["id"]),
            estimated_monthly_cost=monthly_cost,
            evidence={
                "count_last_30_days": count,
                "sum_last_30_days": monthly_cost,
                "top_merchants": top_merchant.head(5).to_dict(),
                "sample": last_30.sort_values("timestamp").tail(5)[["id", "timestamp", "abs_amount", "description", "merchant"]].to_dict(orient="records"),
            },
        )
    ]

