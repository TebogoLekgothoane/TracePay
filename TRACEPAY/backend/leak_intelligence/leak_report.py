"""Sanitized reporting for potential financial leak detections."""

from __future__ import annotations

from collections import Counter
from decimal import ROUND_HALF_UP, Decimal

from .leak_models import LeakDetection, LeakDetectionResult

_RECURRING_TYPES = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "bank_fee_leak",
        "cash_usage_leak",
    }
)
_ESCALATION_TYPES = frozenset(
    {
        "spending_escalation_leak",
        "food_spending_leak",
        "transport_spending_leak",
        "airtime_data_leak",
    }
)


def render_leak_report(result: LeakDetectionResult) -> str:
    """Render aggregate findings without raw transaction details or advice."""
    lines = [
        "========================================",
        "TRACEPAY LEAK INTELLIGENCE REPORT",
        "========================================",
        "",
        f"Transactions analysed: {result.transaction_count}",
        f"Total potential signals: {len(result.leaks)}",
    ]
    if not result.leaks:
        lines.append("No potential leaks met the minimum evidence threshold.")
        return "\n".join(lines)

    counts = Counter(leak.leak_type for leak in result.leaks)
    recurring = sum(counts[t] for t in counts if t in _RECURRING_TYPES)
    escalation = sum(counts[t] for t in counts if t in _ESCALATION_TYPES)
    fee = counts.get("bank_fee_leak", 0)
    duplicate = counts.get("duplicate_payment_leak", 0)

    lines.extend(
        [
            "",
            "Summary:",
            f"  Recurring / fee-style signals: {recurring}",
            f"  Spending escalation signals: {escalation}",
            f"  Bank fee signals: {fee}",
            f"  Duplicate verification candidates: {duplicate}",
            "",
            "Potential financial signals (not confirmed leaks):",
        ]
    )
    for index, leak in enumerate(result.leaks, start=1):
        lines.extend(_leak_lines(index, leak))
    return "\n".join(lines)


def _leak_lines(index: int, leak: LeakDetection) -> list[str]:
    primary_label, primary_value = _primary_impact(leak)
    return [
        "",
        f"{index}. {_public_title(leak.leak_type, leak.title)}",
        f"   {primary_label}: {primary_value}",
        f"   Estimated annual impact: {_annual_impact(leak)}",
        f"   Impact type: {leak.impact_kind}",
        f"   Confidence: {leak.confidence:.2f}",
        f"   Severity: {leak.severity.title()}",
    ]


def _primary_impact(leak: LeakDetection) -> tuple[str, str]:
    if leak.impact_kind == "one_time":
        return "Potential amount", _money(leak.estimated_monthly_impact)
    return "Monthly impact", _money(leak.estimated_monthly_impact)


def _annual_impact(leak: LeakDetection) -> str:
    if leak.estimated_annual_impact is None:
        return "Not annualised"
    return _money(leak.estimated_annual_impact)


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _public_title(leak_type: str, fallback: str) -> str:
    """Reports remain safe to share when merchant grouping used description fallback."""
    generic = {
        "subscription_leak": "Potential subscription payment",
        "recurring_payment_leak": "Potential recurring payment",
        "unknown_recurring_payment": "Potential recurring payment",
        "duplicate_payment_leak": "Potential duplicate payment requires verification",
        "bank_fee_leak": "Potential recurring banking fee burden",
        "spending_escalation_leak": "Potential spending escalation",
    }
    return generic.get(leak_type, fallback)
