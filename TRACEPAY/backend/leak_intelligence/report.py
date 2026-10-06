"""Sanitized, aggregate-only reporting for financial feature snapshots."""

from __future__ import annotations

from .models import FinancialFeatureSnapshot


def render_feature_report(snapshot: FinancialFeatureSnapshot) -> str:
    """Render a development report without descriptions, references, or account data."""
    recurring = sum(
        feature.recurrence.recurrence_strength in {"medium", "high"}
        for feature in snapshot.merchants
    )
    price_changes = sum(
        feature.merchant_amount_trend is not None
        and feature.merchant_amount_trend.amount_change not in (None, 0)
        for feature in snapshot.merchants
    )
    return "\n".join(
        [
            "========================================",
            "TRACEPAY FINANCIAL FEATURE REPORT",
            "========================================",
            "",
            f"Transactions analysed: {snapshot.transaction_count}",
            f"Date range: {_date_range(snapshot)}",
            "Users: 1",
            f"Merchants analysed: {len(snapshot.merchants)}",
            f"Categories analysed: {len(snapshot.categories)}",
            f"Recurring candidates: {recurring}",
            f"Bank fee total: {snapshot.fees.bank_fee_total}",
            f"ATM withdrawals: {snapshot.cash.cash_withdrawal_count}",
            f"Income events: {snapshot.income.income_transaction_count}",
            f"Monthly periods: {len(snapshot.months)}",
            f"Merchant price-change candidates: {price_changes}",
            f"Potential duplicate groups: {len(snapshot.duplicate_candidates)}",
        ]
    )


def _date_range(snapshot: FinancialFeatureSnapshot) -> str:
    if snapshot.date_start is None or snapshot.date_end is None:
        return "Unavailable"
    return f"{snapshot.date_start.isoformat()} to {snapshot.date_end.isoformat()}"
