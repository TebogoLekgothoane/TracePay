"""Finding registry diff, import gate, and report-contract guards."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.financial_intelligence_report import FinancialIntelligenceRun
from app.finding_registry import (
    StatementImportRecord,
    load_statement_import,
    reconcile_findings_after_import,
    registry_row_payload,
)
from app.finding_registry import _filter_url
from app.main import app
from leak_intelligence.engine import build_financial_features
from leak_intelligence.finding_diff import (
    RegistryRow,
    RegistryScopeError,
    build_observation,
    finding_identity_key,
    material_signature,
    plan_registry_changes,
    sanitise_highlights,
)
from leak_intelligence.intelligence_report import (
    EvidenceHighlight,
    FinancialIntelligenceReport,
    ReportAnalysis,
    ReportConsistency,
    ReportContext,
    ReportFinancialSummary,
    ReportFinding,
    ReportImpact,
    ReportInventories,
    ReportUncertainty,
    ReportVersions,
)
from leak_intelligence.leak_keys import leak_fingerprint
from leak_intelligence.leak_models import LeakDetection, LeakDetectionResult
from leak_intelligence.reasoning_models import ImpactAssessment
from leak_intelligence.recommendation_models import Recommendation
from tests.test_financial_intelligence_report import AUTH, _transaction

USER = "11111111-1111-4111-8111-111111111111"
OTHER = "33333333-3333-4333-8333-333333333333"
IMPORT_ID = "22222222-2222-4222-8222-222222222222"
ACCOUNT_ID = "44444444-4444-4444-8444-444444444444"
WHEN = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)
LATER = datetime(2026, 10, 10, 19, 0, tzinfo=timezone.utc)
MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202610100001_finding_registry.sql"
)


def _leak(**overrides: object) -> LeakDetection:
    fingerprint = leak_fingerprint(
        user_id=USER,
        leak_type="bank_fee_leak",
        subject_key="bank-fees",
        detector_version="1.0",
    )
    values: dict[str, object] = {
        "leak_id": fingerprint,
        "fingerprint": fingerprint,
        "leak_type": "bank_fee_leak",
        "title": "Potential SMS banking charge burden",
        "description": "Repeated SMS banking fees were observed.",
        "severity": "medium",
        "confidence": 0.80,
        "estimated_monthly_impact": Decimal("80.00"),
        "estimated_annual_impact": Decimal("960.00"),
        "impact_kind": "recurring",
        "evidence": {
            "finding_focus": "sms_banking",
            "sms_fee_total": Decimal("80.00"),
            "completed_month_count": 3,
            "behaviour_confidence": Decimal("0.80"),
        },
        "detector_version": "1.0",
        "detected_at": WHEN,
        "period_start": date(2026, 7, 1),
        "period_end": date(2026, 9, 30),
    }
    values.update(overrides)
    fingerprint = str(values["fingerprint"])
    values["leak_id"] = fingerprint
    return LeakDetection(**values)  # type: ignore[arg-type]


def _finding(leak: LeakDetection, **overrides: object) -> ReportFinding:
    values: dict[str, object] = {
        "leak_id": leak.leak_id,
        "reasoning_id": "b" * 32,
        "recommendation_id": "c" * 32,
        "display_index": 0,
        "what_happened": "Potential SMS banking charge burden. Repeated SMS fees were observed.",
        "why_title": "Fee accumulation",
        "why_flagged": "Banking fee activity accumulated in the observed period.",
        "what_next": "Review the fee transactions.",
        "leak_type": leak.leak_type,
        "root_cause_type": "fee_accumulation",
        "analysis_status": "supported",
        "persistence": "persistent",
        "avoidability": "medium",
        "uncertainty": ReportUncertainty(
            leak_confidence=leak.confidence,
            reasoning_confidence=0.70,
            recommendation_confidence=0.64,
        ),
        "impact": ReportImpact(
            detected_amount=leak.estimated_monthly_impact,
            detected_annual_amount=leak.estimated_annual_impact,
            impact_kind=leak.impact_kind,
            impact_label="observed_fee_activity",
        ),
        "evidence_highlights": [
            EvidenceHighlight(key="fee_transaction_count", label="Fee transactions", value=4),
        ],
    }
    values.update(overrides)
    return ReportFinding(**values)  # type: ignore[arg-type]


def _processed(import_id: str = IMPORT_ID, **overrides: object) -> StatementImportRecord:
    values: dict[str, object] = {
        "id": import_id,
        "user_id": USER,
        "account_id": ACCOUNT_ID,
        "status": "processed",
        "transaction_count": 12,
        "processed_at": WHEN,
    }
    values.update(overrides)
    return StatementImportRecord(**values)  # type: ignore[arg-type]


class _Memory:
    def __init__(self) -> None:
        self.rows: list[RegistryRow] = []
        self.saves = 0
        self.notifications: dict[tuple[str, str], object] = {}
        self.notification_saves = 0

    def load(self, user_id: str, _token: str) -> list[RegistryRow]:
        return [row for row in self.rows if row.user_id == user_id]

    def save(self, user_id: str, _token: str, rows: list[RegistryRow]) -> None:
        self.saves += 1
        stored = {row.identity_key: row for row in self.rows if row.user_id == user_id}
        for row in rows:
            if row.user_id != user_id:
                raise RegistryScopeError("wrong user")
            stored[row.identity_key] = row
        self.rows = list(stored.values())

    def save_notifications(self, user_id: str, _token: str, notes: list[object]) -> None:
        self.notification_saves += 1
        for note in notes:
            if getattr(note, "user_id") != user_id:
                raise RegistryScopeError("wrong user")
            key = (note.user_id, note.dedupe_key)  # type: ignore[attr-defined]
            self.notifications.setdefault(key, note)


def _imports(*records: StatementImportRecord):
    by_id = {record.id: record for record in records}

    def load(user_id: str, _token: str, import_id: str) -> StatementImportRecord | None:
        record = by_id.get(import_id)
        if record is None or record.user_id != user_id:
            return None
        return record

    return load


def _intelligence(leak: LeakDetection, finding: ReportFinding | None, user_id: str):
    findings = [] if finding is None else [finding]
    leaks = [] if leak is None else [leak]
    report = FinancialIntelligenceReport(
        generated_at=WHEN,
        analysis=ReportAnalysis(
            earliest_transaction_date=date(2026, 7, 1),
            latest_transaction_date=date(2026, 9, 30),
            transaction_count=12,
            history_sufficient_for_leak_detection=True,
            findings_availability="available" if findings else "no_qualifying_findings",
        ),
        versions=ReportVersions(
            detector_version="1.0" if leak is None else leak.detector_version,
            reasoning_version="1.0",
            recommendation_version="1.0",
        ),
        consistency=ReportConsistency(),
        findings=findings,
        financial_summary=ReportFinancialSummary(inventories=ReportInventories()),
        context=ReportContext(
            behaviour_observation_count=0,
            unattached_observation_count=0,
        ),
    )
    return FinancialIntelligenceRun(
        report=report,
        leaks=LeakDetectionResult(
            user_id=user_id,
            transaction_count=12,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 9, 30),
            detector_version=report.versions.detector_version,
            leaks=leaks,
        ),
    )


def _reconcile(memory: _Memory, intelligence, record: StatementImportRecord, when: datetime):
    async def run(user_id: str, _token: str) -> FinancialIntelligenceRun:
        return intelligence(user_id)

    return asyncio.run(
        reconcile_findings_after_import(
            USER,
            "token",
            record.id,
            load_import=_imports(record),
            load_rows=memory.load,
            save_rows=memory.save,
            save_notifications=memory.save_notifications,
            run_intelligence=run,
            observed_at=when,
        )
    )


def test_unseen_finding_is_registered_as_new() -> None:
    leak = _leak()
    finding = _finding(leak)
    observation = build_observation(user_id=USER, leak=leak, finding=finding)
    plan = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[observation],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    )
    assert len(plan.items) == 1
    assert plan.items[0].classification == "new"
    assert plan.items[0].write is True
    row = plan.items[0].row
    assert row.status == "open"
    assert row.signature_generation == 1
    assert row.fingerprint == leak.fingerprint
    assert row.last_statement_import_id == IMPORT_ID
    assert row.last_seen_at == WHEN
    assert row.last_absent_at is None


def test_identical_run_is_unchanged() -> None:
    leak = _leak()
    observation = build_observation(user_id=USER, leak=leak, finding=_finding(leak))
    first = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[observation],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    )
    later_import = "55555555-5555-4555-8555-555555555555"
    second = plan_registry_changes(
        user_id=USER,
        existing=[first.writes[0]],
        observations=[observation],
        statement_import_id=later_import,
        observed_at=LATER,
    )
    assert second.items[0].classification == "unchanged"
    assert second.items[0].row.status == "open"
    assert second.items[0].row.signature_generation == 1
    assert second.items[0].row.last_seen_at == LATER
    assert second.items[0].row.last_statement_import_id == later_import
    assert len(second.writes) == 1


def test_material_change_increments_generation_once() -> None:
    original = build_observation(user_id=USER, leak=_leak(), finding=_finding(_leak()))
    stored = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[original],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    ).writes[0]
    changed_leak = _leak(
        evidence={
            "finding_focus": "interest_charges",
            "interest_charge_total": Decimal("240.00"),
            "completed_month_count": 3,
        }
    )
    changed = build_observation(
        user_id=USER,
        leak=changed_leak,
        finding=_finding(changed_leak),
    )
    updated = plan_registry_changes(
        user_id=USER,
        existing=[stored],
        observations=[changed],
        statement_import_id=IMPORT_ID,
        observed_at=LATER,
    )
    assert updated.items[0].classification == "materially_changed"
    assert updated.items[0].row.signature_generation == stored.signature_generation + 1
    repeat = plan_registry_changes(
        user_id=USER,
        existing=[updated.writes[0]],
        observations=[changed],
        statement_import_id=IMPORT_ID,
        observed_at=LATER,
    )
    assert repeat.items[0].classification == "unchanged"
    assert repeat.items[0].row.signature_generation == 2
    assert repeat.writes == ()


def test_confidence_fluctuation_is_not_material() -> None:
    steady = _leak()
    noisy = _leak(
        confidence=0.81,
        evidence={
            "finding_focus": "sms_banking",
            "sms_fee_total": Decimal("80.00"),
            "completed_month_count": 3,
            "behaviour_confidence": Decimal("0.91"),
        },
    )
    assert material_signature(steady, _finding(steady)) == material_signature(
        noisy,
        _finding(noisy),
    )
    stored = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[build_observation(user_id=USER, leak=steady, finding=_finding(steady))],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    ).writes[0]
    follow_up = plan_registry_changes(
        user_id=USER,
        existing=[stored],
        observations=[build_observation(user_id=USER, leak=noisy, finding=_finding(noisy))],
        statement_import_id="66666666-6666-4666-8666-666666666666",
        observed_at=LATER,
    )
    assert follow_up.items[0].classification == "unchanged"
    assert follow_up.items[0].row.signature_generation == 1
    assert follow_up.items[0].row.material_signature == stored.material_signature


def test_absent_finding_is_not_observed_rather_than_resolved() -> None:
    observation = build_observation(user_id=USER, leak=_leak(), finding=_finding(_leak()))
    stored = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[observation],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    ).writes[0]
    later_import = "55555555-5555-4555-8555-555555555555"
    absent = plan_registry_changes(
        user_id=USER,
        existing=[stored],
        observations=[],
        statement_import_id=later_import,
        observed_at=LATER,
    )
    assert len(absent.items) == 1
    assert absent.items[0].classification == "not_observed"
    row = absent.items[0].row
    assert row.status == "not_observed"
    assert row.status != "resolved"
    assert row.signature_generation == 1
    assert row.last_absent_at == LATER
    assert row.last_seen_at == WHEN
    assert row.last_statement_import_id == later_import
    payload = registry_row_payload(row)
    assert "resolved" not in payload.values()
    assert "saved_amount" not in payload


def test_detector_version_change_does_not_create_new_findings() -> None:
    current = _leak()
    revised_fingerprint = leak_fingerprint(
        user_id=USER,
        leak_type="bank_fee_leak",
        subject_key="bank-fees",
        detector_version="1.1",
    )
    revised = _leak(fingerprint=revised_fingerprint, detector_version="1.1")
    assert current.fingerprint != revised.fingerprint
    first = build_observation(user_id=USER, leak=current, finding=_finding(current))
    second = build_observation(user_id=USER, leak=revised, finding=_finding(revised))
    assert first.identity_key == second.identity_key
    assert finding_identity_key(USER, "bank_fee_leak", "bank-fees") == first.identity_key
    stored = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[first],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    ).writes[0]
    planned = plan_registry_changes(
        user_id=USER,
        existing=[stored],
        observations=[second],
        statement_import_id=IMPORT_ID,
        observed_at=LATER,
    )
    assert len(planned.items) == 1
    assert planned.items[0].classification == "unchanged"
    assert planned.items[0].row.fingerprint == revised_fingerprint
    assert planned.items[0].row.detector_version == "1.1"
    assert planned.items[0].row.signature_generation == 1
    assert planned.items[0].row.status == "open"
    assert "not_observed" not in {item.classification for item in planned.items}


def test_repeating_the_same_import_is_idempotent() -> None:
    memory = _Memory()
    leak = _leak()
    finding = _finding(leak)
    calls = {"run": 0}

    def intelligence(user_id: str) -> FinancialIntelligenceRun:
        calls["run"] += 1
        return _intelligence(leak, finding, user_id)

    record = _processed()
    first = _reconcile(memory, intelligence, record, WHEN)
    second = _reconcile(memory, intelligence, record, LATER)
    assert first.new_findings == 1
    assert first.writes == 1
    assert second.unchanged_findings == 1
    assert second.writes == 0
    assert second.new_findings == 0
    assert memory.saves == 1
    assert len(memory.rows) == 1
    assert memory.rows[0].signature_generation == 1
    assert calls["run"] == 2


def test_failed_import_does_not_update_the_registry() -> None:
    memory = _Memory()

    def intelligence(_user_id: str) -> FinancialIntelligenceRun:
        raise AssertionError("pipeline")

    def save(*_args: object) -> None:
        raise AssertionError("save")

    for status, count in (("failed", 4), ("processing", 4), ("processed", 0)):
        with pytest.raises(HTTPException) as caught:
            _reconcile(
                memory,
                intelligence,
                _processed(status=status, transaction_count=count),
                WHEN,
            )
        assert caught.value.status_code == 409
    assert memory.saves == 0
    assert memory.rows == []
    save  # the orchestrator must use the injected store, which stayed empty


def test_another_user_cannot_use_these_records() -> None:
    observation = build_observation(user_id=USER, leak=_leak(), finding=_finding(_leak()))
    stored = plan_registry_changes(
        user_id=USER,
        existing=[],
        observations=[observation],
        statement_import_id=IMPORT_ID,
        observed_at=WHEN,
    ).writes[0]
    foreign = RegistryRow(**{**stored.__dict__, "user_id": OTHER})
    try:
        plan_registry_changes(
            user_id=USER,
            existing=[foreign],
            observations=[observation],
            statement_import_id=IMPORT_ID,
            observed_at=LATER,
        )
    except RegistryScopeError:
        pass
    else:
        raise AssertionError("foreign registry row was accepted")

    def load_other(_user_id: str, _token: str, _import_id: str):
        return _processed(user_id=OTHER)

    with pytest.raises(HTTPException) as missing:
        asyncio.run(
            reconcile_findings_after_import(
                USER,
                "token",
                IMPORT_ID,
                load_import=load_other,
                load_rows=_Memory().load,
                save_rows=_Memory().save,
                run_intelligence=_boom,
                observed_at=WHEN,
            )
        )
    assert missing.value.status_code == 404


def test_registry_query_and_import_lookup_stay_on_the_authenticated_user(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.finding_registry._project_url",
        lambda: "https://example.supabase.co",
    )
    url = _filter_url("finding_registry", "id", USER)
    assert f"user_id=eq.{USER}" in url
    assert OTHER not in url

    def rows(*_args: object, **_kwargs: object) -> list[dict[str, object]]:
        return [
            {
                "id": IMPORT_ID,
                "user_id": OTHER,
                "account_id": None,
                "status": "processed",
                "transaction_count": 2,
                "processed_at": WHEN.isoformat(),
            }
        ]

    monkeypatch.setattr("app.finding_registry._request_json", rows)
    assert load_statement_import(USER, "token", IMPORT_ID) is None


def test_migration_enables_owner_only_rls() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "enable row level security" in sql
    assert "auth.uid()" in sql
    assert "finding registry select own" in sql
    assert "finding registry insert own" in sql
    assert "finding registry update own" in sql
    assert "for delete" not in sql
    assert "service_role" not in sql
    assert "unique (user_id, fingerprint)" in sql
    assert "unique (user_id, identity_key)" in sql
    assert "revoke all on table public.finding_registry from public, anon" in sql
    assert "verified_savings" not in sql
    assert "expected_savings" not in sql
    assert "not_observed" in sql
    assert "last_detected_at" not in sql
    assert "last_absent_at" in sql
    assert "'resolved'" not in sql


def test_forward_migration_allows_every_detector_leak_type() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "202610200001_expand_finding_registry_leak_types.sql"
    )
    sql = migration.read_text(encoding="utf-8").lower()
    for leak_type in (
        "duplicate_debit_order_leak",
        "duplicate_streaming_leak",
        "irregular_transaction_leak",
        "inactive_recurring_payment_leak",
        "subscription_leak",
    ):
        assert f"'{leak_type}'" in sql


def test_existing_report_contract_and_savings_semantics_stay_unchanged() -> None:
    version_one = leak_fingerprint(
        user_id=USER,
        leak_type="bank_fee_leak",
        subject_key="bank-fees",
        detector_version="1.0",
    )
    version_two = leak_fingerprint(
        user_id=USER,
        leak_type="bank_fee_leak",
        subject_key="bank-fees",
        detector_version="1.1",
    )
    assert version_one != version_two
    assert ReportConsistency().persisted_snapshot is False
    summary = ReportFinancialSummary(inventories=ReportInventories())
    assert summary.verified_savings.availability == "unavailable"
    assert summary.expected_savings.availability == "unavailable"
    assert summary.amounts_are_additive is False
    impact = ImpactAssessment(detected_amount=Decimal("10.00"), impact_kind="recurring")
    assert impact.potentially_avoidable_amount is None
    assert impact.recoverable_amount is None
    assert Recommendation.model_fields["expected_savings_amount"].default is None
    leak = _leak()
    highlights = sanitise_highlights(
        _finding(
            leak,
            evidence_highlights=[
                EvidenceHighlight(key="description", label="Description", value="CARD 4111111111111111"),
                EvidenceHighlight(key="current_total", label="Current total", value="4111111111111111"),
                EvidenceHighlight(key="fee_transaction_count", label="Fee transactions", value=4),
            ],
        )
    )
    assert highlights == (("fee_transaction_count", "Fee transactions", 4),)
    payload = registry_row_payload(
        plan_registry_changes(
            user_id=USER,
            existing=[],
            observations=[
                __import__(
                    "leak_intelligence.finding_diff",
                    fromlist=["build_observation"],
                ).build_observation(user_id=USER, leak=leak, finding=_finding(leak))
            ],
            statement_import_id=IMPORT_ID,
            observed_at=WHEN,
        ).writes[0]
    )
    assert {
        "verified_savings",
        "expected_savings",
        "expected_savings_amount",
        "recoverable_amount",
        "saved_amount",
    }.isdisjoint(payload)


def test_report_get_does_not_write_the_registry(monkeypatch) -> None:
    def explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("registry write")

    monkeypatch.setattr("app.finding_registry.save_registry_rows", explode)
    monkeypatch.setattr("app.finding_registry.load_registry_rows", explode)
    monkeypatch.setattr("app.finding_registry.save_finding_notifications", explode)

    async def fake_snapshot(user_id: str, _token: str):
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
    app.dependency_overrides[require_supabase_user] = lambda: "registry-report-user"
    try:
        response = TestClient(app).get("/financial-intelligence-report", headers=AUTH)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["consistency"]["persisted_snapshot"] is False
    assert body["financial_summary"]["verified_savings"] == {"availability": "unavailable"}
    assert body["financial_summary"]["expected_savings"] == {"availability": "unavailable"}


def test_reconcile_route_requires_a_bearer_token() -> None:
    response = TestClient(app).post(f"/finding-registry/imports/{IMPORT_ID}")
    assert response.status_code == 401


async def _boom(_user_id: str, _token: str) -> FinancialIntelligenceRun:
    raise AssertionError("pipeline")
