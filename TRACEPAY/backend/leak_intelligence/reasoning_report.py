"""Sanitized reporting for deterministic financial reasoning results."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .reasoning_models import FinancialReasoningResult


def render_financial_reasoning_report(result: FinancialReasoningResult) -> str:
    """Render aggregate explanations without raw transaction references or advice."""
    lines = [
        "========================================",
        "TRACEPAY FINANCIAL REASONING REPORT",
        "========================================",
        "",
        f"Transactions analysed: {result.transaction_count}",
        f"Potential leaks analysed: {result.potential_leaks_analyzed}",
    ]
    if not result.analyses:
        lines.append("No detected potential leaks required root-cause analysis.")
        return "\n".join(lines)

    for index, analysis in enumerate(result.analyses, start=1):
        impact = analysis.impact_assessment
        impact_period = (
            "one time" if impact.impact_kind == "one_time" else "per month"
        )
        lines.extend(
            [
                "",
                "---" if index > 1 else "",
                f"{index}. {analysis.title}",
                "",
                "Detected impact:",
                f"R{_money(impact.detected_amount)} {impact_period}",
                "",
                "Potentially avoidable:",
                _optional_money(impact.potentially_avoidable_amount, impact_period),
                "",
                "Potentially recoverable:",
                _optional_money(impact.recoverable_amount, "one time"),
                "",
                f"Primary driver: {_root_cause_label(analysis.root_cause_type)}",
                f"Persistence: {analysis.persistence.replace('_', ' ').title()}",
                f"Root cause confidence: {analysis.confidence:.2f}",
                f"Avoidability: {analysis.avoidability.title()}",
                f"Analysis status: {analysis.analysis_status.replace('_', ' ').title()}",
                "",
                "Explanation:",
                analysis.explanation,
            ]
        )
    return "\n".join(lines)


def _optional_money(value: Decimal | None, period: str) -> str:
    if value is None:
        return "Unknown"
    return f"R{_money(value)} {period}"


def _money(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{rounded:,.2f}"


def _root_cause_label(value: str) -> str:
    labels = {
        "frequency_increase": "Transaction frequency increased",
        "amount_increase": "Average transaction value increased",
        "price_increase": "Average transaction value increased at a contributing merchant",
        "recurring_commitment": "Stable recurring payment pattern",
        "fee_accumulation": "Fee activity accumulated",
        "potential_duplicate": "Potential duplicate requires verification",
        "category_growth": "Category spending increased",
        "transaction_pattern": "Combined transaction pattern",
        "insufficient_evidence": "Insufficient evidence to identify one cause",
    }
    return labels.get(value, value.replace("_", " ").title())
