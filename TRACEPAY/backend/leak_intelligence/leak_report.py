"""Sanitized reporting for potential financial leak detections."""

from __future__ import annotations

from .leak_models import LeakDetectionResult


def render_leak_report(result: LeakDetectionResult) -> str:
    """Render aggregate findings without raw transaction details or advice."""
    lines = [
        "========================================",
        "TRACEPAY LEAK INTELLIGENCE REPORT",
        "========================================",
        "",
        f"Transactions analysed: {result.transaction_count}",
        f"Potential financial leaks: {len(result.leaks)}",
    ]
    if not result.leaks:
        lines.append("No potential leaks met the minimum evidence threshold.")
        return "\n".join(lines)
    lines.append("")
    lines.append("Potential financial leaks:")
    for index, leak in enumerate(result.leaks, start=1):
        lines.extend(
            [
                "",
                f"{index}. {_public_title(leak.leak_type, leak.title)}",
                f"   Current monthly impact: {leak.estimated_monthly_impact}",
                f"   Estimated annual impact: {leak.estimated_annual_impact or 'Not annualised'}",
                f"   Impact type: {leak.impact_kind}",
                f"   Confidence: {leak.confidence:.2f}",
                f"   Severity: {leak.severity.title()}",
            ]
        )
    return "\n".join(lines)


def _public_title(leak_type: str, fallback: str) -> str:
    """Reports remain safe to share when merchant grouping used description fallback."""
    generic = {
        "subscription_leak": "Potential recurring subscription payment",
        "recurring_payment_leak": "Potential recurring payment",
        "unknown_recurring_payment": "Potential unknown recurring payment",
        "duplicate_payment_leak": "Potential duplicate payment requires verification",
    }
    return generic.get(leak_type, fallback)
