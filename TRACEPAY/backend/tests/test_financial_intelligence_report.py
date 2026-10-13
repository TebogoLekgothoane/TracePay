"""Contract tests for the read-only financial intelligence report."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.config import settings
from app.main import app
from app.rate_limit import allow_request
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.intelligence_report import (
    EvidenceHighlight,
    ReportCompositionError,
    assemble_financial_intelligence_report,
)
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_models import LeakDetection, LeakDetectionResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.reasoning_models import (
    FinancialReasoning,
    FinancialReasoningResult,
    ImpactAssessment,
)
from leak_intelligence.recommendation_engine import recommend_actions
from leak_intelligence.recommendation_models import (
    FinancialRecommendationResult,
    Recommendation,
    RecommendationMetadata,
)

AUTH = {"Authorization": "Bearer test-token"}
GENERATED_AT = datetime(2026, 10, 10, 17, 0, tzinfo=timezone.utc)
BANNED_KEYS = {
    "user_id",
    "status",
    "expected_savings_amount",
    "evidence_references",
    "supporting_feature_references",
    "supporting_features",
    "transaction_ids",
    "group_total",
    "priority_score",
    "one_time_unverified",
    "total",
    "total_savings",
}


def _transaction(
    transaction_id: str,
    amount: str,
    when: date | None,
    *,
    merchant: str | None = "SHOP",
    category: str | None = "Groceries",
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
        description=description or merchant or "SHOP",
        transaction_type="debit",
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=confidence,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=confidence,
            merchant_name=merchant,
        ),
    )


def _run(transactions: list[FeatureTransaction], user_id: str = "user-a"):
    snapshot = build_financial_features(user_id, transactions)
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
        generated_at=GENERATED_AT,
    )
    return snapshot, leaks, report


def _impact(**overrides) -> ImpactAssessment:
    values = {
        "detected_amount": Decimal("40"),
        "detected_annual_amount": Decimal("480"),
        "impact_kind": "estimated",
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
        "impact_assessment": _impact(impact_kind="recurring"),
        "avoidability": "unknown",
        "persistence": "persistent",
        "analysis_status": "supported",
    }
    values.update(overrides)
    return FinancialReasoning(**values)


def _leak(**overrides) -> LeakDetection:
    values = {
        "leak_id": "b" * 32,
        "fingerprint": "b" * 32,
        "leak_type": "bank_fee_leak",
        "title": "Potential recurring banking fee burden",
        "description": "Repeated banking fees may represent a material ongoing cost pattern.",
        "severity": "low",
        "confidence": 0.7,
        "estimated_monthly_impact": Decimal("40"),
        "estimated_annual_impact": Decimal("480"),
        "impact_kind": "recurring",
        "evidence": {},
        "detector_version": "1.0",
        "detected_at": GENERATED_AT,
    }
    values.update(overrides)
    return LeakDetection(**values)


def _recommendation(**overrides) -> Recommendation:
    values = {
        "recommendation_id": "c" * 32,
        "recommendation_type": "review_bank_fees",
        "title": "Review banking fees",
        "explanation": "Banking fee activity accumulated in the observed period.",
        "recommended_action": "Review the fee transactions.",
        "priority": "high",
        "recommendation_confidence": 0.7,
        "source_reasoning_id": "a" * 32,
        "source_root_cause_type": "fee_accumulation",
        "finding_scope": "standalone",
        "impact_label": "observed_fee_activity",
        "supported_impact_amount": Decimal("40"),
        "currency": "ZAR",
    }
    values.update(overrides)
    return Recommendation(**values)


def _joined(transactions: list[FeatureTransaction], leaks: list[LeakDetection], analyses, recommendations):
    snapshot = build_financial_features("user-a", transactions)
    behaviours = analyze_behaviour(snapshot)
    leak_result = LeakDetectionResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        detector_version="1.0",
        leaks=leaks,
    )
    reasoning = FinancialReasoningResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        reasoning_version="1.1-test",
        potential_leaks_analyzed=len(analyses),
        analyses=analyses,
    )
    if not isinstance(recommendations, FinancialRecommendationResult):
        recommendations = FinancialRecommendationResult(
            user_id=snapshot.user_id,
            period_start=snapshot.date_start,
            period_end=snapshot.date_end,
            reasoning_version=reasoning.reasoning_version,
            recommendation_version="1.2-test",
            recommendation_count=len(recommendations),
            recommendations=list(recommendations),
            metadata=RecommendationMetadata(),
        )
    return assemble_financial_intelligence_report(
        snapshot,
        behaviours,
        leak_result,
        reasoning,
        recommendations,
        generated_at=GENERATED_AT,
    )


def _history_transactions() -> list[FeatureTransaction]:
    return [
        _transaction("a", "5", date(2026, 7, 1), merchant="ALPHA"),
        _transaction("b", "5", date(2026, 7, 15), merchant="BETA"),
        _transaction("c", "5", date(2026, 7, 29), merchant="GAMMA"),
    ]


def _inventory_ids(report, name: str) -> list[str]:
    return [line.leak_id for line in getattr(report.financial_summary.inventories, name)]


def _all_inventory_ids(report) -> list[str]:
    inventories = report.financial_summary.inventories
    return [
        line.leak_id
        for name in (
            "observed_recurring",
            "observed_fee_activity",
            "observed_increase",
            "recovery_candidates",
        )
        for line in getattr(inventories, name)
    ]


def _walk_keys(value, found: set[str]) -> None:
    if isinstance(value, dict):
        found.update(value)
        for item in value.values():
            _walk_keys(item, found)
    elif isinstance(value, list):
        for item in value:
            _walk_keys(item, found)


def test_report_endpoint_requires_authentication() -> None:
    assert TestClient(app).get("/financial-intelligence-report").status_code == 401


def test_report_uses_authenticated_user_and_one_snapshot(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    async def fake_snapshot(user_id: str, token: str):
        calls.append((user_id, token))
        return build_financial_features(
            user_id,
            [
                _transaction("dated", "12", date(2026, 7, 1), user_id=user_id),
                _transaction("undated", "8", None, user_id=user_id),
            ],
        )

    monkeypatch.setattr(
        "app.financial_intelligence_report.build_user_feature_snapshot",
        fake_snapshot,
    )
    def _forbid(label: str):
        def _blocked(*_args, **_kwargs):
            raise AssertionError(label)

        return _blocked

    for name in (
        "app.leak_detection.build_user_leak_detections",
        "app.financial_reasoning.build_user_financial_reasoning",
        "app.financial_recommendations.build_user_financial_recommendations",
    ):
        monkeypatch.setattr(name, _forbid(name))

    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/financial-intelligence-report?user_id=attacker",
            headers=AUTH,
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert calls == [("user-a", "test-token")]
    assert "user_id" not in body
    assert body["analysis"]["transaction_count"] == 2
    assert body["analysis"]["earliest_transaction_date"] == "2026-07-01"
    assert body["analysis"]["latest_transaction_date"] == "2026-07-01"
    assert body["analysis"]["findings_availability"] == "insufficient_history"
    assert body["analysis"]["history_sufficient_for_leak_detection"] is False
    assert body["currency"] == "ZAR"
    assert body["consistency"] == {
        "assembled_in_single_request": True,
        "persisted_snapshot": False,
    }


def test_report_rate_limit_key_is_independent(monkeypatch) -> None:
    async def fake_snapshot(user_id: str, token: str):
        return build_financial_features(user_id, [])

    monkeypatch.setattr(
        "app.financial_intelligence_report.build_user_feature_snapshot",
        fake_snapshot,
    )
    user_id = "report-rate-user"
    for _ in range(20):
        assert allow_request(f"report-user:{user_id}", 20, 15 * 60) is True
    app.dependency_overrides[require_supabase_user] = lambda: user_id
    try:
        response = TestClient(app).get("/financial-intelligence-report", headers=AUTH)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429
    assert "findings" not in response.json()
    assert allow_request(f"leaks-user:{user_id}", 20, 15 * 60) is True
    assert allow_request(f"features-user:{user_id}", 20, 15 * 60) is True
    assert allow_request(f"reasoning-user:{user_id}", 20, 15 * 60) is True
    assert allow_request(f"recommendations-user:{user_id}", 20, 15 * 60) is True
    assert allow_request(f"behaviour-user:{user_id}", 20, 15 * 60) is True


def test_upstream_snapshot_error_returns_no_report(monkeypatch) -> None:
    async def fail(_user_id: str, _token: str):
        raise HTTPException(
            status_code=503,
            detail="Financial data is temporarily unavailable. Please try again.",
        )

    monkeypatch.setattr("app.financial_intelligence_report.build_user_feature_snapshot", fail)
    app.dependency_overrides[require_supabase_user] = lambda: "upstream-user"
    try:
        response = TestClient(app).get("/financial-intelligence-report", headers=AUTH)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "findings" not in response.json()


def test_missing_reasoning_fails_without_a_partial_report(monkeypatch) -> None:
    async def fake_snapshot(user_id: str, _token: str):
        return build_financial_features(
            user_id,
            [
                _transaction(
                    f"fee-{month}",
                    "40",
                    date(2026, month, 28 if month < 9 else 30),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="ACCOUNT FEE",
                    user_id=user_id,
                )
                for month in (7, 8, 9)
            ],
        )

    def one_leak(snapshot, _behaviours):
        return LeakDetectionResult(
            user_id=snapshot.user_id,
            transaction_count=snapshot.transaction_count,
            period_start=snapshot.date_start,
            period_end=snapshot.date_end,
            detector_version="1.0",
            leaks=[_leak()],
        )

    def empty_reasoning(snapshot, _behaviours, _leaks):
        return FinancialReasoningResult(
            user_id=snapshot.user_id,
            transaction_count=snapshot.transaction_count,
            period_start=snapshot.date_start,
            period_end=snapshot.date_end,
            reasoning_version="1.0",
            potential_leaks_analyzed=0,
            analyses=[],
        )

    monkeypatch.setattr(
        "app.financial_intelligence_report.build_user_feature_snapshot",
        fake_snapshot,
    )
    monkeypatch.setattr("app.financial_intelligence_report.detect_leaks", one_leak)
    monkeypatch.setattr(
        "app.financial_intelligence_report.analyze_financial_reasoning",
        empty_reasoning,
    )
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get("/financial-intelligence-report", headers=AUTH)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert response.json()["detail"] == "Financial intelligence report could not be assembled."
    assert "findings" not in response.json()


def test_mismatched_snapshot_user_is_rejected(monkeypatch) -> None:
    async def other_user(_user_id: str, _token: str):
        return build_financial_features(
            "other-user",
            [
                _transaction("a", "5", date(2026, 7, 1), merchant="ALPHA", user_id="other-user"),
                _transaction("b", "5", date(2026, 7, 15), merchant="BETA", user_id="other-user"),
                _transaction("c", "5", date(2026, 7, 29), merchant="GAMMA", user_id="other-user"),
            ],
        )

    monkeypatch.setattr(
        "app.financial_intelligence_report.build_user_feature_snapshot",
        other_user,
    )
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get("/financial-intelligence-report", headers=AUTH)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert "findings" not in response.json()


def test_availability_states_follow_the_existing_history_gate() -> None:
    empty = _run([])
    assert empty[2].analysis.findings_availability == "no_transactions"
    assert empty[2].analysis.earliest_transaction_date is None
    assert empty[2].analysis.latest_transaction_date is None
    assert empty[2].findings == []

    short_count = _run(
        [
            _transaction("one", "20", date(2026, 7, 1)),
            _transaction("two", "20", date(2026, 8, 15)),
        ]
    )
    assert short_count[2].analysis.findings_availability == "insufficient_history"
    assert short_count[2].analysis.history_sufficient_for_leak_detection is False

    short_span = _run(
        [
            _transaction("one", "20", date(2026, 7, 1)),
            _transaction("two", "20", date(2026, 7, 5)),
            _transaction("three", "20", date(2026, 7, 10)),
        ]
    )
    assert short_span[2].analysis.findings_availability == "insufficient_history"

    undated = _run(
        [
            _transaction("one", "20", None),
            _transaction("two", "20", None),
            _transaction("three", "20", None),
        ]
    )
    assert undated[2].analysis.transaction_count == 3
    assert undated[2].analysis.findings_availability == "insufficient_history"
    assert undated[2].analysis.earliest_transaction_date is None

    quiet = _run(_history_transactions())
    assert quiet[0].date_start == date(2026, 7, 1)
    assert quiet[0].date_end == date(2026, 7, 29)
    assert (quiet[0].date_end - quiet[0].date_start).days == 28
    assert quiet[2].analysis.findings_availability == "no_qualifying_findings"
    assert quiet[2].analysis.history_sufficient_for_leak_detection is True
    assert quiet[2].findings == []


def test_each_leak_requires_one_reasoning_record() -> None:
    try:
        _joined(_history_transactions(), [_leak()], [], [])
    except ReportCompositionError:
        return
    raise AssertionError("Missing reasoning returned a report.")


def test_deduplicated_recommendation_stays_on_its_source_finding() -> None:
    weaker = _analysis(reasoning_id="a" * 32, leak_id="b" * 32, confidence=0.62)
    stronger = _analysis(reasoning_id="d" * 32, leak_id="e" * 32, confidence=0.9)
    recommendations = recommend_actions(
        FinancialReasoningResult(
            user_id="user-a",
            transaction_count=3,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 29),
            reasoning_version="1.0",
            potential_leaks_analyzed=2,
            analyses=[weaker, stronger],
        )
    )
    assert recommendations.recommendation_count == 1
    report = _joined(
        _history_transactions(),
        [_leak(), _leak(leak_id="e" * 32, fingerprint="e" * 32)],
        [weaker, stronger],
        recommendations,
    )
    by_leak = {finding.leak_id: finding for finding in report.findings}
    assert by_leak["b" * 32].recommendation is None
    assert by_leak["b" * 32].recommendation_id is None
    assert by_leak["e" * 32].recommendation is not None
    assert by_leak["e" * 32].recommendation.source_reasoning_id == "d" * 32
    assert by_leak["b" * 32].leak_id not in _all_inventory_ids(report)
    assert _inventory_ids(report, "observed_fee_activity") == ["e" * 32]


def test_display_order_uses_recommendation_priority_then_leak_severity() -> None:
    high = _analysis(reasoning_id="a" * 32, leak_id="b" * 32)
    low = _analysis(
        reasoning_id="d" * 32,
        leak_id="e" * 32,
        root_cause_type="amount_increase",
        evidence={"category": "Fast Food"},
        avoidability="medium",
    )
    plain = _analysis(
        reasoning_id="f" * 32,
        leak_id="1" * 32,
        root_cause_type="transaction_pattern",
        analysis_status="supported",
    )
    later = _analysis(
        reasoning_id="9" * 32,
        leak_id="2" * 32,
        root_cause_type="transaction_pattern",
    )
    report = _joined(
        _history_transactions(),
        [
            _leak(leak_id="2" * 32, fingerprint="2" * 32, severity="high", confidence=0.9),
            _leak(leak_id="1" * 32, fingerprint="1" * 32, severity="low", confidence=0.9),
            _leak(leak_id="e" * 32, fingerprint="e" * 32, severity="high", confidence=0.95),
            _leak(leak_id="b" * 32, fingerprint="b" * 32, severity="low", confidence=0.55),
        ],
        [later, plain, low, high],
        [
            _recommendation(
                recommendation_id="c" * 32,
                source_reasoning_id="a" * 32,
                priority="high",
                recommendation_type="verify_potential_duplicate",
                source_root_cause_type="potential_duplicate",
                finding_scope="one_time_recovery_candidate",
                impact_label="potential_recovery_candidate",
                potential_recovery_amount=Decimal("50"),
                supported_impact_amount=Decimal("50"),
            ),
            _recommendation(
                recommendation_id="d" * 32,
                source_reasoning_id="d" * 32,
                priority="low",
                recommendation_type="monitor_spending_pattern",
                source_root_cause_type="amount_increase",
                finding_scope="contributing_category",
                impact_label="detected_increase",
                supported_impact_amount=Decimal("80"),
            ),
        ],
    )
    assert [finding.leak_id for finding in report.findings] == [
        "b" * 32,
        "e" * 32,
        "2" * 32,
        "1" * 32,
    ]
    assert [finding.display_index for finding in report.findings] == [0, 1, 2, 3]
    assert not hasattr(report, "priority_score")


def test_bank_fee_inventory_ignores_recurring_impact_kind() -> None:
    _snapshot, _leaks, report = _run(
        [
            _transaction(
                f"fee-{month}",
                "80" if month == 9 else "10",
                date(2026, month, 2 if month < 9 else 30),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ACCOUNT FEE",
            )
            for month in (7, 8, 9)
        ]
    )
    fee = next(finding for finding in report.findings if finding.leak_type == "bank_fee_leak")
    # Period fee change is estimated; inventory placement ignores impact_kind.
    assert fee.impact.impact_kind in {"recurring", "estimated"}
    assert fee.recommendation is not None
    assert fee.recommendation.impact_label == "observed_fee_activity"
    assert _inventory_ids(report, "observed_fee_activity") == [fee.leak_id]
    assert fee.leak_id not in _inventory_ids(report, "observed_recurring")
    line = report.financial_summary.inventories.observed_fee_activity[0]
    assert line.amount == fee.recommendation.supported_impact_amount
    dumped = line.model_dump(mode="json")
    assert "verification_required" not in dumped
    assert "annual" not in dumped


def test_recurring_payment_is_only_in_the_recurring_inventory() -> None:
    _snapshot, _leaks, report = _run(
        [
            _transaction(
                f"netflix-{index}",
                "199",
                when,
                merchant="NETFLIX",
                category="Subscriptions",
            )
            for index, when in enumerate(
                (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
            )
        ]
    )
    recurring = next(
        finding for finding in report.findings if finding.leak_type == "subscription_leak"
    )
    assert recurring.recommendation is not None
    assert recurring.recommendation.impact_label == "observed_recurring_payment"
    assert _inventory_ids(report, "observed_recurring") == [recurring.leak_id]
    assert _all_inventory_ids(report).count(recurring.leak_id) == 1


def test_overlapping_increases_stay_separate_and_are_not_totalled() -> None:
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
    transactions.append(
        _transaction("grocery-9", "900", date(2026, 9, 30), merchant="GROCERY", category="Groceries")
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
    _snapshot, _leaks, report = _run(transactions)
    increase_ids = _inventory_ids(report, "observed_increase")
    scopes = {
        finding.recommendation.finding_scope
        for finding in report.findings
        if finding.leak_id in increase_ids and finding.recommendation is not None
    }
    assert "overall_pattern" in scopes
    assert "contributing_category" in scopes
    assert len(increase_ids) >= 2
    assert report.financial_summary.amounts_are_additive is False
    assert report.financial_summary.overlap_note is not None
    assert "Do not add their amounts together." in report.financial_summary.overlap_note
    payload = report.model_dump(mode="json")
    assert "total" not in payload["financial_summary"]
    assert payload["financial_summary"]["verified_savings"] == {"availability": "unavailable"}
    assert payload["financial_summary"]["expected_savings"] == {"availability": "unavailable"}


def test_duplicate_candidate_keeps_detected_impact_out_of_recovery_inventory() -> None:
    _snapshot, leaks, report = _run(
        [
            _transaction(
                "dup-a",
                "186.40",
                date(2026, 7, 18),
                merchant="WOOLWORTHS",
                category="Groceries",
                description="WOOLWORTHS REF 123456789",
            ),
            _transaction(
                "dup-b",
                "186.40",
                date(2026, 7, 18),
                merchant="WOOLWORTHS",
                category="Groceries",
                description="WOOLWORTHS REF 123456789",
            ),
            _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
        ]
    )
    source = next(leak for leak in leaks.leaks if leak.leak_type == "duplicate_payment_leak")
    finding = next(item for item in report.findings if item.leak_id == source.leak_id)
    assert source.estimated_monthly_impact == Decimal("186.40")
    assert source.estimated_annual_impact is None
    assert finding.avoidability == "unknown"
    assert finding.analysis_status == "verification_required"
    assert finding.impact.detected_amount == Decimal("186.40")
    assert finding.impact.detected_annual_amount is None
    assert finding.impact.recoverable_amount is None
    assert finding.recommendation is not None
    assert finding.recommendation.recommendation_type == "verify_potential_duplicate"
    assert finding.recommendation.priority == "medium"
    assert finding.recommendation.potential_recovery_amount is None
    assert finding.recommendation.supported_impact_amount == Decimal("186.40")
    assert "not recovered money" in finding.recommendation.explanation
    assert report.financial_summary.inventories.recovery_candidates == []
    assert _all_inventory_ids(report).count(source.leak_id) == 0
    payload = report.model_dump(mode="json")
    assert "123456789" not in str(payload)
    assert "group_total" not in str(payload)
    assert "372.80" not in str(payload)
    labels = [item.label for item in finding.evidence_highlights if item.key == "potential_duplicate_amount"]
    assert labels == ["Amount of each matching transaction"]
    assert source.evidence["merchant_display_name"] == "Woolworths"
    merchant_highlights = [
        item for item in finding.evidence_highlights if item.key == "merchant_display_name"
    ]
    assert merchant_highlights == [
        EvidenceHighlight(key="merchant_display_name", label="Merchant", value="Woolworths")
    ]
    assert all(item.key != "merchant_key" for item in finding.evidence_highlights)
    assert "Woolworths" in finding.what_happened
    assert "Woolworths" in finding.why_title
    assert "123456789" not in finding.what_happened


def test_cash_finding_stays_visible_and_out_of_every_inventory() -> None:
    _snapshot, _leaks, report = _run(
        [
            _transaction("cash-1", "200", date(2026, 7, 5), merchant=None, category="Cash Withdrawal"),
            _transaction(
                "fee-1",
                "20",
                date(2026, 7, 5),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ATM WITHDRAWAL FEE",
            ),
            _transaction("cash-2", "300", date(2026, 8, 5), merchant=None, category="Cash Withdrawal"),
            _transaction(
                "fee-2",
                "20",
                date(2026, 8, 5),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ATM WITHDRAWAL FEE",
            ),
            _transaction("cash-3", "400", date(2026, 9, 30), merchant=None, category="Cash Withdrawal"),
            _transaction(
                "fee-3",
                "20",
                date(2026, 9, 30),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ATM WITHDRAWAL FEE",
            ),
        ]
    )
    cash = next(finding for finding in report.findings if finding.leak_type == "cash_usage_leak")
    assert cash.recommendation is None
    assert cash.recommendation_id is None
    assert cash.supporting_behavior_ids
    assert cash.leak_id not in _all_inventory_ids(report)
    assert cash.impact.impact_kind == "recurring"
    behaviour = cash.supporting_behaviours[0]
    assert set(behaviour.model_dump()) == {
        "observation_id",
        "behavior_type",
        "title",
        "description",
        "severity",
        "confidence",
    }


def test_insufficient_evidence_is_excluded_from_inventories() -> None:
    snapshot, leaks, _report = _run(_history_transactions())
    crafted = _leak(
        leak_type="spending_escalation_leak",
        impact_kind="estimated",
        evidence={"finding_kind": "potential_leak"},
        title="Potential spending escalation",
        description="Overall spending increased materially above the previous observed baseline.",
    )
    leak_result = leaks.model_copy(update={"leaks": [crafted]})
    reasoning = analyze_financial_reasoning(
        snapshot,
        analyze_behaviour(snapshot),
        leak_result,
    )
    assert reasoning.analyses[0].analysis_status == "insufficient_evidence"
    assembled = assemble_financial_intelligence_report(
        snapshot,
        analyze_behaviour(snapshot),
        leak_result,
        reasoning,
        recommend_actions(reasoning),
        generated_at=GENERATED_AT,
    )
    assert assembled.findings[0].analysis_status == "insufficient_evidence"
    assert assembled.findings[0].recommendation is None
    assert _all_inventory_ids(assembled) == []

    forced = _joined(
        _history_transactions(),
        [_leak(leak_type="cash_usage_leak", impact_kind="estimated")],
        [
            _analysis(
                root_cause_type="transaction_pattern",
                analysis_status="insufficient_evidence",
                evidence={"cash_withdrawal_count": 4, "group_total": Decimal("9999.99")},
            )
        ],
        [_recommendation(impact_label="detected_increase", supported_impact_amount=Decimal("40"))],
    )
    assert forced.findings[0].leak_type == "cash_usage_leak"
    assert _all_inventory_ids(forced) == []


def test_report_serialization_versions_and_sanitised_evidence() -> None:
    report = _joined(
        _history_transactions(),
        [
            _leak(
                evidence={
                    "group_total": Decimal("9999.99"),
                    "sms_fee_total": Decimal("4321.99"),
                    "transaction_ids": ["txn-secret"],
                    "fees.bank_fee_total": Decimal("10"),
                    "merchant_key": "ACCOUNT 123456789",
                    "fee_transaction_count": 3,
                },
                supporting_feature_references=["fees.bank_fee_total"],
            )
        ],
        [
            _analysis(
                evidence={
                    "transaction_id": "txn-secret",
                    "completed_month_fee_totals": {"2026-07": "10"},
                    "fee_transaction_count": 3,
                },
                supporting_feature_references=["merchants[ACCOUNT 123456789].recurrence"],
                supporting_behavior_ids=["fee_accumulation:0123abcd0123abcd"],
            )
        ],
        [_recommendation()],
    )
    payload = report.model_dump(mode="json")
    text = str(payload)
    assert payload["report_contract_version"] == "1.0"
    assert payload["generated_at"] == "2026-10-10T17:00:00Z"
    assert payload["versions"] == {
        "detector_version": "1.0",
        "reasoning_version": "1.1-test",
        "recommendation_version": "1.2-test",
    }
    assert payload["findings"][0]["impact"]["detected_amount"] == "40"
    assert "expected_savings_amount" not in payload["findings"][0]["recommendation"]
    assert "expected_savings_amount" not in text
    assert "evidence_references" not in text
    assert "txn-secret" not in text
    assert "123456789" not in text
    assert "4321.99" not in text
    assert "9999.99" not in text
    assert "fees.bank_fee_total" not in text
    assert "group_total" not in text
    keys: set[str] = set()
    _walk_keys(payload, keys)
    assert keys.isdisjoint(BANNED_KEYS)
    highlight_keys = [item["key"] for item in payload["findings"][0]["evidence_highlights"]]
    assert highlight_keys == ["fee_transaction_count"]
    assert payload["context"]["behaviour_observation_count"] >= 0
    assert "user_id" not in payload


def test_synthetic_debug_routes_remain_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "tracepay_env", "production")
    monkeypatch.setattr(settings, "synthetic_intelligence_debug", False)
    client = TestClient(app)
    assert client.get("/debug/intelligence-scenarios", headers=AUTH).status_code == 404
    assert (
        client.get(
            "/debug/intelligence-scenarios/FI-029-fast-food-escalation/analysis",
            headers=AUTH,
        ).status_code
        == 404
    )

