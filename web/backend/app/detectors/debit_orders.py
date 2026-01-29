from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from .models import Leak


def detect_debit_orders(df: pd.DataFrame) -> List[Leak]:
    """
    Debit Order Analysis:
    Flag high-value or frequent debit orders that might be problematic.
    """
    if df.empty:
        return []

    debit_order_keywords = [
        "debit order",
        "debitorder",
        "debit",
        "stop order",
        "recurring",
        "deduction",
        "auto debit",
    ]

    text = (df["description"].fillna("") + " " + df["merchant"].fillna("") + " " + df["category"].fillna("")).str.lower()
    is_debit_order = text.apply(lambda s: any(k in s for k in debit_order_keywords))

    debit_orders = df[is_debit_order & (df["direction"] == "debit") & (df["abs_amount"] > 0)].copy()
    if debit_orders.empty:
        return []

    now = pd.Timestamp.now(tz="UTC") if not df["timestamp"].empty else pd.Timestamp.now(tz="UTC")
    last_30 = debit_orders[debit_orders["timestamp"] >= (now - pd.Timedelta(days=30))]

    if last_30.empty:
        return []

    monthly_cost = float(last_30["abs_amount"].sum())
    count = len(last_30)

    # Group by merchant/amount to find recurring patterns
    leaks = []

    # Check for high-value single debit orders
    high_value = last_30[last_30["abs_amount"] >= 500]
    if not high_value.empty:
        for _, row in high_value.iterrows():
            leaks.append(
                Leak(
                    id=f"debit-order-high-{row['id']}",
                    detector="DebitOrders",
                    title=f"High-value debit order: R{row['abs_amount']:.0f}",
                    plain_language_reason=(
                        f"A debit order of R{row['abs_amount']:.0f} was processed. "
                        f"Make sure this is expected and authorized."
                    ),
                    severity="high",
                    transaction_id=str(row["id"]),
                    estimated_monthly_cost=float(row["abs_amount"]),
                    evidence={
                        "amount": float(row["abs_amount"]),
                        "merchant": str(row.get("merchant", "")),
                        "description": str(row.get("description", "")),
                        "date": row["timestamp"].isoformat(),
                    },
                )
            )

    # Check for frequent small debit orders (potential scam)
    if count >= 5 and monthly_cost >= 200:
        severity = "high" if monthly_cost >= 500 else "medium"
        top_merchant = last_30.groupby("merchant")["abs_amount"].sum().sort_values(ascending=False)
        top_merchant_name = top_merchant.index[0] if not top_merchant.empty else "Various"

        leaks.append(
            Leak(
                id="debit-order-frequent",
                detector="DebitOrders",
                title="Multiple debit orders detected",
                plain_language_reason=(
                    f"You have {count} debit orders in the last 30 days totaling R{monthly_cost:.0f}. "
                    f"Top merchant: {top_merchant_name}. Review these to ensure they're all legitimate."
                ),
                severity=severity,
                transaction_id=str(last_30.sort_values("timestamp").iloc[-1]["id"]),
                estimated_monthly_cost=monthly_cost,
                evidence={
                    "count_last_30_days": count,
                    "sum_last_30_days": monthly_cost,
                    "top_merchants": top_merchant.head(5).to_dict(),
                },
            )
        )

    return leaks

