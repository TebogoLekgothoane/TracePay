"""The new finding types survive the whole pipeline, persistence and the API."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_diff import observations_from_run, plan_registry_changes
from leak_intelligence.intelligence_report import assemble_financial_intelligence_report
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from tests.benchmark.customers import build_customers
from tests.benchmark.runner import run_pipeline

NOW = datetime(2026, 10, 10, tzinfo=timezone.utc)
CUSTOMERS = [item for item in build_customers() if item.expected]


def _full_run(customer):
    snapshot = build_financial_features("user-a", customer.transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)
    report = assemble_financial_intelligence_report(
        snapshot, behaviours, leaks, reasoning, recommendations, generated_at=NOW
    )
    return leaks, report


@pytest.mark.parametrize("customer", CUSTOMERS, ids=lambda item: item.name)
def test_every_finding_flows_through_reasoning_report_and_registry(customer) -> None:
    leaks, report = _full_run(customer)
    assert {item.leak_id for item in report.findings} == {item.leak_id for item in leaks.leaks}
    observations = observations_from_run("user-a", report, leaks)
    assert len({item.identity_key for item in observations}) == len(observations)


@pytest.mark.parametrize("customer", CUSTOMERS, ids=lambda item: item.name)
def test_reprocessing_creates_no_new_or_changed_findings(customer) -> None:
    leaks, report = _full_run(customer)
    observations = observations_from_run("user-a", report, leaks)
    first = plan_registry_changes(
        user_id="user-a",
        existing=[],
        observations=observations,
        statement_import_id="import-1",
        observed_at=NOW,
    )
    stored = [item.row for item in first.items]
    assert {item.classification for item in first.items} <= {"new"}

    again_leaks, again_report = _full_run(customer)
    again = plan_registry_changes(
        user_id="user-a",
        existing=stored,
        observations=observations_from_run("user-a", again_report, again_leaks),
        statement_import_id="import-2",
        observed_at=NOW,
    )
    assert {item.classification for item in again.items} <= {"unchanged"}
    assert len(again.items) == len(first.items)

    replay = plan_registry_changes(
        user_id="user-a",
        existing=stored,
        observations=observations,
        statement_import_id="import-1",
        observed_at=NOW,
    )
    assert not any(item.write for item in replay.items)


def test_two_unidentified_payees_keep_separate_registry_identities() -> None:
    from datetime import date

    from tests.benchmark.customers import Customer
    from tests.test_leak_detection import _transaction

    rows = [
        _transaction(f"{name}{i}", amount, date(2026, 5 + i, 12), merchant=None, category="Other",
                     confidence=0.4, description=f"{name} HOLDINGS {i}")
        for name, amount in (("ZXQ", "89"), ("KLM", "140"))
        for i in range(5)
    ]
    leaks, report = _full_run(Customer("two-payees", "two payees", rows))
    observations = observations_from_run("user-a", report, leaks)
    assert len(observations) == 2
    assert len({item.identity_key for item in observations}) == 2


def test_trial_finding_and_subscription_review_have_separate_identities() -> None:
    customer = next(item for item in build_customers() if item.name.startswith("04-"))
    leaks, report = _full_run(customer)
    focuses = {item.evidence.get("finding_focus") for item in leaks.leaks}
    assert {"trial_conversion", "subscription_review"} <= focuses
    assert len({item.identity_key for item in observations_from_run("user-a", report, leaks)}) == len(
        leaks.leaks
    )


def test_api_keeps_an_explained_increase_out_of_the_customer_list_but_in_the_response(monkeypatch) -> None:
    from tests.test_escalation_overlap import GYM_WITH_JULY_DUPLICATE

    result = run_pipeline(GYM_WITH_JULY_DUPLICATE)

    async def fake_leaks(user_id: str, token: str):
        return result

    monkeypatch.setattr("app.main.build_user_leak_detections", fake_leaks)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        body = TestClient(app).get(
            "/leak-detections", headers={"Authorization": "Bearer test-token"}
        ).json()
    finally:
        app.dependency_overrides.clear()
    assert [leak["leak_type"] for leak in body["leaks"]] == ["duplicate_debit_order_leak"]
    [hidden] = body["explained_leaks"]
    assert hidden["leak_type"] == "spending_escalation_leak"
    assert hidden["evidence"]["explained_by_leak_ids"] == [body["leaks"][0]["leak_id"]]
    assert hidden["evidence"]["redundant_for_display"] is True
    assert float(body["impact_summary"]["one_time_potential"]) == 450.0
    shown = {item["leak_id"]: item["display"] for item in body["impact_summary"]["findings"]}
    assert shown[hidden["leak_id"]] is False


def test_api_response_exposes_status_overlap_summary_and_source_rows(monkeypatch) -> None:
    trial = next(item for item in build_customers() if item.name.startswith("04-"))
    result = run_pipeline(trial.transactions)

    async def fake_leaks(user_id: str, token: str):
        return result

    monkeypatch.setattr("app.main.build_user_leak_detections", fake_leaks)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/leak-detections", headers={"Authorization": "Bearer test-token"}
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    summary = body["impact_summary"]
    assert float(summary["recurring_monthly_potential"]) == 99.0
    assert float(summary["recurring_monthly_before_dedupe"]) == 198.0
    assert summary["overlaps"]
    assert {item["bucket"] for item in summary["findings"]} == {"recurring_monthly"}
    for leak in body["leaks"]:
        assert leak["evidence"]["evidence_status"] in {"confirmed", "likely", "possible"}
        assert leak["evidence"]["evidence_status_reason"]
        assert leak["supporting_transaction_count"] > 0
        assert all(row["transaction_id"] for row in leak["supporting_transactions"])
    # Statement descriptions with references never leave the API as transaction_ids lists.
    assert "transaction_ids" not in response.text
