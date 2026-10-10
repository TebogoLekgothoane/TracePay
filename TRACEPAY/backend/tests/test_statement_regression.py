"""One synthetic South African statement through categorisation and intelligence."""

from datetime import date, datetime, timezone
from decimal import Decimal
import re

import pytest

from categorisation.merchant_memory import MerchantMemory
from categorisation.service import CategorisableTransaction, categorise_batch
from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.intelligence_report import assemble_financial_intelligence_report
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from tests.test_categorisation import LIVE_CATEGORIES

_USER_ID = "user-a"


def _rows() -> list[tuple[CategorisableTransaction, date]]:
    dated: list[tuple[CategorisableTransaction, date]] = []

    def record(transaction_id: str, amount: str, when: date, description: str, kind: str) -> None:
        dated.append(
            (
                CategorisableTransaction(transaction_id, description, Decimal(amount), kind),
                when,
            )
        )

    for month in (7, 8, 9):
        salary_day = 30 if month == 9 else 25
        record(f"salary-{month}", "22000", date(2026, month, salary_day), "SALARY ACME", "credit")
        record(
            f"goalsave-{month}",
            "1500",
            date(2026, month, 26),
            "Money transferred out from GoalSave",
            "debit",
        )
        record(f"deposit-{month}", "1000", date(2026, month, 1), "FIXED DEPOSIT CONTRIBUTION", "debit")
        record(f"netflix-{month}", "199", date(2026, month, 5), "NETFLIX", "debit")
        record(f"account-{month}", "50", date(2026, month, 2), "MONTHLY ACCOUNT FEE", "debit")
        record(f"service-{month}", "15", date(2026, month, 3), "SERVICE CHARGE", "debit")
        foreign_amount = "120" if month == 9 else "20"
        record(
            f"foreign-{month}",
            foreign_amount,
            date(2026, month, 9),
            "FOREIGN TRANSACTION FEE",
            "debit",
        )
        shop_amount = "400" if month == 9 else "100"
        record(f"shop-{month}", shop_amount, date(2026, month, 12), "SHOPRITE", "debit")

    record("checkers", "40", date(2026, 8, 14), "CHECKERS", "debit")
    record("woolworths", "186.40", date(2026, 7, 18), "WOOLWORTHS", "debit")
    record("woolworths-refund", "186.40", date(2026, 7, 18), "WOOLWORTHS REFUND", "credit")
    record("kfc-1", "89.90", date(2026, 9, 4), "KFC", "debit")
    record("kfc-2", "89.90", date(2026, 9, 4), "KFC", "debit")
    return dated


@pytest.fixture(name="statement")
def statement_pipeline(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    dated = _rows()
    classified = categorise_batch(
        [item for item, _when in dated],
        LIVE_CATEGORIES,
        merchant_memory=MerchantMemory(),
    )
    transactions = [
        feature_transaction_from_row(
            {
                "id": item.transaction_id,
                "user_id": _USER_ID,
                "date": when.isoformat(),
                "description": item.description,
                "amount": str(item.amount),
                "type": item.transaction_type,
                "is_duplicate": False,
                "merchant_name": classified[item.transaction_id].merchant_name,
                "category_confidence": classified[item.transaction_id].category_confidence,
                "category_rule": classified[item.transaction_id].rule,
                "transaction_class": classified[item.transaction_id].transaction_class,
                "classification_confidence": classified[item.transaction_id].classification_confidence,
                "classification_reason": classified[item.transaction_id].classification_reason,
                "categories": (
                    {"name": classified[item.transaction_id].category_name}
                    if classified[item.transaction_id].category_name
                    else None
                ),
            },
            expected_user_id=_USER_ID,
        )
        for item, when in dated
    ]
    snapshot = build_financial_features(_USER_ID, transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)
    report = assemble_financial_intelligence_report(
        snapshot,
        behaviours,
        leaks,
        reasoning,
        recommendations,
        generated_at=datetime(2026, 10, 10, tzinfo=timezone.utc),
    )
    return {
        "classified": classified,
        "transactions": transactions,
        "snapshot": snapshot,
        "behaviours": behaviours,
        "leaks": leaks,
        "reasoning": reasoning,
        "recommendations": recommendations,
        "report": report,
    }


def test_combined_statement_categorisation_and_purchase_spending(statement) -> None:
    classified = statement["classified"]
    snapshot = statement["snapshot"]
    behaviours = statement["behaviours"]

    assert {classified[f"salary-{month}"].transaction_class for month in (7, 8, 9)} == {"income"}
    assert {classified[f"salary-{month}"].category_name for month in (7, 8, 9)} == {"Salary"}
    assert {classified[f"goalsave-{month}"].transaction_class for month in (7, 8, 9)} == {"internal_transfer"}
    assert {classified[f"deposit-{month}"].transaction_class for month in (7, 8, 9)} == {"savings"}
    assert classified["woolworths-refund"].transaction_class == "unknown"
    assert classified["woolworths-refund"].category_name is None
    assert classified["woolworths-refund"].rule == "description:purchase-reversal"
    assert classified["woolworths"].category_name == "Groceries"
    assert classified["checkers"].transaction_class == "spending"
    assert classified["checkers"].category_name == "Groceries"
    assert {classified[f"account-{month}"].transaction_class for month in (7, 8, 9)} == {"bank_fee"}
    assert {classified[f"service-{month}"].transaction_class for month in (7, 8, 9)} == {"bank_fee"}
    assert {classified[f"foreign-{month}"].transaction_class for month in (7, 8, 9)} == {"bank_fee"}

    assert snapshot.transaction_count == 29
    assert snapshot.income.income_transaction_count == 3
    assert snapshot.income.income_total == Decimal("66000")
    assert snapshot.spending_profile.transfer_total == Decimal("4500")
    assert snapshot.spending_profile.savings_total == Decimal("3000")
    assert snapshot.spending_profile.total_spending == Decimal("1603.20")
    assert snapshot.spending_profile.spending_by_category["Groceries"] == Decimal("826.40")
    assert snapshot.spending_profile.spending_by_category["Subscriptions"] == Decimal("597")
    assert snapshot.spending_profile.spending_by_category["Fast Food"] == Decimal("179.80")
    assert "Transfers" not in snapshot.spending_profile.spending_by_category
    assert "Savings" not in snapshot.spending_profile.spending_by_category
    assert "Bank Fees" not in snapshot.spending_profile.spending_by_category
    assert [month.total_outflow for month in snapshot.months] == [
        Decimal("485.40"),
        Decimal("339.00"),
        Decimal("778.80"),
    ]
    assert snapshot.fees.bank_fee_total == Decimal("355")
    assert snapshot.fees.account_fee_total == Decimal("150")
    assert snapshot.fees.foreign_transaction_fee_total == Decimal("160")
    assert [month.foreign_transaction_fee_total for month in snapshot.months] == [
        Decimal("20"),
        Decimal("20"),
        Decimal("120"),
    ]
    spending_titles = [
        item.title
        for item in behaviours.observations
        if item.behavior_type in {"spending_increase", "category_growth", "merchant_spend_increase"}
        and item.evidence.get("subject") in {"Transfers", "Savings", "Salary", "Bank Fees"}
    ]
    assert spending_titles == []


def test_combined_statement_findings_reasoning_and_report(statement) -> None:
    leaks = statement["leaks"]
    reasoning = statement["reasoning"]
    recommendations = statement["recommendations"]
    report = statement["report"]

    fee_leaks = [item for item in leaks.leaks if item.leak_type == "bank_fee_leak"]
    assert len(fee_leaks) == 1
    assert fee_leaks[0].evidence["finding_focus"] == "foreign_transaction_fee"
    assert fee_leaks[0].title == "Potential foreign transaction fee burden"
    assert fee_leaks[0].estimated_monthly_impact == Decimal("100")
    assert all(
        item.evidence.get("finding_focus") != "monthly_banking_fee_trend" for item in leaks.leaks
    )

    subscription = next(item for item in leaks.leaks if item.leak_type == "subscription_leak")
    assert subscription.evidence["finding_focus"] == "subscription_review"
    assert "Netflix" in subscription.title

    escalation = next(item for item in leaks.leaks if item.leak_type == "spending_escalation_leak")
    assert escalation.estimated_monthly_impact == Decimal("366.60")

    duplicate = next(item for item in leaks.leaks if item.leak_type == "duplicate_payment_leak")
    duplicate_reasoning = next(item for item in reasoning.analyses if item.leak_id == duplicate.leak_id)
    duplicate_recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == duplicate_reasoning.reasoning_id
    )
    assert duplicate.evidence["verification_required"] is True
    assert duplicate.evidence["finding_kind"] == "verification_required"
    assert duplicate_reasoning.avoidability == "unknown"
    assert duplicate_reasoning.impact_assessment.recoverable_amount is None
    assert duplicate_reasoning.impact_assessment.potentially_avoidable_amount is None
    assert duplicate_reasoning.impact_assessment.detected_amount == Decimal("89.90")
    assert duplicate_recommendation.recommendation_type == "verify_potential_duplicate"
    assert duplicate_recommendation.potential_recovery_amount is None
    assert "not recovered money" in duplicate_recommendation.explanation
    assert "has not confirmed" in duplicate_recommendation.explanation

    assert report.report_contract_version == "1.0"
    assert report.analysis.findings_availability == "available"
    reasoning_ids = {item.reasoning_id for item in reasoning.analyses}
    assert {item.leak_id for item in report.findings} == {item.leak_id for item in leaks.leaks}
    for finding in report.findings:
        assert finding.reasoning_id in reasoning_ids
        if finding.recommendation is not None:
            assert finding.recommendation.source_reasoning_id == finding.reasoning_id

    summary = report.financial_summary
    fee_amounts = [line.amount for line in summary.inventories.observed_fee_activity]
    increase_amounts = [line.amount for line in summary.inventories.observed_increase]
    assert summary.amounts_are_additive is False
    assert summary.verified_savings.availability == "unavailable"
    assert summary.expected_savings.availability == "unavailable"
    assert fee_amounts == [Decimal("100")]
    assert Decimal("366.60") in increase_amounts
    assert Decimal("466.60") not in increase_amounts
    assert summary.inventories.recovery_candidates == []
    assert all(item.expected_savings_amount is None for item in recommendations.recommendations)

    rendered = report.model_dump_json()
    assert _USER_ID not in rendered
    assert "merchants[" not in rendered
    assert "months[" not in rendered
    for finding in report.findings:
        for highlight in finding.evidence_highlights:
            assert re.search(r"\d{6,}", str(highlight.value)) is None
