"""Deterministic, conservative potential financial leak detection."""

from __future__ import annotations

from calendar import monthrange
from datetime import datetime, time, timezone
from decimal import Decimal

from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .leak_keys import leak_fingerprint, subject_key
from .leak_models import LeakDetection, LeakDetectionResult, LeakType
from .leak_scoring import leak_confidence, severity_for_impact, support_ratio
from .models import FinancialFeatureSnapshot, MerchantFeature
from .service import FOOD_CATEGORIES, TRANSPORT_CATEGORIES

DETECTOR_VERSION = "1.0"
MIN_HISTORY_DAYS = 28
MIN_IMPACT = Decimal("10")


def detect_leaks(
    snapshot: FinancialFeatureSnapshot,
    behaviours: BehaviourAnalysisResult,
) -> LeakDetectionResult:
    """Return deduplicated potential leaks from one user's established evidence."""
    if not _has_minimum_history(snapshot):
        return _result(snapshot, [])
    observations = {item.behavior_type: [] for item in behaviours.observations}
    for observation in behaviours.observations:
        observations.setdefault(observation.behavior_type, []).append(observation)

    findings = [
        *_bank_fee_leaks(snapshot, observations),
        *_recurring_leaks(snapshot, observations),
        *_spending_escalation_leaks(snapshot, observations),
        *_category_leaks(snapshot, observations),
        *_cash_leaks(snapshot, observations),
        *_duplicate_leaks(snapshot, observations),
    ]
    deduplicated = {finding.fingerprint: finding for finding in findings}
    return _result(snapshot, sorted(deduplicated.values(), key=lambda item: (-item.confidence, item.leak_id)))


def _result(
    snapshot: FinancialFeatureSnapshot, leaks: list[LeakDetection]
) -> LeakDetectionResult:
    return LeakDetectionResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        detector_version=DETECTOR_VERSION,
        leaks=leaks,
    )


def _has_minimum_history(snapshot: FinancialFeatureSnapshot) -> bool:
    return (
        snapshot.transaction_count >= 3
        and snapshot.date_start is not None
        and snapshot.date_end is not None
        and (snapshot.date_end - snapshot.date_start).days >= MIN_HISTORY_DAYS
    )


def _bank_fee_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    fees = snapshot.fees
    monthly_average = _completed_month_average(
        snapshot, lambda month: month.bank_fee_total
    )
    fee_observations = observations.get("fee_accumulation", [])
    ratio = snapshot.spending_profile.bank_fee_ratio or Decimal("0")
    if (
        fees.bank_fee_transaction_count < 2
        or monthly_average is None
        or monthly_average < MIN_IMPACT
        or not (fee_observations or (monthly_average >= Decimal("100") and ratio >= Decimal("0.02")))
    ):
        return []
    change = _decimal_evidence(fee_observations, "change_amount") or Decimal("0")
    impact = change if change >= MIN_IMPACT else monthly_average
    confidence = leak_confidence(
        support=None,
        observation_count=fees.bank_fee_transaction_count,
        pattern_strength=Decimal("0.82") if fee_observations else Decimal("0.68"),
        ceiling=Decimal("0.82"),
    )
    if confidence is None:
        return []
    return [
        _leak(
            snapshot=snapshot,
            leak_type="bank_fee_leak",
            subject="bank-fees",
            title="Potential recurring banking fee burden",
            description="Repeated banking fees show a material ongoing cost pattern.",
            monthly_impact=impact,
            annual_impact=impact * Decimal("12"),
            impact_kind="recurring",
            confidence=confidence,
            severity=severity_for_impact(impact, persistent=True, confidence=confidence),
            evidence={
                "monthly_average_fee": monthly_average,
                "bank_fee_transaction_count": fees.bank_fee_transaction_count,
                "bank_fee_ratio": ratio,
                "fee_change_amount": change if change > 0 else None,
            },
            behaviour_ids=_observation_ids(fee_observations),
            feature_refs=["fees", "months[].bank_fee_total", "spending_profile.bank_fee_ratio"],
        )
    ]


def _recurring_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    findings = []
    recurring_observations = observations.get("recurring_payment_pattern", [])
    duplicate_merchants = {
        observation.evidence.get("merchant_key")
        for observation in observations.get("duplicate_payment_pattern", [])
    }
    for merchant in snapshot.merchants:
        recurrence = merchant.recurrence
        if (
            recurrence.recurrence_strength not in {"medium", "high"}
            or recurrence.observation_count < 3
            or support_ratio(merchant.confidence_support) < Decimal("0.60")
            or merchant.merchant_name in duplicate_merchants
        ):
            continue
        impact = _recurring_monthly_impact(merchant)
        if impact is None or impact < MIN_IMPACT:
            continue
        categories = merchant.merchant_category_transaction_count
        is_subscription = categories.get("Subscriptions", 0) > 0
        is_unknown = not categories or set(categories).issubset({"Other"})
        if is_subscription:
            leak_type: LeakType = "subscription_leak"
            title = f"Potential ongoing subscription payment at {merchant.merchant_name}"
            description = "A stable recurring subscription payment may represent an ongoing financial commitment."
            ceiling = Decimal("0.90") if recurrence.recurrence_strength == "high" else Decimal("0.78")
        elif is_unknown:
            leak_type = "unknown_recurring_payment"
            title = "Potential recurring payment from an unidentified merchant"
            description = "A stable recurring payment was observed, but its category could not be identified confidently."
            ceiling = Decimal("0.70")
        else:
            leak_type = "recurring_payment_leak"
            title = f"Potential ongoing recurring payment at {merchant.merchant_name}"
            description = "A stable recurring payment may represent an ongoing financial commitment."
            ceiling = Decimal("0.85") if recurrence.recurrence_strength == "high" else Decimal("0.72")
        confidence = leak_confidence(
            support=merchant.confidence_support,
            observation_count=recurrence.observation_count,
            pattern_strength=Decimal("1") if recurrence.recurrence_strength == "high" else Decimal("0.75"),
            ceiling=ceiling,
        )
        if confidence is None:
            continue
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                subject=merchant.merchant_name,
                title=title,
                description=description,
                monthly_impact=impact,
                annual_impact=impact * Decimal("12"),
                impact_kind="recurring",
                confidence=confidence,
                severity=severity_for_impact(impact, persistent=True, confidence=confidence),
                evidence={
                    "merchant_key": merchant.merchant_name if not is_unknown else None,
                    "observation_count": recurrence.observation_count,
                    "average_interval_days": recurrence.average_interval_days,
                    "average_amount": recurrence.average_amount,
                    "recurrence_strength": recurrence.recurrence_strength,
                    "classification_support_ratio": support_ratio(merchant.confidence_support),
                },
                behaviour_ids=_matching_observation_ids(
                    recurring_observations, merchant.merchant_name
                ),
                feature_refs=[
                    f"merchants[{merchant.merchant_name}].recurrence",
                    f"merchants[{merchant.merchant_name}].confidence_support",
                ],
            )
        )
    return findings


def _spending_escalation_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    findings = []
    overall_support = _snapshot_support_ratio(snapshot)
    if overall_support < Decimal("0.60"):
        return findings
    for observation in observations.get("spending_increase", []):
        change = _decimal(observation.evidence.get("change_amount"))
        if change is None or change < MIN_IMPACT:
            continue
        confidence = min(observation.confidence, 0.80)
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="spending_escalation_leak",
                subject="aggregate-spending",
                title="Potential spending escalation",
                description="Overall spending increased materially above the previous observed baseline.",
                monthly_impact=change,
                annual_impact=change * Decimal("12"),
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(change, persistent=True, confidence=confidence),
                evidence=_escalation_evidence(observation),
                behaviour_ids=[observation.observation_id],
                feature_refs=observation.supporting_features,
            )
        )
    return findings


def _category_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    by_category = {feature.category_name: feature for feature in snapshot.categories}
    findings = []
    for observation in observations.get("category_growth", []):
        category = observation.evidence.get("subject")
        if not isinstance(category, str):
            continue
        feature = by_category.get(category)
        change = _decimal(observation.evidence.get("change_amount"))
        if (
            feature is None
            or change is None
            or change < MIN_IMPACT
            or support_ratio(feature.confidence_support) < Decimal("0.60")
        ):
            continue
        leak_type, title, description, minimum_transactions = _category_leak_definition(category)
        if leak_type is None or feature.category_transaction_count < minimum_transactions:
            continue
        if leak_type == "airtime_data_leak" and (
            feature.category_transaction_count < 5
            or feature.category_total_amount < Decimal("150")
        ):
            continue
        if leak_type in {"food_spending_leak", "transport_spending_leak"} and (
            snapshot.spending_profile.total_spending or Decimal("0")
        ) < Decimal("2000"):
            continue
        confidence = min(observation.confidence, 0.78)
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                subject=category,
                title=title,
                description=description,
                monthly_impact=change,
                annual_impact=change * Decimal("12"),
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(change, persistent=True, confidence=confidence),
                evidence={
                    **_escalation_evidence(observation),
                    "category_name": category,
                    "category_transaction_count": feature.category_transaction_count,
                    "classification_support_ratio": support_ratio(feature.confidence_support),
                },
                behaviour_ids=[observation.observation_id],
                feature_refs=observation.supporting_features,
            )
        )
    return findings


def _category_leak_definition(
    category: str,
) -> tuple[LeakType | None, str, str, int]:
    if category == "Airtime & Data":
        return (
            "airtime_data_leak",
            "Potential airtime and data spending escalation",
            "Airtime and data spending increased materially with repeated purchase activity.",
            5,
        )
    if category in FOOD_CATEGORIES - {"Groceries"}:
        return (
            "food_spending_leak",
            "Potential convenience food spending escalation",
            "Convenience food spending increased materially above the previous observed baseline.",
            3,
        )
    if category in TRANSPORT_CATEGORIES:
        return (
            "transport_spending_leak",
            "Potential transport spending escalation",
            "Transport spending increased materially above the previous observed baseline.",
            4,
        )
    return None, "", "", 0


def _snapshot_support_ratio(snapshot: FinancialFeatureSnapshot) -> Decimal:
    total = sum(
        feature.confidence_support.supporting_transaction_count
        for feature in snapshot.categories
    )
    high = sum(
        feature.confidence_support.high_confidence_transaction_count
        for feature in snapshot.categories
    )
    return Decimal(high) / Decimal(total) if total else Decimal("0")


def _cash_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    cash = snapshot.cash
    if cash.cash_withdrawal_count < 3 or cash.atm_fee_total < MIN_IMPACT:
        return []
    cash_observations = observations.get("cash_dependency", [])
    if not cash_observations:
        return []
    months = max(1, len(_completed_months(snapshot)))
    impact = cash.atm_fee_total / Decimal(months)
    confidence = leak_confidence(
        support=None,
        observation_count=cash.cash_withdrawal_count,
        pattern_strength=Decimal("0.75"),
        ceiling=Decimal("0.75"),
    )
    if confidence is None:
        return []
    return [
        _leak(
            snapshot=snapshot,
            leak_type="cash_usage_leak",
            subject="cash-withdrawals",
            title="Potential ATM fee cost from repeated cash withdrawals",
            description="Repeated cash withdrawals were accompanied by identifiable ATM fee costs.",
            monthly_impact=impact,
            annual_impact=impact * Decimal("12"),
            impact_kind="recurring",
            confidence=confidence,
            severity=severity_for_impact(impact, persistent=True, confidence=confidence),
            evidence={
                "cash_withdrawal_count": cash.cash_withdrawal_count,
                "cash_withdrawal_total": cash.cash_withdrawal_total,
                "atm_fee_total": cash.atm_fee_total,
                "completed_month_count": months,
            },
            behaviour_ids=_observation_ids(cash_observations),
            feature_refs=["cash", "fees.atm_fee_total"],
        )
    ]


def _duplicate_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    findings = []
    observation_ids = _observation_ids(observations.get("duplicate_payment_pattern", []))
    for candidate in snapshot.duplicate_candidates:
        dates = candidate.transaction_dates
        if len(dates) < 2 or (max(dates) - min(dates)).days != 0 or candidate.amount < Decimal("20"):
            continue
        impact = candidate.amount * Decimal(len(dates) - 1)
        confidence = leak_confidence(
            support=None,
            observation_count=len(dates),
            pattern_strength=Decimal("0.65"),
            ceiling=Decimal("0.68"),
        )
        if confidence is None:
            continue
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="duplicate_payment_leak",
                subject=candidate.merchant_name,
                title="Potential duplicate payment requires verification",
                description="Same-day transactions with the same merchant and amount were grouped as a potential duplicate.",
                monthly_impact=impact,
                annual_impact=None,
                impact_kind="one_time",
                confidence=confidence,
                severity=severity_for_impact(impact, persistent=False, confidence=confidence),
                evidence={
                    "merchant_key": candidate.merchant_name,
                    "candidate_amount": candidate.amount,
                    "transaction_count_in_group": len(dates),
                    "date_span_days": 0,
                    "verification_required": True,
                },
                behaviour_ids=observation_ids,
                feature_refs=["duplicate_candidates"],
            )
        )
    return findings


def _leak(
    *,
    snapshot: FinancialFeatureSnapshot,
    leak_type: LeakType,
    subject: str,
    title: str,
    description: str,
    monthly_impact: Decimal,
    annual_impact: Decimal | None,
    impact_kind: str,
    confidence: float,
    severity: str,
    evidence: dict,
    behaviour_ids: list[str],
    feature_refs: list[str],
) -> LeakDetection:
    fingerprint = leak_fingerprint(
        user_id=snapshot.user_id,
        leak_type=leak_type,
        subject_key=subject_key(subject),
        detector_version=DETECTOR_VERSION,
    )
    detected_at = datetime.combine(
        snapshot.date_end or snapshot.date_start,
        time.min,
        tzinfo=timezone.utc,
    )
    return LeakDetection(
        leak_id=fingerprint,
        fingerprint=fingerprint,
        leak_type=leak_type,
        title=title,
        description=description,
        severity=severity,  # type: ignore[arg-type]
        confidence=confidence,
        estimated_monthly_impact=monthly_impact,
        estimated_annual_impact=annual_impact,
        impact_kind=impact_kind,  # type: ignore[arg-type]
        evidence=evidence,
        supporting_behavior_ids=behaviour_ids,
        supporting_feature_references=feature_refs,
        detector_version=DETECTOR_VERSION,
        detected_at=detected_at,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
    )


def _completed_months(snapshot: FinancialFeatureSnapshot):
    months = list(snapshot.months)
    if not months or snapshot.date_end is None:
        return months
    last_day = monthrange(snapshot.date_end.year, snapshot.date_end.month)[1]
    if months[-1].month == snapshot.date_end.strftime("%Y-%m") and snapshot.date_end.day < last_day:
        return months[:-1]
    return months


def _completed_month_average(snapshot: FinancialFeatureSnapshot, selector):
    months = _completed_months(snapshot)
    if not months:
        return None
    return sum((selector(month) for month in months), Decimal("0")) / Decimal(len(months))


def _recurring_monthly_impact(merchant: MerchantFeature) -> Decimal | None:
    interval = merchant.recurrence.average_interval_days
    amount = merchant.recurrence.average_amount
    if interval in (None, Decimal("0")) or amount is None:
        return None
    return amount * Decimal("30") / interval


def _observation_ids(observations: list[BehaviourObservation]) -> list[str]:
    return [observation.observation_id for observation in observations]


def _matching_observation_ids(
    observations: list[BehaviourObservation], merchant: str
) -> list[str]:
    return [
        observation.observation_id
        for observation in observations
        if observation.evidence.get("merchant_key") == merchant
    ]


def _decimal_evidence(
    observations: list[BehaviourObservation], key: str
) -> Decimal | None:
    for observation in observations:
        value = _decimal(observation.evidence.get(key))
        if value is not None:
            return value
    return None


def _decimal(value: object) -> Decimal | None:
    try:
        return Decimal(str(value)) if value is not None else None
    except Exception:
        return None


def _escalation_evidence(observation: BehaviourObservation) -> dict:
    keys = (
        "previous_period",
        "current_period",
        "previous_amount",
        "current_amount",
        "change_amount",
        "change_percentage",
        "transaction_count_previous",
        "transaction_count_current",
        "months_compared",
    )
    return {
        key: observation.evidence[key]
        for key in keys
        if key in observation.evidence
    } | {"behaviour_confidence": observation.confidence}
