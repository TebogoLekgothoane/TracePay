from __future__ import annotations

import asyncio
import re
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.financial_recommendations import build_user_financial_recommendations
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.reasoning_models import (
    FinancialReasoning,
    FinancialReasoningResult,
    ImpactAssessment,
)
from leak_intelligence.recommendation_engine import recommend_actions

FORBIDDEN_LANGUAGE = re.compile(
    r"waste|you lost|definitely|unnecessary|fraud|unauthori[sz]ed|switch bank|"
    r"subscription|cancel|guaranteed|total savings|\bsave\b|20\s*%|confirmed duplicate|"
    r"confirmed financial loss",
    re.IGNORECASE,
)


def _impact(**overrides) -> ImpactAssessment:
    values = {
        "detected_amount": Decimal("100"),
        "detected_annual_amount": Decimal("1200"),
        "impact_kind": "estimated",
        "potentially_avoidable_amount": None,
        "recoverable_amount": None,
    }
    values.update(overrides)
    return ImpactAssessment(**values)


def _analysis(**overrides) -> FinancialReasoning:
    values = {
        "reasoning_id": "a" * 32,
        "leak_id": "b" * 32,
        "root_cause_type": "fee_accumulation",
        "title": "Banking fee activity accumulated",
        "explanation": "Banking fee activity accumulated across the observed period.",
        "confidence": 0.8,
        "evidence": {"fee_transaction_count": 3},
        "supporting_feature_references": ["fees.bank_fee_total"],
        "impact_assessment": _impact(),
        "avoidability": "unknown",
        "persistence": "persistent",
        "analysis_status": "supported",
    }
    values.update(overrides)
    return FinancialReasoning(**values)


def _result(*analyses: FinancialReasoning, user_id: str = "user-a") -> FinancialReasoningResult:
    return FinancialReasoningResult(
        user_id=user_id,
        transaction_count=12,
        period_start=date(2026, 7, 1),
        period_end=date(2026, 9, 30),
        reasoning_version="1.0",
        potential_leaks_analyzed=len(analyses),
        analyses=list(analyses),
    )


def _one(result: FinancialReasoningResult):
    assert result.recommendation_count == 1
    return result.recommendations[0]


def _assert_safe_language(result: FinancialReasoningResult) -> None:
    for recommendation in result.recommendations:
        text = " ".join(
            (
                recommendation.title,
                recommendation.explanation,
                recommendation.recommended_action,
            )
        )
        assert FORBIDDEN_LANGUAGE.search(text) is None, text
        assert recommendation.expected_savings_amount is None


def test_bank_fee_recommendation_states_unknown_avoidability() -> None:
    recommendation = _one(recommend_actions(_result(_analysis())))
    assert recommendation.recommendation_type == "review_bank_fees"
    assert recommendation.title == "Review banking fees"
    assert "Avoidability has not been determined." in recommendation.explanation
    assert "lower-cost account" in recommendation.recommended_action
    assert "contact the bank" in recommendation.recommended_action
    assert recommendation.priority == "low"
    assert recommendation.expected_savings_amount is None
    assert recommendation.potential_recovery_amount is None
    assert recommendation.impact_label == "observed_fee_activity"
    _assert_safe_language(recommend_actions(_result(_analysis())))


def test_bank_fee_with_known_avoidability_can_be_high_priority() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    avoidability="medium",
                    persistence="persistent",
                    confidence=0.86,
                )
            )
        )
    )
    assert recommendation.priority == "high"
    assert "every fee was optional" in recommendation.explanation
    assert recommendation.recommendation_confidence != 0.86


def test_recurring_commitment_is_a_review_not_a_subscription_instruction() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="c" * 32,
                    root_cause_type="recurring_commitment",
                    title="Stable recurring payment pattern",
                    explanation="Payments followed a billing-like interval.",
                    avoidability="unknown",
                    persistence="persistent",
                    evidence={"observation_count": 4, "average_interval_days": Decimal("30")},
                    supporting_feature_references=["merchants[STREAMING SECRET].recurrence"],
                )
            )
        )
    )
    assert recommendation.recommendation_type == "review_recurring_payment"
    assert recommendation.title == "Review recurring payment"
    assert recommendation.priority == "low"
    assert "still wanted" in recommendation.recommended_action
    assert "will not stop" in recommendation.recommended_action
    assert recommendation.evidence_references == [
        "merchants[*].recurrence",
        f"reasoning:{'c' * 32}",
    ]
    assert recommendation.expected_savings_amount is None
    _assert_safe_language(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="c" * 32,
                    root_cause_type="recurring_commitment",
                    avoidability="unknown",
                )
            )
        )
    )


def test_frequency_driven_food_recommendation_does_not_set_a_budget() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="d" * 32,
                    root_cause_type="frequency_increase",
                    avoidability="medium",
                    persistence="increasing",
                    confidence=0.84,
                    evidence={"category": "Fast Food", "frequency_contribution_share": "0.91"},
                )
            )
        )
    )
    assert recommendation.recommendation_type == "review_high_frequency_spending"
    assert recommendation.title == "Review spending frequency"
    assert recommendation.finding_scope == "contributing_category"
    assert "more related transactions" in recommendation.explanation
    assert "budget" in recommendation.recommended_action
    assert recommendation.impact_label == "detected_increase"
    assert recommendation.expected_savings_amount is None
    assert recommendation.potential_recovery_amount is None


def test_airtime_frequency_recommendation_does_not_prescribe_a_package() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="e" * 32,
                    root_cause_type="frequency_increase",
                    avoidability="medium",
                    evidence={"category": "Airtime & Data"},
                )
            )
        )
    )
    assert recommendation.recommendation_type == "review_airtime_data_usage"
    assert recommendation.title == "Review airtime and data usage"
    assert "specific package" in recommendation.recommended_action
    assert "too high" in recommendation.recommended_action
    assert recommendation.expected_savings_amount is None


def test_overall_frequency_escalation_is_monitored_separately() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="f" * 32,
                    root_cause_type="frequency_increase",
                    avoidability="unknown",
                    persistence="increasing",
                    evidence={"category": None, "frequency_contribution_share": "0.88"},
                )
            )
        )
    )
    assert recommendation.recommendation_type == "monitor_spending_pattern"
    assert recommendation.title == "Monitor spending increase"
    assert recommendation.finding_scope == "overall_pattern"
    assert "transaction frequency was the primary driver" in recommendation.explanation
    assert recommendation.expected_savings_amount is None


def test_duplicate_verification_keeps_recovery_out_of_expected_savings() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="9" * 32,
                    root_cause_type="potential_duplicate",
                    analysis_status="verification_required",
                    avoidability="high",
                    persistence="new",
                    confidence=0.9,
                    evidence={
                        "potential_duplicate_amount": Decimal("50"),
                        "matching_transaction_count": 2,
                        "verification_required": True,
                    },
                    impact_assessment=_impact(
                        detected_amount=Decimal("50"),
                        detected_annual_amount=None,
                        impact_kind="one_time",
                        recoverable_amount=Decimal("50"),
                    ),
                )
            )
        )
    )
    assert recommendation.recommendation_type == "verify_potential_duplicate"
    assert recommendation.title == "Verify potential duplicate payment"
    assert recommendation.priority == "high"
    assert recommendation.finding_scope == "one_time_recovery_candidate"
    assert recommendation.potential_recovery_amount == Decimal("50")
    assert recommendation.expected_savings_amount is None
    assert recommendation.recommendation_confidence <= 0.70
    assert "has not confirmed" in recommendation.explanation
    assert "not recovered money" in recommendation.explanation
    assert "Two transactions" in recommendation.explanation
    _assert_safe_language(
        recommend_actions(
            _result(
                _analysis(
                    reasoning_id="9" * 32,
                    root_cause_type="potential_duplicate",
                    analysis_status="verification_required",
                    avoidability="high",
                    persistence="new",
                    evidence={"matching_transaction_count": 2},
                    impact_assessment=_impact(
                        detected_amount=Decimal("50"),
                        detected_annual_amount=None,
                        impact_kind="one_time",
                        recoverable_amount=Decimal("50"),
                    ),
                )
            )
        )
    )


def test_recommendation_confidence_is_separate_from_root_cause_confidence() -> None:
    analysis = _analysis(confidence=0.8, avoidability="unknown", persistence="temporary")
    recommendation = _one(recommend_actions(_result(analysis)))
    assert recommendation.recommendation_confidence != analysis.confidence
    assert 0.30 <= recommendation.recommendation_confidence <= 0.88


def test_overlapping_findings_are_not_presented_as_additive_savings() -> None:
    result = recommend_actions(
        _result(
            _analysis(
                reasoning_id="1" * 32,
                root_cause_type="frequency_increase",
                evidence={"category": None},
                impact_assessment=_impact(detected_amount=Decimal("485.74")),
            ),
            _analysis(
                reasoning_id="2" * 32,
                leak_id="c" * 32,
                root_cause_type="frequency_increase",
                avoidability="medium",
                evidence={"category": "Fast Food"},
                impact_assessment=_impact(detected_amount=Decimal("180")),
            ),
            _analysis(
                reasoning_id="3" * 32,
                leak_id="d" * 32,
                root_cause_type="frequency_increase",
                avoidability="medium",
                evidence={"category": "Airtime & Data"},
                impact_assessment=_impact(detected_amount=Decimal("90")),
            ),
        )
    )
    by_type = {item.recommendation_type: item for item in result.recommendations}
    assert set(by_type) == {
        "monitor_spending_pattern",
        "review_high_frequency_spending",
        "review_airtime_data_usage",
    }
    assert by_type["monitor_spending_pattern"].finding_scope == "overall_pattern"
    assert by_type["review_high_frequency_spending"].finding_scope == "contributing_category"
    assert result.metadata.amounts_are_additive is False
    assert result.metadata.overlap_note is not None
    assert "Do not add their amounts together." in (
        by_type["monitor_spending_pattern"].explanation
    )
    assert all(item.expected_savings_amount is None for item in result.recommendations)
    assert not hasattr(result, "total_savings")
    _assert_safe_language(result)


def test_duplicate_recommendations_for_the_same_subject_are_suppressed() -> None:
    weaker = _analysis(reasoning_id="a" * 32, confidence=0.62)
    stronger = _analysis(reasoning_id="b" * 32, leak_id="c" * 32, confidence=0.9)
    result = recommend_actions(_result(weaker, stronger))
    assert result.recommendation_count == 1
    assert result.recommendations[0].source_reasoning_id == "b" * 32


def test_distinct_recurring_payments_are_not_collapsed() -> None:
    first = _analysis(
        reasoning_id="a" * 32,
        root_cause_type="recurring_commitment",
        avoidability="unknown",
    )
    second = _analysis(
        reasoning_id="b" * 32,
        leak_id="c" * 32,
        root_cause_type="recurring_commitment",
        avoidability="unknown",
    )
    result = recommend_actions(_result(first, second))
    assert result.recommendation_count == 2
    assert {item.source_reasoning_id for item in result.recommendations} == {
        "a" * 32,
        "b" * 32,
    }


def test_recommendations_stay_inside_the_supplied_user_reasoning() -> None:
    user_a = recommend_actions(
        _result(_analysis(reasoning_id="a" * 32), user_id="user-a")
    )
    user_b = recommend_actions(
        _result(_analysis(reasoning_id="b" * 32), user_id="user-b")
    )
    assert user_a.user_id == "user-a"
    assert user_b.user_id == "user-b"
    assert user_a.recommendations[0].source_reasoning_id != (
        user_b.recommendations[0].source_reasoning_id
    )


def test_composition_rejects_reasoning_for_a_different_user(monkeypatch) -> None:
    async def fake_reasoning(user_id: str, token: str) -> FinancialReasoningResult:
        assert user_id == "user-a"
        assert token == "token"
        return _result(user_id="user-b")

    monkeypatch.setattr(
        "app.financial_recommendations.build_user_financial_reasoning",
        fake_reasoning,
    )
    with pytest.raises(ValueError, match="authenticated user"):
        asyncio.run(build_user_financial_recommendations("user-a", "token"))


def test_empty_reasoning_result_has_no_recommendations() -> None:
    result = recommend_actions(_result())
    assert result.recommendation_count == 0
    assert result.recommendations == []
    assert result.metadata.automated_actions == "none"
    assert result.metadata.amounts_are_additive is False


def test_insufficient_evidence_does_not_produce_a_recommendation() -> None:
    result = recommend_actions(
        _result(
            _analysis(
                root_cause_type="insufficient_evidence",
                analysis_status="insufficient_evidence",
                confidence=0.4,
            )
        )
    )
    assert result.recommendation_count == 0


def test_directly_supported_avoidable_amount_is_not_replaced_by_an_estimate() -> None:
    recommendation = _one(
        recommend_actions(
            _result(
                _analysis(
                    impact_assessment=_impact(
                        detected_amount=Decimal("400"),
                        potentially_avoidable_amount=Decimal("25"),
                    )
                )
            )
        )
    )
    assert recommendation.expected_savings_amount == Decimal("25")
    assert recommendation.supported_impact_amount == Decimal("400")
    assert recommendation.expected_savings_amount != Decimal("80")


def test_cash_pattern_and_non_frequency_food_do_not_invent_frequency_advice() -> None:
    result = recommend_actions(
        _result(
            _analysis(
                reasoning_id="a" * 32,
                root_cause_type="transaction_pattern",
                evidence={"cash_withdrawal_count": 4, "atm_fee_total": Decimal("40")},
            ),
            _analysis(
                reasoning_id="b" * 32,
                leak_id="c" * 32,
                root_cause_type="amount_increase",
                avoidability="medium",
                evidence={"category": "Fast Food"},
            ),
        )
    )
    assert [item.recommendation_type for item in result.recommendations] == [
        "monitor_spending_pattern"
    ]
    assert result.recommendations[0].title == "Monitor spending pattern"
    assert "higher average transaction value" in result.recommendations[0].explanation


def _transaction(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    merchant: str,
    category: str,
    transaction_class: str = "spending",
    description: str | None = None,
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant,
        description=description or merchant,
        transaction_type="debit",
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=0.95,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=0.95,
            merchant_name=merchant,
        ),
    )


def test_recommendations_are_derived_from_pipeline_reasoning() -> None:
    transactions = []
    for month in (7, 8):
        transactions.append(
            _transaction(
                f"grocery-{month}",
                "900",
                date(2026, month, 28),
                merchant="GROCERY",
                category="Groceries",
            )
        )
        transactions.extend(
            _transaction(
                f"food-{month}-{index}",
                "80",
                date(2026, month, index + 1),
                merchant=f"FAST-{month}-{index}",
                category="Fast Food",
            )
            for index in range(2)
        )
        transactions.extend(
            _transaction(
                f"airtime-{month}-{index}",
                "40",
                date(2026, month, index + 10),
                merchant="AIRTIME",
                category="Airtime & Data",
            )
            for index in range(2)
        )
    transactions.append(
        _transaction(
            "grocery-9",
            "900",
            date(2026, 9, 30),
            merchant="GROCERY",
            category="Groceries",
        )
    )
    transactions.extend(
        _transaction(
            f"food-9-{index}",
            "80",
            date(2026, 9, index + 1),
            merchant=f"FAST-9-{index}",
            category="Fast Food",
        )
        for index in range(5)
    )
    transactions.extend(
        _transaction(
            f"airtime-9-{index}",
            "40",
            date(2026, 9, index + 10),
            merchant="AIRTIME",
            category="Airtime & Data",
        )
        for index in range(5)
    )
    transactions.extend(
        _transaction(
            f"fee-{month}",
            "80" if month == 9 else "10",
            date(2026, month, 2 if month < 9 else 30),
            merchant="BANK",
            category="Bank Fees",
            transaction_class="bank_fee",
            description="ATM FEE",
        )
        for month in (7, 8, 9)
    )

    snapshot = build_financial_features("user-a", transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    result = recommend_actions(reasoning)
    types = {item.recommendation_type for item in result.recommendations}
    assert "review_bank_fees" in types
    assert "review_high_frequency_spending" in types
    assert "review_airtime_data_usage" in types
    assert "monitor_spending_pattern" in types
    assert all(item.expected_savings_amount is None for item in result.recommendations)
    assert result.metadata.automated_actions == "none"
    _assert_safe_language(result)


def test_financial_recommendations_endpoint_requires_authentication() -> None:
    assert TestClient(app).get("/financial-recommendations").status_code == 401


def test_financial_recommendations_endpoint_is_sanitized(monkeypatch) -> None:
    reasoning = _result(
        _analysis(
            supporting_feature_references=["merchants[ACCOUNT 123456789].recurrence"],
            evidence={"merchant_name": "SHOULD NOT APPEAR", "transaction_id": "txn-secret"},
        )
    )
    expected = recommend_actions(reasoning)

    async def fake_recommendations(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return expected

    monkeypatch.setattr(
        "app.main.build_user_financial_recommendations",
        fake_recommendations,
    )
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/financial-recommendations",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation_count"] == 1
    assert body["metadata"]["amounts_are_additive"] is False
    assert body["metadata"]["automated_actions"] == "none"
    assert body["recommendations"][0]["expected_savings_amount"] is None
    assert "123456789" not in response.text
    assert "SHOULD NOT APPEAR" not in response.text
    assert "txn-secret" not in response.text
    assert "transaction_id" not in response.text
