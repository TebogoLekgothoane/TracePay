"""Persist finding identity after a processed statement import.

Report reads do not write. In-app notices are created only from this import flow.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.financial_intelligence_report import (
    FinancialIntelligenceRun,
    ReportCompositionError,
    build_user_financial_intelligence_run,
)
from leak_intelligence.finding_diff import (
    RegistryCompositionError,
    RegistryObservation,
    RegistryPlan,
    RegistryRow,
    RegistryScopeError,
    observations_from_run,
    plan_registry_changes,
)
from leak_intelligence.finding_notifications import (
    FindingNotification,
    assign_finding_ids,
    notifications_for_plan,
)
from leak_intelligence.finding_outcomes import (
    DetectorHistory,
    FindingOutcomeCheck,
    StatementWindow,
    outcome_checks_for_import,
    outcome_insert_payload,
)
from leak_intelligence.intelligence_report import FinancialIntelligenceReport

logger = logging.getLogger("tracepay.finding_registry")

PAGE_SIZE = 1_000
MAX_ROWS = 5_000
REQUEST_TIMEOUT_SECONDS = 10
_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_SAVINGS_FIELDS = frozenset(
    {
        "verified_savings",
        "expected_savings",
        "expected_savings_amount",
        "potentially_avoidable_amount",
        "recoverable_amount",
        "saved_amount",
    }
)
_COLUMNS = (
    "id,user_id,fingerprint,identity_key,leak_type,detector_version,account_id,"
    "status,material_signature,signature_generation,finding_focus,root_cause_type,"
    "analysis_status,persistence,detected_amount,impact_kind,impact_label,"
    "period_start,period_end,evidence_highlights,first_detected_at,last_seen_at,"
    "last_absent_at,last_statement_import_id"
)

LoadImport = Callable[[str, str, str], "StatementImportRecord | None"]
LoadRows = Callable[[str, str], list[RegistryRow]]
SaveRows = Callable[[str, str, Sequence[RegistryRow]], None]
SaveNotifications = Callable[[str, str, Sequence[FindingNotification]], None]
LoadWindow = Callable[[str, str, str], StatementWindow]
SaveOutcomes = Callable[[str, str, Sequence[FindingOutcomeCheck]], None]
RunIntelligence = Callable[[str, str], Awaitable[FinancialIntelligenceRun]]


class RegistryConflict(Exception):
    """Another write stored the same finding identity first."""


class FindingReconciliationResult(BaseModel):
    statement_import_id: str
    findings_seen: int = Field(ge=0)
    new_findings: int = Field(ge=0)
    unchanged_findings: int = Field(ge=0)
    materially_changed_findings: int = Field(ge=0)
    not_observed_findings: int = Field(ge=0)
    writes: int = Field(ge=0)
    skipped: str | None = None


@dataclass(frozen=True)
class StatementImportRecord:
    id: str
    user_id: str
    account_id: str | None
    status: str
    transaction_count: int
    processed_at: datetime | None


async def reconcile_findings_after_import(
    user_id: str,
    access_token: str,
    statement_import_id: str,
    *,
    load_import: LoadImport = None,  # type: ignore[assignment]
    load_rows: LoadRows = None,  # type: ignore[assignment]
    save_rows: SaveRows = None,  # type: ignore[assignment]
    save_notifications: SaveNotifications = None,  # type: ignore[assignment]
    load_window: LoadWindow = None,  # type: ignore[assignment]
    save_outcomes: SaveOutcomes = None,  # type: ignore[assignment]
    run_intelligence: RunIntelligence = build_user_financial_intelligence_run,
    observed_at: datetime | None = None,
) -> FindingReconciliationResult:
    """Run the existing report once and upsert findings for this import."""
    load_import = load_statement_import if load_import is None else load_import
    load_rows = load_registry_rows if load_rows is None else load_rows
    save_rows = save_registry_rows if save_rows is None else save_rows
    save_notifications = (
        save_finding_notifications if save_notifications is None else save_notifications
    )
    load_window = load_statement_window if load_window is None else load_window
    save_outcomes = save_outcome_checks if save_outcomes is None else save_outcomes
    user_id = _require_uuid(user_id)
    statement_import_id = _require_uuid(statement_import_id)
    if not access_token.strip():
        raise HTTPException(status_code=401, detail="A Supabase access token is required.")

    record = await asyncio.to_thread(
        load_import,
        user_id,
        access_token,
        statement_import_id,
    )
    if record is None or record.user_id != user_id or record.id != statement_import_id:
        raise HTTPException(status_code=404, detail="The statement import could not be found.")
    if record.status != "processed" or record.transaction_count < 1:
        raise HTTPException(
            status_code=409,
            detail="The statement import has not finished saving transactions.",
        )

    when = observed_at or datetime.now(timezone.utc)
    existing = await asyncio.to_thread(load_rows, user_id, access_token)
    _reject_foreign_rows(user_id, existing)
    if await asyncio.to_thread(
        _import_is_superseded,
        record,
        existing,
        load_import,
        user_id,
        access_token,
    ):
        return _empty_result(statement_import_id, skipped="superseded")

    try:
        intelligence = await run_intelligence(user_id, access_token)
        observations = observations_from_run(
            user_id,
            intelligence.report,
            intelligence.leaks,
        )
    except RegistryScopeError:
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        ) from None
    except (RegistryCompositionError, ReportCompositionError):
        logger.error(
            "finding_registry_composition_failed user_id_prefix=%s",
            user_id[:8],
        )
        raise HTTPException(
            status_code=500,
            detail="Financial intelligence report could not be assembled.",
        ) from None

    prior = existing
    plan = _identified_plan(
        user_id=user_id,
        existing=prior,
        observations=observations,
        statement_import_id=statement_import_id,
        account_id=record.account_id,
        observed_at=when,
    )
    if plan.writes:
        try:
            await asyncio.to_thread(save_rows, user_id, access_token, plan.writes)
        except RegistryConflict:
            prior = await asyncio.to_thread(load_rows, user_id, access_token)
            _reject_foreign_rows(user_id, prior)
            plan = _identified_plan(
                user_id=user_id,
                existing=prior,
                observations=observations,
                statement_import_id=statement_import_id,
                account_id=record.account_id,
                observed_at=when,
            )
            if plan.writes:
                try:
                    await asyncio.to_thread(save_rows, user_id, access_token, plan.writes)
                except RegistryConflict:
                    raise HTTPException(
                        status_code=503,
                        detail="Finding registry is temporarily unavailable. Please try again.",
                    ) from None
    notices = notifications_for_plan(plan, user_id=user_id, observed_at=when)
    if notices:
        try:
            await asyncio.to_thread(save_notifications, user_id, access_token, notices)
        except RegistryScopeError:
            raise HTTPException(
                status_code=403,
                detail="Findings must stay within the authenticated user.",
            ) from None
        except RegistryConflict:
            pass
    await asyncio.to_thread(
        _store_outcome_checks,
        user_id,
        access_token,
        statement_import_id,
        prior,
        plan,
        intelligence.report,
        when,
        load_window,
        save_outcomes,
    )
    result = _result(statement_import_id, plan)
    logger.info(
        "finding_registry_reconciled user_id_prefix=%s import_prefix=%s "
        "new=%s unchanged=%s changed=%s absent=%s writes=%s",
        user_id[:8],
        statement_import_id[:8],
        result.new_findings,
        result.unchanged_findings,
        result.materially_changed_findings,
        result.not_observed_findings,
        result.writes,
    )
    return result


def registry_row_payload(row: RegistryRow) -> dict[str, Any]:
    """JSON row for PostgREST. Savings fields are not part of the contract."""
    payload = {
        "user_id": row.user_id,
        "fingerprint": row.fingerprint,
        "identity_key": row.identity_key,
        "leak_type": row.leak_type,
        "detector_version": row.detector_version,
        "account_id": row.account_id,
        "status": row.status,
        "material_signature": row.material_signature,
        "signature_generation": row.signature_generation,
        "finding_focus": row.finding_focus,
        "root_cause_type": row.root_cause_type,
        "analysis_status": row.analysis_status,
        "persistence": row.persistence,
        "detected_amount": format(row.detected_amount, "f"),
        "impact_kind": row.impact_kind,
        "impact_label": row.impact_label,
        "period_start": None if row.period_start is None else row.period_start.isoformat(),
        "period_end": None if row.period_end is None else row.period_end.isoformat(),
        "evidence_highlights": [
            {"key": key, "label": label, "value": value}
            for key, label, value in row.evidence_highlights
        ],
        "first_detected_at": row.first_detected_at.isoformat(),
        "last_seen_at": row.last_seen_at.isoformat(),
        "last_absent_at": (
            None if row.last_absent_at is None else row.last_absent_at.isoformat()
        ),
        "last_statement_import_id": row.last_statement_import_id,
    }
    if row.id:
        payload["id"] = row.id
    if _SAVINGS_FIELDS.intersection(payload):
        raise RegistryCompositionError("Registry rows cannot store savings.")
    return payload


def notification_payload(notification: FindingNotification) -> dict[str, Any]:
    """JSON notice for PostgREST. Copy is title and body only."""
    payload = {
        "user_id": notification.user_id,
        "finding_id": notification.finding_id,
        "dedupe_key": notification.dedupe_key,
        "channel": notification.channel,
        "delivery_status": notification.delivery_status,
        "title": notification.title,
        "body": notification.body,
        "created_at": notification.created_at.isoformat(),
        "read_at": None if notification.read_at is None else notification.read_at.isoformat(),
    }
    if _SAVINGS_FIELDS.intersection(payload) or notification.channel != "in_app":
        raise RegistryCompositionError("Notification payload is not an in-app notice.")
    return payload


def load_statement_import(
    user_id: str,
    access_token: str,
    statement_import_id: str,
) -> StatementImportRecord | None:
    rows = _request_json(
        _filter_url(
            "statement_imports",
            "id,user_id,account_id,status,transaction_count,processed_at",
            user_id,
            extra=f"&id=eq.{statement_import_id}",
        ),
        access_token,
        method="GET",
    )
    if not rows:
        return None
    row = rows[0]
    if not isinstance(row, dict) or row.get("user_id") != user_id:
        return None
    if row.get("id") != statement_import_id:
        return None
    account_id = row.get("account_id")
    if account_id is not None and not (isinstance(account_id, str) and _UUID.fullmatch(account_id)):
        raise HTTPException(status_code=503, detail="Statement import data is invalid.")
    status = row.get("status")
    count = row.get("transaction_count")
    if not isinstance(status, str) or isinstance(count, bool) or not isinstance(count, int):
        raise HTTPException(status_code=503, detail="Statement import data is invalid.")
    return StatementImportRecord(
        id=statement_import_id,
        user_id=user_id,
        account_id=account_id,
        status=status,
        transaction_count=count,
        processed_at=_optional_datetime(row.get("processed_at")),
    )


def load_registry_rows(user_id: str, access_token: str) -> list[RegistryRow]:
    rows: list[RegistryRow] = []
    for start in range(0, MAX_ROWS, PAGE_SIZE):
        page = _request_json(
            _filter_url("finding_registry", _COLUMNS, user_id),
            access_token,
            method="GET",
            range_header=f"{start}-{start + PAGE_SIZE - 1}",
        )
        if not isinstance(page, list):
            raise HTTPException(status_code=503, detail="Finding registry data is invalid.")
        for item in page:
            if not isinstance(item, dict):
                raise HTTPException(status_code=503, detail="Finding registry data is invalid.")
            parsed = _parse_registry_row(item, user_id)
            rows.append(parsed)
        if len(page) < PAGE_SIZE:
            return rows
    raise HTTPException(
        status_code=413,
        detail="Too many findings to reconcile at once.",
    )


def save_finding_notifications(
    user_id: str,
    access_token: str,
    notifications: Sequence[FindingNotification],
) -> None:
    if any(item.user_id != user_id for item in notifications):
        raise RegistryScopeError("Notification belongs to a different user.")
    if not notifications:
        return
    _request_json(
        (
            f"{_project_url()}/rest/v1/finding_notifications"
            "?on_conflict=user_id,dedupe_key"
        ),
        access_token,
        method="POST",
        body=[notification_payload(item) for item in notifications],
        prefer="resolution=ignore-duplicates,return=minimal",
    )


def save_registry_rows(
    user_id: str,
    access_token: str,
    rows: Sequence[RegistryRow],
) -> None:
    if any(row.user_id != user_id for row in rows):
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        )
    if not rows:
        return
    _request_json(
        (
            f"{_project_url()}/rest/v1/finding_registry"
            "?on_conflict=user_id,identity_key"
        ),
        access_token,
        method="POST",
        body=[registry_row_payload(row) for row in rows],
        prefer="resolution=merge-duplicates,return=minimal",
    )


def load_statement_window(
    user_id: str,
    access_token: str,
    statement_import_id: str,
) -> StatementWindow:
    """Non-duplicate dates on this import, and the latest date from earlier imports."""
    current = _date_bounds(
        user_id,
        access_token,
        f"&statement_id=eq.{quote(statement_import_id, safe='')}"
        "&is_duplicate=eq.false",
    )
    previous = _date_bounds(
        user_id,
        access_token,
        f"&statement_id=neq.{quote(statement_import_id, safe='')}"
        "&is_duplicate=eq.false",
    )
    return StatementWindow(
        statement_import_id=statement_import_id,
        earliest=current[0],
        latest=current[1],
        non_duplicate_count=current[2],
        previous_earliest=previous[0],
        previous_latest=previous[1],
    )


def save_outcome_checks(
    user_id: str,
    access_token: str,
    checks: Sequence[FindingOutcomeCheck],
) -> None:
    if any(item.user_id != user_id for item in checks):
        raise RegistryScopeError("Outcome check belongs to a different user.")
    if not checks:
        return
    _request_json(
        (
            f"{_project_url()}/rest/v1/finding_outcome_checks"
            "?on_conflict=finding_id,statement_import_id"
        ),
        access_token,
        method="POST",
        body=[outcome_insert_payload(item) for item in checks],
        prefer="resolution=ignore-duplicates,return=minimal",
    )


def _store_outcome_checks(
    user_id: str,
    access_token: str,
    statement_import_id: str,
    existing: Sequence[RegistryRow],
    plan: RegistryPlan,
    report: FinancialIntelligenceReport,
    checked_at: datetime,
    load_window: LoadWindow,
    save_outcomes: SaveOutcomes,
) -> None:
    if not any(
        row.last_statement_import_id
        and row.last_statement_import_id != statement_import_id
        and row.id
        for row in existing
    ):
        return
    window = load_window(user_id, access_token, statement_import_id)
    analysis = report.analysis
    try:
        checks = outcome_checks_for_import(
        user_id=user_id,
        existing=existing,
        plan=plan,
        window=window,
        history=DetectorHistory(
            history_sufficient=bool(analysis.history_sufficient_for_leak_detection),
            findings_availability=str(analysis.findings_availability),
            transaction_count=int(analysis.transaction_count),
            earliest=analysis.earliest_transaction_date,
            latest=analysis.latest_transaction_date,
        ),
        statement_import_id=statement_import_id,
        checked_at=checked_at,
    )
    except RegistryCompositionError:
        raise HTTPException(
            status_code=500,
            detail="Financial intelligence report could not be assembled.",
        ) from None
    if not checks:
        return
    try:
        save_outcomes(user_id, access_token, checks)
    except RegistryConflict:
        return
    except RegistryScopeError:
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        ) from None


def _date_bounds(
    user_id: str,
    access_token: str,
    extra: str,
) -> tuple[date | None, date | None, int]:
    earliest = _one_date(user_id, access_token, extra, "date.asc")
    latest = _one_date(user_id, access_token, extra, "date.desc")
    count = 0 if earliest is None else 1
    return earliest, latest, count


def _one_date(
    user_id: str,
    access_token: str,
    extra: str,
    order: str,
) -> date | None:
    rows = _request_json(
        _filter_url(
            "transactions",
            "date",
            user_id,
            f"{extra}&order={order}&limit=1",
        ),
        access_token,
        method="GET",
    )
    if not rows:
        return None
    value = rows[0].get("date")
    if not isinstance(value, str):
        raise HTTPException(status_code=503, detail="Statement history is invalid.")
    return date.fromisoformat(value[:10])


def _identified_plan(
    *,
    user_id: str,
    existing: Sequence[RegistryRow],
    observations: Sequence[RegistryObservation],
    statement_import_id: str,
    account_id: str | None,
    observed_at: datetime,
) -> RegistryPlan:
    return assign_finding_ids(
        _plan_for_import(
            user_id=user_id,
            existing=existing,
            observations=observations,
            statement_import_id=statement_import_id,
            account_id=account_id,
            observed_at=observed_at,
        )
    )


def _plan_for_import(
    *,
    user_id: str,
    existing: Sequence[RegistryRow],
    observations: Sequence[RegistryObservation],
    statement_import_id: str,
    account_id: str | None,
    observed_at: datetime,
) -> RegistryPlan:
    try:
        return plan_registry_changes(
            user_id=user_id,
            existing=existing,
            observations=observations,
            statement_import_id=statement_import_id,
            account_id=account_id,
            observed_at=observed_at,
        )
    except RegistryScopeError:
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        ) from None


def _import_is_superseded(
    record: StatementImportRecord,
    existing: Sequence[RegistryRow],
    load_import: LoadImport,
    user_id: str,
    access_token: str,
) -> bool:
    latest_id = _latest_import_id(existing)
    if latest_id is None or latest_id == record.id or record.processed_at is None:
        return False
    latest = load_import(user_id, access_token, latest_id)
    if latest is None or latest.processed_at is None:
        return False
    return record.processed_at < latest.processed_at


def _latest_import_id(rows: Sequence[RegistryRow]) -> str | None:
    stamped = [row for row in rows if row.last_statement_import_id]
    if not stamped:
        return None
    return max(stamped, key=lambda row: row.last_seen_at).last_statement_import_id


def _result(statement_import_id: str, plan: RegistryPlan) -> FindingReconciliationResult:
    counts = {
        "new": 0,
        "unchanged": 0,
        "materially_changed": 0,
        "not_observed": 0,
    }
    for item in plan.items:
        counts[item.classification] = counts.get(item.classification, 0) + 1
    return FindingReconciliationResult(
        statement_import_id=statement_import_id,
        findings_seen=counts["new"] + counts["unchanged"] + counts["materially_changed"],
        new_findings=counts["new"],
        unchanged_findings=counts["unchanged"],
        materially_changed_findings=counts["materially_changed"],
        not_observed_findings=counts["not_observed"],
        writes=len(plan.writes),
    )


def _empty_result(statement_import_id: str, *, skipped: str) -> FindingReconciliationResult:
    return FindingReconciliationResult(
        statement_import_id=statement_import_id,
        findings_seen=0,
        new_findings=0,
        unchanged_findings=0,
        materially_changed_findings=0,
        not_observed_findings=0,
        writes=0,
        skipped=skipped,
    )


def _reject_foreign_rows(user_id: str, rows: Sequence[RegistryRow]) -> None:
    if any(row.user_id != user_id for row in rows):
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        )


def _filter_url(table: str, select: str, user_id: str, extra: str = "") -> str:
    return (
        f"{_project_url()}/rest/v1/{table}?select={quote(select, safe=',')}"
        f"&user_id=eq.{quote(user_id, safe='')}"
        f"{extra}"
    )


def _project_url() -> str:
    project_url = settings.supabase_url.rstrip("/")
    if not project_url or not settings.supabase_publishable_key():
        logger.error("finding_registry_unavailable reason=supabase_not_configured")
        raise HTTPException(status_code=503, detail="Financial analysis is not configured.")
    return project_url


def _request_json(
    url: str,
    access_token: str,
    *,
    method: str,
    body: object | None = None,
    prefer: str | None = None,
    range_header: str | None = None,
) -> list[dict[str, Any]]:
    headers = {
        "apikey": settings.supabase_publishable_key(),
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if prefer:
        headers["Prefer"] = prefer
    if range_header:
        headers["Range"] = range_header
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        if _is_conflict(error):
            raise RegistryConflict from None
        logger.warning(
            "finding_registry_request_failed status=%s",
            getattr(error, "code", None),
        )
        raise HTTPException(
            status_code=503,
            detail="Finding registry is temporarily unavailable. Please try again.",
        ) from None
    except (URLError, TimeoutError, ValueError):
        logger.warning("finding_registry_request_failed error_type=transport")
        raise HTTPException(
            status_code=503,
            detail="Finding registry is temporarily unavailable. Please try again.",
        ) from None
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=503, detail="Finding registry data is invalid.") from None
    if parsed is None:
        return []
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        raise HTTPException(status_code=503, detail="Finding registry data is invalid.")
    return parsed


def _is_conflict(error: HTTPError) -> bool:
    if error.code == 409:
        return True
    try:
        payload = json.loads(error.read().decode("utf-8"))
    except (OSError, ValueError, UnicodeError):
        return False
    return isinstance(payload, dict) and payload.get("code") == "23505"


def _parse_registry_row(row: dict[str, Any], user_id: str) -> RegistryRow:
    if row.get("user_id") != user_id:
        raise HTTPException(
            status_code=403,
            detail="Findings must stay within the authenticated user.",
        )
    try:
        highlights = _parse_highlights(row.get("evidence_highlights"))
        return RegistryRow(
            id=_required_text(row.get("id")),
            user_id=user_id,
            fingerprint=_required_text(row.get("fingerprint")),
            identity_key=_required_text(row.get("identity_key")),
            leak_type=_required_text(row.get("leak_type")),
            detector_version=_required_text(row.get("detector_version")),
            account_id=_optional_text(row.get("account_id")),
            status=_required_text(row.get("status")),
            material_signature=_required_text(row.get("material_signature")),
            signature_generation=_required_int(row.get("signature_generation")),
            finding_focus=_optional_text(row.get("finding_focus")),
            root_cause_type=_required_text(row.get("root_cause_type")),
            analysis_status=_required_text(row.get("analysis_status")),
            persistence=_required_text(row.get("persistence")),
            detected_amount=_required_amount(row.get("detected_amount")),
            impact_kind=_required_text(row.get("impact_kind")),
            impact_label=_optional_text(row.get("impact_label")),
            period_start=_optional_date(row.get("period_start")),
            period_end=_optional_date(row.get("period_end")),
            evidence_highlights=highlights,
            first_detected_at=_required_datetime(row.get("first_detected_at")),
            last_seen_at=_required_datetime(row.get("last_seen_at")),
            last_absent_at=_optional_datetime(row.get("last_absent_at")),
            last_statement_import_id=_optional_text(row.get("last_statement_import_id")),
        )
    except (TypeError, ValueError, InvalidOperation):
        raise HTTPException(status_code=503, detail="Finding registry data is invalid.") from None


def _parse_highlights(value: object) -> tuple[tuple[str, str, str | int | bool], ...]:
    if not isinstance(value, list):
        raise ValueError("highlights")
    parsed: list[tuple[str, str, str | int | bool]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("highlight")
        key = item.get("key")
        label = item.get("label")
        stored = item.get("value")
        if not isinstance(key, str) or not isinstance(label, str):
            raise ValueError("highlight")
        if isinstance(stored, bool) or isinstance(stored, int) or isinstance(stored, str):
            parsed.append((key, label, stored))
            continue
        if isinstance(stored, float):
            parsed.append((key, label, format(Decimal(str(stored)).quantize(Decimal("0.01")), "f")))
            continue
        raise ValueError("highlight")
    return tuple(parsed)


def _require_uuid(value: str) -> str:
    if not _UUID.fullmatch(value):
        raise HTTPException(status_code=400, detail="The statement import id is invalid.")
    return value


def _required_text(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("text")
    return value


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    return _required_text(value)


def _required_int(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("int")
    return value


def _required_amount(value: object) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise ValueError("amount")
    if isinstance(value, str):
        parsed = Decimal(value)
    elif isinstance(value, int):
        parsed = Decimal(value)
    elif isinstance(value, float):
        parsed = Decimal(str(value))
    else:
        raise ValueError("amount")
    if not parsed.is_finite() or parsed < 0:
        raise ValueError("amount")
    return parsed.quantize(Decimal("0.01"))


def _required_datetime(value: object) -> datetime:
    parsed = _optional_datetime(value)
    if parsed is None:
        raise ValueError("datetime")
    return parsed


def _optional_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("datetime")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("datetime")
    return parsed


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("date")
    return date.fromisoformat(value)
