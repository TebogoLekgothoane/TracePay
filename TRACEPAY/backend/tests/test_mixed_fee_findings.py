"""Specific fee findings stay available when another fee subtype is also present."""

from datetime import date, datetime, timezone
from decimal import Decimal

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.intelligence_report import assemble_financial_intelligence_report
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions


def _classified(
    transaction_id: str,
    amount: str,
    when: date,
    description: str,
) -> FeatureTransaction:
    categorisation = classify_transaction(description, "debit")
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=categorisation.merchant_name,
        description=description,
        transaction_type="debit",
        categorisation=categorisation,
    )


def _month_end(month: int) -> date:
    return date(2026, month, 30 if month == 9 else 2)


def _analyse(transactions: list[FeatureTransaction]):
    snapshot = build_financial_features("user-a", transactions)
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
    return snapshot, behaviours, leaks, reasoning, recommendations, report


def _audit_fees() -> list[FeatureTransaction]:
    transactions = []
    for month in (7, 8, 9):
        transactions.append(
            _classified(f"account-{month}", "50", _month_end(month), "MONTHLY ACCOUNT FEE")
        )
        foreign_amount = "120" if month == 9 else "20"
        transactions.append(
            _classified(
                f"foreign-{month}",
                foreign_amount,
                date(2026, month, 9),
                "FOREIGN TRANSACTION FEE",
            )
        )
    return transactions


def test_rising_foreign_fees_stay_specific_beside_flat_account_fees() -> None:
    transactions = [
        *_audit_fees(),
        _classified("shop", "40", date(2026, 8, 12), "CHECKERS"),
    ]
    snapshot, behaviours, leaks, reasoning, recommendations, _report = _analyse(transactions)
    fee_leaks = [item for item in leaks.leaks if item.leak_type == "bank_fee_leak"]
    leak = fee_leaks[0]
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == analysis.reasoning_id
    )

    assert snapshot.fees.account_fee_total == Decimal("150")
    assert snapshot.fees.foreign_transaction_fee_total == Decimal("160")
    assert snapshot.fees.bank_fee_total == Decimal("310")
    assert [month.foreign_transaction_fee_total for month in snapshot.months] == [
        Decimal("20"),
        Decimal("20"),
        Decimal("120"),
    ]
    assert [month.total_outflow for month in snapshot.months] == [
        Decimal("0"),
        Decimal("40"),
        Decimal("0"),
    ]
    assert len(fee_leaks) == 1
    assert leak.evidence["finding_focus"] == "foreign_transaction_fee"
    assert leak.title == "Potential foreign transaction fee burden"
    assert leak.estimated_monthly_impact == Decimal("100")
    assert leak.evidence.get("finding_focus") != "monthly_banking_fee_trend"
    assert analysis.root_cause_type == "fee_accumulation"
    assert "foreign transaction fees" in analysis.explanation
    assert recommendation.recommendation_type == "review_bank_fees"
    assert recommendation.supported_impact_amount == Decimal("100")
    assert recommendation.expected_savings_amount is None
    assert "spending_increase" not in {item.behavior_type for item in behaviours.observations}
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}


def test_rising_account_fees_stay_generic_beside_flat_foreign_fees() -> None:
    transactions = []
    for month, account_amount in ((7, "50"), (8, "90"), (9, "150")):
        transactions.append(
            _classified(f"account-{month}", account_amount, _month_end(month), "MONTHLY ACCOUNT FEE")
        )
        transactions.append(
            _classified(f"foreign-{month}", "20", date(2026, month, 9), "FOREIGN TRANSACTION FEE")
        )
    _snapshot, _behaviours, leaks, *_rest = _analyse(transactions)
    fee_leaks = [item for item in leaks.leaks if item.leak_type == "bank_fee_leak"]

    assert len(fee_leaks) == 1
    assert fee_leaks[0].evidence["finding_focus"] == "monthly_banking_fee_trend"
    assert fee_leaks[0].title == "Potential monthly banking fee increase"
    assert fee_leaks[0].estimated_monthly_impact == Decimal("80")
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}


def test_service_charges_without_a_subtype_stay_generic() -> None:
    transactions = [
        _classified(f"charge-{month}", amount, _month_end(month), "SERVICE CHARGE")
        for month, amount in ((7, "20"), (8, "20"), (9, "80"))
    ]
    assert {item.categorisation.transaction_class for item in transactions} == {"bank_fee"}
    snapshot, _behaviours, leaks, *_rest = _analyse(transactions)
    fee_leaks = [item for item in leaks.leaks if item.leak_type == "bank_fee_leak"]

    assert snapshot.fees.bank_fee_total == Decimal("120")
    assert snapshot.fees.foreign_transaction_fee_total is None
    assert snapshot.fees.account_fee_total == Decimal("120")
    assert len(fee_leaks) == 1
    assert fee_leaks[0].evidence["finding_focus"] == "monthly_banking_fee_trend"
    assert fee_leaks[0].evidence["fee_type_breakdown"]["service_charges"] == Decimal("120")
    assert "spending_escalation_leak" not in {item.leak_type for item in leaks.leaks}


def test_fee_and_spending_inventory_lines_are_not_additive() -> None:
    transactions = [
        *_audit_fees(),
        _classified("shop-7", "100", date(2026, 7, 10), "CHECKERS"),
        _classified("shop-8", "100", date(2026, 8, 10), "CHECKERS"),
        _classified("shop-9", "400", date(2026, 9, 28), "CHECKERS"),
    ]
    _snapshot, _behaviours, leaks, _reasoning, recommendations, report = _analyse(transactions)
    summary = report.financial_summary
    fee_amounts = [line.amount for line in summary.inventories.observed_fee_activity]
    increase_amounts = [line.amount for line in summary.inventories.observed_increase]
    inventory_amounts = [
        line.amount
        for lines in (
            summary.inventories.observed_fee_activity,
            summary.inventories.observed_increase,
            summary.inventories.observed_recurring,
            summary.inventories.recovery_candidates,
        )
        for line in lines
    ]

    assert any(item.leak_type == "bank_fee_leak" for item in leaks.leaks)
    assert any(item.leak_type == "spending_escalation_leak" for item in leaks.leaks)
    assert summary.amounts_are_additive is False
    assert summary.expected_savings.availability == "unavailable"
    assert fee_amounts == [Decimal("100")]
    assert Decimal("300") in increase_amounts
    assert Decimal("400") not in inventory_amounts
    assert all(item.expected_savings_amount is None for item in recommendations.recommendations)
