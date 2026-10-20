"""Compare one intelligence run with the saved finding registry.

The diff remembers findings. It does not notify, resolve, or calculate savings.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

from leak_intelligence.intelligence_report import (
    FinancialIntelligenceReport,
    ReportFinding,
)
from leak_intelligence.leak_keys import subject_key
from leak_intelligence.leak_models import LeakDetection, LeakDetectionResult

_RECURRING = frozenset(
    {
        "subscription_leak",
        "recurring_payment_leak",
        "unknown_recurring_payment",
        "inactive_recurring_payment_leak",
        "duplicate_streaming_leak",
    }
)
_CATEGORY = frozenset(
    {
        "airtime_data_leak",
        "food_spending_leak",
        "transport_spending_leak",
    }
)
_FEE_OR_SPENDING = frozenset(
    {
        "bank_fee_leak",
        "spending_escalation_leak",
        "cash_usage_leak",
        "coffee_spending_leak",
        "convenience_store_leak",
        "weekend_spending_leak",
        "payday_spending_leak",
        *_CATEGORY,
    }
)
_FEE_TOTAL_KEYS = (
    "sms_fee_total",
    "balance_enquiry_fee_total",
    "immediate_payment_fee_total",
    "foreign_transaction_fee_total",
    "interest_charge_total",
    "overdraft_fee_total",
    "insufficient_funds_fee_total",
    "card_fee_total",
    "monthly_average_fee",
    "atm_fee_total",
    "fee_change_amount",
    "previous_amount",
    "current_amount",
    "previous_total",
    "current_total",
)
_COUNT_KEYS = ("completed_month_count", "months_compared")
_FORBIDDEN_HIGHLIGHT_KEYS = frozenset(
    {
        "description",
        "account",
        "account_number",
        "body",
        "raw",
        "reference",
        "transaction_ids",
    }
)
_FOCUS = re.compile(r"^[a-z0-9_]{1,80}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LONG_DIGITS = re.compile(r"\d{6,}")
_MERCHANT_REF = re.compile(r"merchants\[(.+?)\]")
_BANDS = (
    (Decimal("10"), "under_10"),
    (Decimal("50"), "10_to_49"),
    (Decimal("200"), "50_to_199"),
    (Decimal("1000"), "200_to_999"),
    (Decimal("5000"), "1000_to_4999"),
)
Highlight = tuple[str, str, str | int | bool]


class RegistryScopeError(Exception):
    """A registry row or finding belongs to a different user."""


class RegistryCompositionError(Exception):
    """The report and leak rows from one run cannot be registered together."""


class ImportNotProcessed(Exception):
    """A statement import that did not finish must not update the registry."""


def require_processed_import(*, owner_id: str, user_id: str, status: str) -> None:
    """Reject another user's import and any import that is not processed."""
    if owner_id != user_id:
        raise RegistryScopeError("Statement import belongs to a different user.")
    if status != "processed":
        raise ImportNotProcessed("Only a processed statement import can update the registry.")


@dataclass(frozen=True)
class RegistryObservation:
    """One current finding, already reduced to registry fields."""

    user_id: str
    fingerprint: str
    identity_key: str
    leak_type: str
    detector_version: str
    finding_focus: str | None
    root_cause_type: str
    analysis_status: str
    persistence: str
    detected_amount: Decimal
    impact_kind: str
    impact_label: str | None
    period_start: date | None
    period_end: date | None
    evidence_highlights: tuple[Highlight, ...]
    material_signature: str


@dataclass(frozen=True)
class RegistryRow:
    """One stored finding. Status is a lifecycle value, never a diff label or resolved."""

    id: str | None
    user_id: str
    fingerprint: str
    identity_key: str
    leak_type: str
    detector_version: str
    account_id: str | None
    status: str
    material_signature: str
    signature_generation: int
    finding_focus: str | None
    root_cause_type: str
    analysis_status: str
    persistence: str
    detected_amount: Decimal
    impact_kind: str
    impact_label: str | None
    period_start: date | None
    period_end: date | None
    evidence_highlights: tuple[Highlight, ...]
    first_detected_at: datetime
    last_seen_at: datetime
    last_absent_at: datetime | None
    last_statement_import_id: str | None


@dataclass(frozen=True)
class PlannedChange:
    classification: str
    row: RegistryRow
    write: bool


@dataclass(frozen=True)
class RegistryPlan:
    items: tuple[PlannedChange, ...]

    @property
    def writes(self) -> tuple[RegistryRow, ...]:
        return tuple(item.row for item in self.items if item.write)


def finding_identity_key(user_id: str, leak_type: str, subject: str) -> str:
    """Identity that stays put when only the detector version changes."""
    value = "|".join((user_id, leak_type, subject_key(subject)))
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def impact_band(amount: Decimal) -> str:
    """Coarse band so cents of movement do not count as a new issue."""
    for limit, label in _BANDS:
        if amount < limit:
            return label
    return "5000_or_more"


def material_parts(leak: LeakDetection, finding: ReportFinding) -> dict[str, object]:
    """Facts that justify another look. Confidence is intentionally absent."""
    evidence = leak.evidence
    parts: dict[str, object] = {
        "leak_type": leak.leak_type,
        "root_cause_type": finding.root_cause_type,
        "finding_focus": _focus(evidence.get("finding_focus")),
        "severity": leak.severity,
        "impact_band": impact_band(finding.impact.detected_amount),
        "impact_kind": finding.impact.impact_kind,
    }
    if leak.leak_type in {"duplicate_payment_leak", "duplicate_debit_order_leak"}:
        parts["duplicate_merchant"] = subject_for_leak(leak)
        parts["duplicate_amount"] = _money(evidence.get("candidate_amount"))
        parts["duplicate_observed_date"] = _day(evidence.get("observed_date"))
    if leak.leak_type in _RECURRING:
        average = evidence.get("average_amount") or evidence.get("average_payment")
        amount = _decimal(average)
        if amount is None:
            amount = finding.impact.detected_amount
        parts["recurring_amount_band"] = impact_band(amount)
        parts["recurring_last_observed"] = _day(evidence.get("last_observed_date"))
    if leak.leak_type in _FEE_OR_SPENDING:
        parts["totals"] = _money_fields(evidence, _FEE_TOTAL_KEYS)
        parts["completed_month_count"] = _first_count(evidence, _COUNT_KEYS)
        parts["period_start"] = _day(leak.period_start)
        parts["period_end"] = _day(leak.period_end)
    return parts


def material_signature(leak: LeakDetection, finding: ReportFinding) -> str:
    encoded = json.dumps(
        material_parts(leak, finding),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:32]


def subject_for_leak(leak: LeakDetection) -> str:
    """Recover the detector subject without reading the versioned fingerprint."""
    if leak.leak_type == "bank_fee_leak":
        return "bank-fees"
    if leak.leak_type == "spending_escalation_leak":
        return "aggregate-spending"
    if leak.leak_type == "cash_usage_leak":
        return "cash-withdrawals"
    if leak.leak_type in _CATEGORY:
        category = leak.evidence.get("category_name") or leak.evidence.get("category")
        if isinstance(category, str) and category.strip():
            return subject_key(category)
    if leak.leak_type in _RECURRING or leak.leak_type in {
        "duplicate_payment_leak",
        "duplicate_debit_order_leak",
        "coffee_spending_leak",
        "convenience_store_leak",
    }:
        merchant = leak.evidence.get("merchant_key")
        if isinstance(merchant, str) and merchant.strip():
            return subject_key(merchant)
        if leak.leak_type == "duplicate_streaming_leak":
            subcat = leak.evidence.get("streaming_subcategory")
            if isinstance(subcat, str) and subcat.strip():
                return f"streaming-overlap-{subject_key(subcat)}"
        for reference in leak.supporting_feature_references:
            if not isinstance(reference, str):
                continue
            match = _MERCHANT_REF.search(reference)
            if match:
                return subject_key(match.group(1))
    if leak.leak_type in {"duplicate_payment_leak", "duplicate_debit_order_leak"}:
        # Fallback only when no merchant grouping key was available.
        return f"fingerprint-{leak.fingerprint}"
    focus = _focus(leak.evidence.get("finding_focus"))
    if focus:
        return focus
    return f"fingerprint-{leak.fingerprint}"


def sanitise_highlights(finding: ReportFinding) -> tuple[Highlight, ...]:
    """Keep the report's scalar highlights. Drop descriptions and long numbers."""
    cleaned: list[Highlight] = []
    for highlight in finding.evidence_highlights:
        key = highlight.key.strip().lower()
        label = highlight.label.strip()
        if (
            not key
            or key in _FORBIDDEN_HIGHLIGHT_KEYS
            or _LONG_DIGITS.search(key)
            or _LONG_DIGITS.search(label)
        ):
            continue
        value = _highlight_value(highlight.value)
        if value is None:
            continue
        cleaned.append((key[:80], label[:120], value))
        if len(cleaned) == 40:
            break
    return tuple(cleaned)


def build_observation(
    *,
    user_id: str,
    leak: LeakDetection,
    finding: ReportFinding,
) -> RegistryObservation:
    if leak.leak_id != leak.fingerprint or finding.leak_id != leak.leak_id:
        raise RegistryCompositionError("Finding identity does not match the leak.")
    if finding.leak_type != leak.leak_type:
        raise RegistryCompositionError("Finding type does not match the leak.")
    amount = finding.impact.detected_amount
    if amount < 0:
        raise RegistryCompositionError("Detected amount cannot be negative.")
    return RegistryObservation(
        user_id=user_id,
        fingerprint=leak.fingerprint,
        identity_key=finding_identity_key(
            user_id,
            leak.leak_type,
            subject_for_leak(leak),
        ),
        leak_type=leak.leak_type,
        detector_version=leak.detector_version,
        finding_focus=_focus(leak.evidence.get("finding_focus")),
        root_cause_type=finding.root_cause_type,
        analysis_status=finding.analysis_status,
        persistence=finding.persistence,
        detected_amount=amount.quantize(Decimal("0.01")),
        impact_kind=finding.impact.impact_kind,
        impact_label=finding.impact.impact_label,
        period_start=leak.period_start,
        period_end=leak.period_end,
        evidence_highlights=sanitise_highlights(finding),
        material_signature=material_signature(leak, finding),
    )


def observations_from_run(
    user_id: str,
    report: FinancialIntelligenceReport,
    leaks: LeakDetectionResult,
) -> tuple[RegistryObservation, ...]:
    """Pair the report with the leaks from the same pipeline run."""
    if leaks.user_id != user_id:
        raise RegistryScopeError("Leaks belong to a different user.")
    if leaks.detector_version != report.versions.detector_version:
        raise RegistryCompositionError("Detector version does not match the report.")
    by_id = {leak.leak_id: leak for leak in leaks.leaks}
    if len(by_id) != len(leaks.leaks):
        raise RegistryCompositionError("Leak identifiers are not unique.")
    finding_ids = {finding.leak_id for finding in report.findings}
    if finding_ids != set(by_id):
        raise RegistryCompositionError("Report findings do not match the leaks.")
    observations = tuple(
        build_observation(user_id=user_id, leak=by_id[finding.leak_id], finding=finding)
        for finding in report.findings
    )
    identities = [item.identity_key for item in observations]
    if len(identities) != len(set(identities)):
        raise RegistryCompositionError("Two findings share one registry identity.")
    for leak in leaks.leaks:
        if leak.detector_version != report.versions.detector_version:
            raise RegistryCompositionError("A leak uses a different detector version.")
    return observations


def plan_registry_changes(
    *,
    user_id: str,
    existing: Sequence[RegistryRow],
    observations: Sequence[RegistryObservation],
    statement_import_id: str,
    observed_at: datetime,
    account_id: str | None = None,
) -> RegistryPlan:
    """Classify the run. Increment generation only when the signature changes."""
    _require_scope(user_id, existing, observations)
    if observed_at.tzinfo is None or observed_at.utcoffset() is None:
        raise RegistryCompositionError("observed_at must be timezone-aware.")
    by_identity = {row.identity_key: row for row in existing}
    if len(by_identity) != len(existing):
        raise RegistryCompositionError("Stored identities are not unique.")
    seen: set[str] = set()
    items: list[PlannedChange] = []
    for observation in observations:
        if observation.identity_key in seen:
            raise RegistryCompositionError("Two findings share one registry identity.")
        seen.add(observation.identity_key)
        items.append(
            _present_change(
                existing=by_identity.get(observation.identity_key),
                observation=observation,
                statement_import_id=statement_import_id,
                account_id=account_id,
                observed_at=observed_at,
            )
        )
    for row in existing:
        if row.identity_key in seen:
            continue
        items.append(
            _absent_change(
                existing=row,
                statement_import_id=statement_import_id,
                observed_at=observed_at,
            )
        )
    return RegistryPlan(items=tuple(items))


def _present_change(
    *,
    existing: RegistryRow | None,
    observation: RegistryObservation,
    statement_import_id: str,
    account_id: str | None,
    observed_at: datetime,
) -> PlannedChange:
    if existing is not None and _same_import_replay(existing, observation, statement_import_id):
        return PlannedChange(classification="unchanged", row=existing, write=False)
    if existing is None:
        classification = "new"
        generation = 1
        first_detected_at = observed_at
    elif existing.material_signature == observation.material_signature:
        classification = "unchanged"
        generation = existing.signature_generation
        first_detected_at = existing.first_detected_at
    else:
        classification = "materially_changed"
        generation = existing.signature_generation + 1
        first_detected_at = existing.first_detected_at
    row = RegistryRow(
        id=None if existing is None else existing.id,
        user_id=observation.user_id,
        fingerprint=observation.fingerprint,
        identity_key=observation.identity_key,
        leak_type=observation.leak_type,
        detector_version=observation.detector_version,
        account_id=account_id if account_id is not None or existing is None else existing.account_id,
        status=_stored_status(existing),
        material_signature=observation.material_signature,
        signature_generation=generation,
        finding_focus=observation.finding_focus,
        root_cause_type=observation.root_cause_type,
        analysis_status=observation.analysis_status,
        persistence=observation.persistence,
        detected_amount=observation.detected_amount,
        impact_kind=observation.impact_kind,
        impact_label=observation.impact_label,
        period_start=observation.period_start,
        period_end=observation.period_end,
        evidence_highlights=observation.evidence_highlights,
        first_detected_at=first_detected_at,
        last_seen_at=observed_at,
        last_absent_at=None if existing is None else existing.last_absent_at,
        last_statement_import_id=statement_import_id,
    )
    return PlannedChange(classification=classification, row=row, write=True)


def _same_import_replay(
    existing: RegistryRow,
    observation: RegistryObservation,
    statement_import_id: str,
) -> bool:
    """The same processed import and the same material facts are already stored."""
    return (
        existing.last_statement_import_id == statement_import_id
        and existing.material_signature == observation.material_signature
        and existing.fingerprint == observation.fingerprint
        and existing.detector_version == observation.detector_version
        and existing.evidence_highlights == observation.evidence_highlights
        and existing.detected_amount == observation.detected_amount
        and existing.finding_focus == observation.finding_focus
        and existing.root_cause_type == observation.root_cause_type
        and existing.analysis_status == observation.analysis_status
        and existing.persistence == observation.persistence
        and existing.impact_kind == observation.impact_kind
        and existing.impact_label == observation.impact_label
        and existing.period_start == observation.period_start
        and existing.period_end == observation.period_end
    )


def _stored_status(existing: RegistryRow | None) -> str:
    """Presence keeps a lifecycle status. Diff labels are not stored as status."""
    if existing is None or existing.status == "not_observed":
        return "open"
    if existing.status in {"open", "explained", "action_recorded", "monitoring", "dismissed"}:
        return existing.status
    return "open"


def _absent_change(
    *,
    existing: RegistryRow,
    statement_import_id: str,
    observed_at: datetime,
) -> PlannedChange:
    """Remember that this run did not see the finding. Do not resolve it."""
    already = (
        existing.status == "not_observed"
        and existing.last_statement_import_id == statement_import_id
    )
    if already:
        return PlannedChange(classification="not_observed", row=existing, write=False)
    row = RegistryRow(
        id=existing.id,
        user_id=existing.user_id,
        fingerprint=existing.fingerprint,
        identity_key=existing.identity_key,
        leak_type=existing.leak_type,
        detector_version=existing.detector_version,
        account_id=existing.account_id,
        status="not_observed",
        material_signature=existing.material_signature,
        signature_generation=existing.signature_generation,
        finding_focus=existing.finding_focus,
        root_cause_type=existing.root_cause_type,
        analysis_status=existing.analysis_status,
        persistence=existing.persistence,
        detected_amount=existing.detected_amount,
        impact_kind=existing.impact_kind,
        impact_label=existing.impact_label,
        period_start=existing.period_start,
        period_end=existing.period_end,
        evidence_highlights=existing.evidence_highlights,
        first_detected_at=existing.first_detected_at,
        last_seen_at=existing.last_seen_at,
        last_absent_at=observed_at,
        last_statement_import_id=statement_import_id,
    )
    return PlannedChange(classification="not_observed", row=row, write=True)


def _require_scope(
    user_id: str,
    existing: Sequence[RegistryRow],
    observations: Sequence[RegistryObservation],
) -> None:
    if any(row.user_id != user_id for row in existing):
        raise RegistryScopeError("Registry rows belong to a different user.")
    if any(item.user_id != user_id for item in observations):
        raise RegistryScopeError("Findings belong to a different user.")


def _focus(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    if _FOCUS.fullmatch(cleaned):
        return cleaned
    return None


def _day(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and _DATE.fullmatch(value.strip()):
        return value.strip()
    return None


def _decimal(value: object) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, Decimal):
        parsed = value
    elif isinstance(value, int):
        parsed = Decimal(value)
    elif isinstance(value, str):
        try:
            parsed = Decimal(value.strip())
        except InvalidOperation:
            return None
    else:
        return None
    if not parsed.is_finite() or parsed < 0:
        return None
    return parsed


def _money(value: object) -> str | None:
    parsed = _decimal(value)
    if parsed is None:
        return None
    return format(parsed.quantize(Decimal("0.01")), "f")


def _money_fields(evidence: Mapping[str, object], keys: Sequence[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    for key in keys:
        money = _money(evidence.get(key))
        if money is not None:
            found[key] = money
    return found


def _first_count(evidence: Mapping[str, object], keys: Sequence[str]) -> int | None:
    for key in keys:
        count = _count(evidence.get(key))
        if count is not None:
            return count
    return None


def _count(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    parsed = _decimal(value)
    if parsed is None or parsed != parsed.to_integral_value():
        return None
    return int(parsed)


def _highlight_value(value: object) -> str | int | bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if _LONG_DIGITS.search(str(value)):
            return None
        return value
    if isinstance(value, Decimal):
        money = _money(value)
        if money is None or _LONG_DIGITS.search(money):
            return None
        return money
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned or _LONG_DIGITS.search(cleaned) or len(cleaned) > 200:
            return None
        return cleaned
    return None
