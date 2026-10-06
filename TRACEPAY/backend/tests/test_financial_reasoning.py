from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.reasoning_engine import (
    analyze_financial_reasoning,
    classify_persistence,
)
from leak_intelligence.reasoning_report import render_financial_reasoning_report


def _transaction(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    merchant: str = "SHOP",
    category: str = "Groceries",
    transaction_class: str = "spending",
    confidence: float = 0.95,
    description: str | None = None,
    user_id: str = "user-a",
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id=user_id,
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant,
        description=description or merchant,
        transaction_type="debit",
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=confidence,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=confidence,
            merchant_name=merchant,
        ),
    )


def _pipeline(transactions: list[FeatureTransaction], user_id: str = "user-a"):
    snapshot = build_financial_features(user_id, transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    return snapshot, behaviours, leaks, reasoning


def _spending_month(
    month: int,
    amounts: list[str],
    *,
    category: str = "Groceries",
) -> list[FeatureTransaction]:
    return [
        _transaction(
            f"{month}-{index}",
            amount,
            date(
                2026,
                month,
                30 if month == 9 and index == len(amounts) - 1 else index + 1,
            ),
            merchant=f"SHOP-{month}-{index}",
            category=category,
        )
        for index, amount in enumerate(amounts)
    ]


def _analysis_for_type(reasoning, leak_type: str):
    leak_ids = {
        leak.leak_id
        for leak in reasoning[2].leaks
        if leak.leak_type == leak_type
    }
    return next(
        analysis
        for analysis in reasoning[3].analyses
        if analysis.leak_id in leak_ids
    )


def test_frequency_driven_escalation() -> None:
    pipeline = _pipeline(
        _spending_month(7, ["100", "100"])
        + _spending_month(8, ["100", "100"])
        + _spending_month(9, ["100", "100", "100", "100", "100"])
    )
    analysis = _analysis_for_type(pipeline, "spending_escalation_leak")
    assert analysis.root_cause_type == "frequency_increase"
    assert analysis.evidence["previous_transaction_count"] == Decimal("2")
    assert analysis.evidence["current_transaction_count"] == Decimal("5")


def test_amount_driven_escalation() -> None:
    pipeline = _pipeline(
        _spending_month(7, ["100", "100"])
        + _spending_month(8, ["100", "100"])
        + _spending_month(9, ["250", "250"])
    )
    analysis = _analysis_for_type(pipeline, "spending_escalation_leak")
    assert analysis.root_cause_type == "amount_increase"
    assert analysis.evidence["previous_average_transaction_amount"] == Decimal("100")
    assert analysis.evidence["current_average_transaction_amount"] == Decimal("250")


def test_combined_frequency_and_amount_increase_records_competing_causes() -> None:
    pipeline = _pipeline(
        _spending_month(7, ["100", "100"])
        + _spending_month(8, ["100", "100"])
        + _spending_month(9, ["200", "200", "200", "200"])
    )
    analysis = _analysis_for_type(pipeline, "spending_escalation_leak")
    assert analysis.root_cause_type == "transaction_pattern"
    assert analysis.analysis_status == "competing_explanations"
    assert analysis.competing_explanations == [
        "frequency_increase",
        "amount_increase",
    ]


def test_price_reasoning_describes_average_value_not_merchant_pricing() -> None:
    fast_food = [
        _transaction("fast-7-1", "100", date(2026, 7, 1), merchant="FAST", category="Fast Food"),
        _transaction("fast-7-2", "100", date(2026, 7, 15), merchant="FAST", category="Fast Food"),
        _transaction("fast-8-1", "100", date(2026, 8, 1), merchant="FAST", category="Fast Food"),
        _transaction("fast-8-2", "100", date(2026, 8, 15), merchant="FAST", category="Fast Food"),
        _transaction("fast-9-1", "300", date(2026, 9, 1), merchant="FAST", category="Fast Food"),
        _transaction("fast-9-2", "300", date(2026, 9, 15), merchant="FAST", category="Fast Food"),
    ]
    groceries = [
        _transaction(
            f"grocery-{month}",
            "800",
            date(2026, month, 30 if month == 9 else 28),
            merchant="GROCERY",
        )
        for month in (7, 8, 9)
    ]
    pipeline = _pipeline(fast_food + groceries)
    analysis = _analysis_for_type(pipeline, "food_spending_leak")
    assert analysis.root_cause_type == "price_increase"
    assert "average transaction value" in analysis.explanation.lower()
    assert "does not establish" in analysis.explanation.lower()
    assert "the merchant increased its prices" not in analysis.explanation.lower()


def test_recurring_payment_reasoning_is_neutral_and_persistent() -> None:
    transactions = [
        _transaction(
            f"subscription-{index}",
            "149",
            when,
            merchant="STREAMING",
            category="Subscriptions",
        )
        for index, when in enumerate(
            (
                date(2026, 7, 1),
                date(2026, 8, 1),
                date(2026, 9, 1),
                date(2026, 10, 1),
            )
        )
    ]
    pipeline = _pipeline(transactions)
    analysis = _analysis_for_type(pipeline, "subscription_leak")
    assert analysis.root_cause_type == "recurring_commitment"
    assert analysis.persistence == "persistent"
    assert analysis.avoidability == "unknown"
    assert "unwanted" not in analysis.explanation.lower()
    assert "cancel" not in analysis.explanation.lower()


def test_bank_fee_reasoning_uses_only_identified_subtypes() -> None:
    fees = [
        _transaction(
            "fee-7",
            "10",
            date(2026, 7, 2),
            merchant="BANK",
            category="Bank Fees",
            transaction_class="bank_fee",
            description="ATM FEE",
        ),
        _transaction(
            "fee-8",
            "20",
            date(2026, 8, 2),
            merchant="BANK",
            category="Bank Fees",
            transaction_class="bank_fee",
            description="ATM FEE",
        ),
        _transaction(
            "fee-9",
            "80",
            date(2026, 9, 30),
            merchant="BANK",
            category="Bank Fees",
            transaction_class="bank_fee",
            description="ATM FEE",
        ),
    ]
    pipeline = _pipeline(fees)
    analysis = _analysis_for_type(pipeline, "bank_fee_leak")
    assert analysis.root_cause_type == "fee_accumulation"
    assert "atm_fee_total" in analysis.evidence["identified_fee_subtypes"]
    assert analysis.avoidability == "medium"
    assert analysis.impact_assessment.potentially_avoidable_amount is None


def test_duplicate_reasoning_is_one_time_and_requires_verification() -> None:
    transactions = [
        _transaction("dup-1", "50", date(2026, 7, 1), merchant="COFFEE"),
        _transaction("dup-2", "50", date(2026, 7, 1), merchant="COFFEE"),
        _transaction("history", "100", date(2026, 9, 30), merchant="SHOP"),
    ]
    pipeline = _pipeline(transactions)
    analysis = _analysis_for_type(pipeline, "duplicate_payment_leak")
    impact = analysis.impact_assessment
    assert analysis.root_cause_type == "potential_duplicate"
    assert analysis.analysis_status == "verification_required"
    assert analysis.avoidability == "high"
    assert impact.impact_kind == "one_time"
    assert impact.detected_annual_amount is None
    assert impact.recoverable_amount == Decimal("50")
    assert "fraud" in analysis.explanation.lower()
    assert "does not establish" in analysis.explanation.lower()


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ([Decimal("0"), Decimal("0"), Decimal("100")], "new"),
        ([Decimal("100"), Decimal("105"), Decimal("250")], "temporary"),
        ([Decimal("100"), Decimal("130"), Decimal("180")], "increasing"),
        ([Decimal("180"), Decimal("130"), Decimal("100")], "declining"),
        ([Decimal("100"), Decimal("98"), Decimal("102")], "persistent"),
        ([Decimal("100")], "insufficient_history"),
    ],
)
def test_persistence_classification(values, expected: str) -> None:
    assert classify_persistence(values) == expected


def test_insufficient_evidence_is_explicit() -> None:
    pipeline = _pipeline(
        _spending_month(7, ["100"])
        + _spending_month(8, ["200"])
        + _spending_month(9, ["500"])
    )
    leak = next(
        item
        for item in pipeline[2].leaks
        if item.leak_type == "spending_escalation_leak"
    )
    incomplete = leak.model_copy(update={"evidence": {}})
    leaks = pipeline[2].model_copy(update={"leaks": [incomplete]})
    result = analyze_financial_reasoning(pipeline[0], pipeline[1], leaks)
    assert result.analyses[0].root_cause_type == "insufficient_evidence"
    assert result.analyses[0].analysis_status == "insufficient_evidence"


def test_root_cause_confidence_is_independent_of_leak_confidence() -> None:
    pipeline = _pipeline(
        _spending_month(7, ["100", "100"])
        + _spending_month(8, ["100", "100"])
        + _spending_month(9, ["250", "250"])
    )
    leak = next(
        item
        for item in pipeline[2].leaks
        if item.leak_type == "spending_escalation_leak"
    )
    analysis = _analysis_for_type(pipeline, "spending_escalation_leak")
    changed_leak = leak.model_copy(update={"confidence": 0.31})
    changed_result = pipeline[2].model_copy(update={"leaks": [changed_leak]})
    recalculated = analyze_financial_reasoning(
        pipeline[0],
        pipeline[1],
        changed_result,
    )
    assert recalculated.analyses[0].confidence == analysis.confidence
    assert 0 <= analysis.confidence <= 1


def test_empty_and_single_transaction_datasets_have_no_reasoning() -> None:
    assert _pipeline([])[3].analyses == []
    assert _pipeline([_transaction("one", "100", date(2026, 8, 1))])[3].analyses == []


def test_reasoning_rejects_cross_user_inputs() -> None:
    user_a = _pipeline(
        _spending_month(7, ["100"])
        + _spending_month(8, ["200"])
        + _spending_month(9, ["500"])
    )
    user_b_snapshot = user_a[0].model_copy(update={"user_id": "user-b"})
    with pytest.raises(ValueError, match="same user"):
        analyze_financial_reasoning(user_b_snapshot, user_a[1], user_a[2])


def test_reasoning_report_separates_detected_and_recoverable_impact() -> None:
    pipeline = _pipeline(
        [
            _transaction("dup-1", "50", date(2026, 7, 1), merchant="COFFEE"),
            _transaction("dup-2", "50", date(2026, 7, 1), merchant="COFFEE"),
            _transaction("history", "100", date(2026, 9, 30), merchant="SHOP"),
        ]
    )
    report = render_financial_reasoning_report(pipeline[3])
    assert "Detected impact:" in report
    assert "Potentially avoidable:\nUnknown" in report
    assert "Potentially recoverable:\nR50.00 one time" in report
    assert "recommend" not in report.lower()
    assert "guaranteed" not in report.lower()


def test_financial_reasoning_endpoint_requires_authentication() -> None:
    assert TestClient(app).get("/financial-reasoning").status_code == 401


def test_financial_reasoning_endpoint_is_sanitized(monkeypatch) -> None:
    pipeline = _pipeline(
        [
            _transaction(
                f"recurring-{index}",
                "69.99",
                when,
                merchant="ACCOUNT ID US FOR",
                category="Software",
                description="ACCOUNT ID US FOR REF 123456789",
            )
            for index, when in enumerate(
                (
                    date(2026, 7, 1),
                    date(2026, 8, 1),
                    date(2026, 9, 1),
                    date(2026, 10, 1),
                )
            )
        ]
    )

    async def fake_reasoning(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return pipeline[3]

    monkeypatch.setattr(
        "app.main.build_user_financial_reasoning",
        fake_reasoning,
    )
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/financial-reasoning",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "123456789" not in response.text
    assert "ACCOUNT ID US FOR" not in response.text
    assert "merchants[ACCOUNT" not in response.text
    assert "transaction_ids" not in response.text
    assert response.json()["potential_leaks_analyzed"] == 1
