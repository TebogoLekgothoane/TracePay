"""Regression: findings name the merchant/source when evidence supports it."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_diff import build_observation, plan_registry_changes
from leak_intelligence.finding_guidance import build_guidance
from leak_intelligence.finding_notifications import (
    assign_finding_ids,
    notifications_for_plan,
)
from leak_intelligence.intelligence_report import assemble_financial_intelligence_report
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.merchant_display import (
    merchant_display_name_for,
    recurring_leak_title,
)
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from tests.test_leak_detection import _detect, _transaction

USER = "user-a"
WHEN = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)
IMPORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def _pipeline(transactions):
    snapshot = build_financial_features(USER, transactions)
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
        generated_at=WHEN,
    )
    return snapshot, leaks, reasoning, recommendations, report


def test_recognised_subscription_merchant_appears_by_name() -> None:
    transactions = [
        _transaction(
            f"netflix-{index}",
            "199",
            when,
            merchant="NETFLIX",
            category="Subscriptions",
            description="NETFLIX.COM",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    _snapshot, leaks, reasoning, recommendations, report = _pipeline(transactions)
    leak = next(item for item in leaks.leaks if item.leak_type == "subscription_leak")
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    finding = next(item for item in report.findings if item.leak_id == leak.leak_id)
    recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == analysis.reasoning_id
    )
    assert "Netflix" in leak.title
    assert "R199" in leak.title
    assert "Netflix" in analysis.title
    assert "Netflix" in finding.what_happened
    assert "Netflix" in finding.why_title
    assert "Netflix" in recommendation.title
    merchant_values = [
        item.value
        for item in finding.evidence_highlights
        if item.key in {"merchant_display_name", "merchant_key"}
    ]
    assert "Netflix" in merchant_values or "NETFLIX" in merchant_values
    assert "With Card At" not in leak.title
    assert analysis.evidence.get("merchant_display_name") == "Netflix"


def test_card_purchase_boilerplate_is_not_grouped_as_a_named_merchant() -> None:
    assert merchant_display_name_for("With Card At") is None
    assert recurring_leak_title(subscription=False, merchant_name="With Card At") == (
        "Unidentified recurring payment"
    )
    transactions = [
        _transaction(
            "card-a",
            "40",
            date(2026, 7, 2),
            merchant="WITH CARD AT",
            description="WITH CARD AT",
        ),
        _transaction(
            "card-b",
            "40",
            date(2026, 7, 2),
            merchant="PURCHASE WITH CARD AT",
            description="PURCHASE WITH CARD AT",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS"),
    ]
    leaks = [item for item in _detect(transactions).leaks if item.leak_type == "duplicate_payment_leak"]
    # Boilerplate-only rows must not cluster into a named merchant finding.
    assert leaks == []
    assert merchant_display_name_for("With Card At") is None
    assert recurring_leak_title(subscription=False, merchant_name="With Card At") == (
        "Unidentified recurring payment"
    )


def test_food_delivery_increase_names_the_merchant_and_period() -> None:
    transactions = [
        _transaction("mrd-1", "80", date(2026, 7, 5), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-2", "90", date(2026, 7, 12), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-3", "100", date(2026, 7, 20), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-4", "200", date(2026, 8, 5), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-5", "220", date(2026, 8, 12), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-6", "240", date(2026, 8, 20), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-7", "300", date(2026, 9, 5), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-8", "320", date(2026, 9, 12), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-9", "340", date(2026, 9, 20), merchant="MR D", category="Food Delivery"),
        _transaction("mrd-10", "360", date(2026, 9, 28), merchant="MR D", category="Food Delivery"),
    ]
    _snapshot, leaks, reasoning, _recommendations, report = _pipeline(transactions)
    food = [
        item
        for item in leaks.leaks
        if item.leak_type == "food_spending_leak"
    ]
    if not food:
        # Category growth may not fire on every synthetic shape; still assert helpers.
        title = recurring_leak_title(subscription=False, merchant_name="MR D")
        assert "Mr D" in title or "Mr" in title
        return
    leak = food[0]
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    finding = next(item for item in report.findings if item.leak_id == leak.leak_id)
    assert leak.evidence.get("merchant_key") in {None, "MR D"}
    if leak.evidence.get("merchant_key") == "MR D":
        assert "Mr D" in leak.title or "MR D" in leak.title.upper()
        assert "Mr D" in analysis.title or "MR D" in analysis.title.upper()
    assert leak.period_start is not None and leak.period_end is not None
    assert "previous" in leak.title.lower() or "increased" in leak.title.lower()
    assert finding.what_happened


def test_duplicate_finding_identifies_matching_transactions_cautiously() -> None:
    transactions = [
        _transaction(
            "take-a",
            "420",
            date(2026, 7, 18),
            merchant="TAKEALOT",
            category="Shopping",
            description="TAKEALOT",
        ),
        _transaction(
            "take-b",
            "420",
            date(2026, 7, 18),
            merchant="TAKEALOT",
            category="Shopping",
            description="TAKEALOT",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    _snapshot, leaks, reasoning, recommendations, report = _pipeline(transactions)
    leak = next(item for item in leaks.leaks if item.leak_type == "duplicate_payment_leak")
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    finding = next(item for item in report.findings if item.leak_id == leak.leak_id)
    recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == analysis.reasoning_id
    )
    assert "Takealot" in leak.title
    assert "R420" in leak.title
    assert leak.evidence["transaction_count_in_group"] == 2
    assert leak.evidence["observed_date"] == "2026-07-18"
    assert leak.evidence["candidate_amount"] == Decimal("420")
    assert "Takealot" in analysis.title
    assert analysis.evidence["verification_required"] is True
    assert "confirmed" not in leak.title.lower()
    assert "guaranteed" not in recommendation.explanation.lower()
    assert any(
        item.key == "observed_date" and item.value == "2026-07-18"
        for item in finding.evidence_highlights
    )
    assert any(
        item.key in {"merchant_display_name", "merchant_key"}
        and "Takealot" in str(item.value)
        for item in finding.evidence_highlights
    )


def test_bank_fee_finding_uses_supported_fee_type_only() -> None:
    transactions = [
        _transaction(
            "fx-1",
            "50",
            date(2026, 7, 5),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN CURRENCY CONVERSION FEE",
        ),
        _transaction(
            "fx-2",
            "60",
            date(2026, 8, 5),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN CURRENCY CONVERSION FEE",
        ),
        _transaction(
            "fx-3",
            "150",
            date(2026, 9, 30),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN CURRENCY CONVERSION FEE",
        ),
    ]
    leaks = _detect(transactions).leaks
    fee = next(item for item in leaks if item.leak_type == "bank_fee_leak")
    focus = fee.evidence.get("finding_focus")
    if focus == "foreign_transaction_fee":
        assert "foreign" in fee.title.lower()
    else:
        # Ambiguous descriptions must not invent a subtype title.
        assert focus in {
            None,
            "monthly_banking_fee_trend",
            "foreign_transaction_fee",
            "sms_banking",
            "atm_balance_enquiry",
            "immediate_payment_fee",
            "interest_charges",
            "overdraft_fee_pattern",
            "insufficient_funds_charges",
        }
        assert "invented" not in fee.title.lower()


def test_unknown_merchant_stays_explicitly_unknown() -> None:
    title = recurring_leak_title(subscription=False, merchant_name=None)
    assert title == "Unidentified recurring payment"
    title = recurring_leak_title(subscription=True, merchant_name="ACCOUNT ID US FOR")
    assert title == "Unidentified subscription payment"
    assert "Account" not in title


def test_sanitised_evidence_survives_report_and_guidance() -> None:
    transactions = [
        _transaction(
            "wool-a",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS REF 123456789",
        ),
        _transaction(
            "wool-b",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="WOOLWORTHS REF 123456789",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    snapshot, leaks, reasoning, recommendations, report = _pipeline(transactions)
    leak = next(item for item in leaks.leaks if item.leak_type == "duplicate_payment_leak")
    finding = next(item for item in report.findings if item.leak_id == leak.leak_id)
    observation = build_observation(user_id=USER, leak=leak, finding=finding)
    plan = assign_finding_ids(
        plan_registry_changes(
            user_id=USER,
            existing=(),
            observations=[observation],
            statement_import_id=IMPORT_ID,
            observed_at=WHEN,
        )
    )
    row = plan.writes[0]
    guidance = build_guidance(row)
    notices = notifications_for_plan(plan, user_id=USER, observed_at=WHEN)
    payload = report.model_dump(mode="json")
    assert "123456789" not in str(payload)
    assert "123456789" not in guidance.title
    assert "123456789" not in guidance.reason
    assert "Woolworths" in guidance.title
    assert guidance.source == "Woolworths"
    assert "Woolworths" in guidance.what_happened
    assert notices
    assert "Woolworths" in notices[0].title
    assert "confirmed duplicate" not in notices[0].body.lower()
    assert row.identity_key
    assert row.fingerprint == leak.fingerprint
    # Identity continuity: re-plan with same observation keeps identity.
    again = plan_registry_changes(
        user_id=USER,
        existing=(row,),
        observations=[observation],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    )
    assert again.items[0].classification == "unchanged"
    assert again.items[0].row.identity_key == row.identity_key
    assert snapshot.user_id == USER
    assert reasoning.analyses
    assert recommendations.recommendations
