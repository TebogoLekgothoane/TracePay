"""Deterministic, conservative potential financial leak detection."""

from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal
import re

from .behaviour_engine import (
    MIN_FEE_BURDEN_TOTAL,
    MIN_RELATIVE_CHANGE_PERCENT,
    MIN_TREND_MONTHS,
    _coverage_bounds,
    _period_compare,
    is_repeated_shopping_merchant,
    is_weak_recurring_commitment,
)
from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .leak_keys import leak_fingerprint, subject_key
from .leak_models import LeakDetection, LeakDetectionResult, LeakType
from .leak_scoring import leak_confidence, severity_for_impact, support_ratio
from .merchant_display import (
    debit_order_leak_title,
    duplicate_leak_title,
    format_zar,
    is_reliable_merchant_display_name,
    merchant_display_name_for,
    recurring_leak_title,
    repeated_payments_title,
    spending_increase_title,
)
from .engine import RECURRENCE_MIN_OBSERVATIONS
from .models import (
    CashFeatures,
    ConfidenceSupport,
    FeeFeatures,
    FinancialFeatureSnapshot,
    MerchantFeature,
)
from .periods import completed_months
from .recurrence_rules import matches_plausible_recurring_interval
from .service import CONVENIENCE_FOOD_CATEGORIES, TRANSPORT_CATEGORIES

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
        *_duplicate_streaming_leaks(snapshot, observations),
        *_inactive_recurring_leaks(snapshot),
        *_irregular_transaction_leaks(snapshot),
        *_spending_escalation_leaks(snapshot, observations),
        *_category_leaks(snapshot, observations),
        *_coffee_spending_leaks(snapshot, observations),
        *_convenience_store_leaks(snapshot, observations),
        *_weekend_spending_leaks(snapshot, observations),
        *_payday_spending_leaks(snapshot, observations),
        *_cash_leaks(snapshot, observations),
        *_duplicate_leaks(snapshot, observations),
        *_duplicate_debit_order_leaks(snapshot, observations),
    ]
    deduplicated = {finding.fingerprint: finding for finding in findings}
    return _result(snapshot, sorted(deduplicated.values(), key=lambda item: (-item.confidence, item.leak_id)))


def _inactive_recurring_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Report a missed expected charge as a review cue, never as cancellation/resolution."""
    if snapshot.date_end is None:
        return []
    findings: list[LeakDetection] = []
    for merchant in snapshot.merchants:
        recurrence = merchant.recurrence
        interval = recurrence.median_interval_days or recurrence.average_interval_days
        amount = recurrence.average_amount
        last_date = merchant.merchant_last_transaction_date
        if (
            recurrence.recurrence_strength not in {"medium", "high"}
            or recurrence.observation_count < 3
            or interval is None
            or amount is None
            or last_date is None
            or not matches_plausible_recurring_interval(interval)
            or not is_reliable_merchant_display_name(merchant.merchant_name)
        ):
            continue
        days_since = (snapshot.date_end - last_date).days
        if days_since <= max(30, int(interval * Decimal("1.6"))):
            continue
        monthly = amount * Decimal("30") / interval
        confidence = leak_confidence(
            support=merchant.confidence_support,
            observation_count=recurrence.observation_count,
            pattern_strength=Decimal("0.72"),
            ceiling=Decimal("0.78"),
        )
        if confidence is None:
            continue
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="inactive_recurring_payment_leak",
                subject=merchant.merchant_name,
                title=f"Inactive recurring payment at {merchant.merchant_name}",
                description=(
                    "A previously regular payment has not appeared within its expected "
                    "billing window. This may be delayed, cancelled, or missing from the "
                    "available statement history and requires confirmation."
                ),
                monthly_impact=monthly,
                annual_impact=monthly * Decimal("12"),
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(monthly, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "missing_expected_recurring_payment",
                    "merchant_key": merchant.merchant_name,
                    "last_observed_date": last_date,
                    "expected_interval_days": interval,
                    "days_since_last_observed": days_since,
                    "observation_count": recurrence.observation_count,
                    "status_basis": "potential",
                    "verification_required": True,
                    "not_proof_of_cancellation": True,
                },
                behaviour_ids=[],
                feature_refs=["merchants[].recurrence", "merchants[].merchant_last_transaction_date"],
            )
        )
    return findings


def _irregular_transaction_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    findings: list[LeakDetection] = []
    for candidate in snapshot.irregular_candidates:
        if candidate.amount_multiple_of_category_median is None:
            continue
        confidence = leak_confidence(
            support=None,
            observation_count=candidate.baseline_sample_size,
            pattern_strength=Decimal("0.60"),
            ceiling=Decimal("0.70"),
        )
        if confidence is None:
            continue
        merchant_display = merchant_display_name_for(candidate.merchant_name)
        merchant = merchant_display or "Unknown merchant"
        safe_description = _safe_transaction_description(candidate.transaction_description)
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="irregular_transaction_leak",
                subject=candidate.transaction_id,
                title=f"Unusual transaction at {merchant}",
                description=(
                    "This transaction is unusually large for its category. It may be a "
                    "legitimate one-off purchase; it is not evidence of fraud."
                ),
                monthly_impact=candidate.amount,
                annual_impact=None,
                impact_kind="one_time",
                confidence=confidence,
                severity=severity_for_impact(candidate.amount, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "unusual_transaction",
                    "transaction_id": candidate.transaction_id,
                    "merchant_key": candidate.merchant_name,
                    "merchant_display_name": merchant_display,
                    "transaction_amount": candidate.amount,
                    "original_description": safe_description,
                    "category_name": candidate.category_name,
                    "transaction_type": candidate.transaction_type,
                    "transaction_date": candidate.transaction_date,
                    "transaction_time": candidate.transaction_time,
                    "category_transaction_count": candidate.category_transaction_count,
                    "baseline_sample_size": candidate.baseline_sample_size,
                    "category_median_amount": candidate.category_median_amount,
                    "difference_from_baseline": candidate.difference_from_baseline,
                    "amount_multiple_of_category_median": candidate.amount_multiple_of_category_median,
                    "outlier_rule": "At least 3 eligible baseline transactions; flagged amount is at least 3x the category median and at least R500.",
                    "confidence_basis": "uncalibrated_heuristic_outlier_score",
                    "confidence_is_calibrated": False,
                    "verification_required": True,
                    "not_proof_of_fraud": True,
                },
                behaviour_ids=[],
                feature_refs=["irregular_candidates"],
            )
        )
    return findings


_LONG_DIGITS = re.compile(r"\b\d{6,}\b")


def _safe_transaction_description(description: str) -> str | None:
    cleaned = " ".join(description.split())[:500]
    if not cleaned:
        return None
    return _LONG_DIGITS.sub("[REDACTED]", cleaned)


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
    eligible_fee_totals = _eligible_non_account_fee_pool(fees, fee_observations)
    immediate = fees.immediate_payment_fee_total or Decimal("0")
    immediate_burden = (
        immediate >= MIN_IMPACT
        and immediate in eligible_fee_totals
        and bool(fee_observations)
    )
    enquiry = fees.balance_enquiry_fee_total or Decimal("0")
    balance_enquiry_burden = (
        enquiry >= MIN_IMPACT
        and enquiry in eligible_fee_totals
        and bool(fee_observations)
    )
    sms = fees.sms_fee_total or Decimal("0")
    sms_banking_burden = (
        sms >= MIN_IMPACT
        and sms in eligible_fee_totals
        and bool(fee_observations)
    )
    foreign_burden = _foreign_transaction_fee_burden(snapshot, fees, fee_observations)
    interest_burden = _interest_charge_burden(fees, fee_observations)
    overdraft_burden = _overdraft_fee_burden(fees, fee_observations)
    insufficient_funds_burden = _insufficient_funds_fee_burden(fees, fee_observations)
    typed_burden = (
        immediate_burden
        or balance_enquiry_burden
        or sms_banking_burden
        or foreign_burden
        or interest_burden
        or overdraft_burden
        or insufficient_funds_burden
    )
    change = _decimal_evidence(fee_observations, "change_amount") or Decimal("0")
    monthly_fee_trend = (
        not typed_burden
        and fee_observations
        and change >= MIN_IMPACT
        and _bool_evidence(fee_observations, "overall_monthly_fee_trend")
    )
    if (
        fees.bank_fee_transaction_count < 2
        or monthly_average is None
        or (monthly_average < MIN_IMPACT and not typed_burden)
        or not (
            fee_observations
            or (monthly_average >= Decimal("100") and ratio >= Decimal("0.02"))
            or typed_burden
        )
    ):
        return []
    typed_total = Decimal("0")
    if sms_banking_burden:
        typed_total = sms
    elif balance_enquiry_burden:
        typed_total = enquiry
    elif immediate_burden:
        typed_total = immediate
    elif foreign_burden:
        typed_total = fees.foreign_transaction_fee_total or Decimal("0")
    elif interest_burden:
        typed_total = fees.interest_charge_total or Decimal("0")
    elif overdraft_burden:
        typed_total = fees.overdraft_fee_total or Decimal("0")
    elif insufficient_funds_burden:
        typed_total = fees.insufficient_funds_fee_total or Decimal("0")
    impact_is_period_change = change >= MIN_IMPACT
    if impact_is_period_change:
        impact = change
    elif monthly_average >= MIN_IMPACT:
        impact = monthly_average
    elif typed_burden and typed_total >= MIN_IMPACT:
        impact = typed_total / Decimal(max(1, len(completed_months(snapshot))))
    else:
        impact = monthly_average
    # Annualise the recurring monthly average, not a one-period MoM delta.
    annual_basis = monthly_average if monthly_average and monthly_average >= MIN_IMPACT else impact
    confidence = leak_confidence(
        support=None,
        observation_count=fees.bank_fee_transaction_count,
        pattern_strength=Decimal("0.82") if fee_observations else Decimal("0.68"),
        ceiling=Decimal("0.82"),
    )
    if confidence is None:
        return []
    title = "Potential recurring banking fee burden"
    description = (
        "Repeated banking fees may represent a material ongoing cost pattern. "
        "This does not claim that every fee is avoidable or can be eliminated."
    )
    if sms_banking_burden:
        title = "Potential SMS banking charge burden"
        description = (
            "Repeated SMS banking or notification fees were observed. These may "
            "represent an avoidable banking cost, but available data does not prove "
            "that SMS alerts were unnecessary or that a free alternative was available."
        )
    elif balance_enquiry_burden:
        title = "Potential ATM balance enquiry fee burden"
        description = (
            "Repeated ATM balance enquiry fees were observed. These may be reducible "
            "through digital banking, but available data does not prove that digital "
            "access was available or that each charge was avoidable."
        )
    elif immediate_burden:
        title = "Potential immediate payment fee burden"
        description = (
            "Repeated immediate or real-time payment fees may indicate higher-cost "
            "payment usage. This does not prove that a lower-cost method was available."
        )
    elif foreign_burden:
        title = "Potential foreign transaction fee burden"
        description = (
            "Repeated foreign transaction fees were observed and may warrant review."
        )
    elif interest_burden:
        title = "Potential interest charge burden"
        description = "Interest charges were observed and may warrant review."
    elif overdraft_burden:
        title = "Potential overdraft fee burden"
        description = "Repeated overdraft fees were observed and may warrant review."
    elif insufficient_funds_burden:
        title = "Potential insufficient-funds charge burden"
        description = "Repeated insufficient-funds charges were observed and may warrant review."
    elif monthly_fee_trend and _recurring_card_fee_change(fees):
        title = "Potential recurring card fee increase"
        description = (
            "Repeated card fees increased over the observed period compared with "
            "the prior baseline. This reflects observed fee amounts only."
        )
    elif monthly_fee_trend and not _card_fee_series(fees):
        title = "Potential monthly banking fee increase"
        description = (
            "Overall banking fees increased over the observed period compared with "
            "the prior baseline. This reflects combined monthly fee movement and does "
            "not prove that fees could be eliminated or that a cheaper product was "
            "available."
        )
    fee_breakdown = _fee_type_breakdown(fees)
    evidence: dict[str, object] = {
        "monthly_average_fee": monthly_average,
        "bank_fee_transaction_count": fees.bank_fee_transaction_count,
        "bank_fee_ratio": ratio,
        "fee_change_amount": change if change > 0 else None,
        "fee_type_breakdown": fee_breakdown,
        "recurring_fee_total": fee_breakdown.get("recurring_total"),
        "one_off_fee_total": fee_breakdown.get("one_off_total"),
        "fees_are_not_all_avoidable": True,
        "finding_kind": "potential_leak",
    }
    if sms_banking_burden:
        evidence["finding_focus"] = "sms_banking"
        evidence["sms_fee_total"] = sms
    elif balance_enquiry_burden:
        evidence["finding_focus"] = "atm_balance_enquiry"
        evidence["balance_enquiry_fee_total"] = enquiry
    elif immediate_burden:
        evidence["immediate_payment_fee_total"] = immediate
        evidence["finding_focus"] = "immediate_payment_fee"
    elif foreign_burden:
        evidence["finding_focus"] = "foreign_transaction_fee"
        evidence["foreign_transaction_fee_total"] = fees.foreign_transaction_fee_total
        evidence["foreign_transaction_fee_count"] = fees.foreign_transaction_fee_count
        evidence["completed_month_count"] = len(completed_months(snapshot))
    elif interest_burden:
        evidence["finding_focus"] = "interest_charges"
        evidence["interest_charge_total"] = fees.interest_charge_total
        evidence["interest_charge_count"] = fees.interest_charge_count
        evidence["completed_month_count"] = len(completed_months(snapshot))
    elif overdraft_burden:
        evidence["finding_focus"] = "overdraft_fee_pattern"
        evidence["overdraft_fee_total"] = fees.overdraft_fee_total
        evidence["overdraft_fee_count"] = fees.overdraft_fee_count
        evidence["completed_month_count"] = len(completed_months(snapshot))
    elif insufficient_funds_burden:
        evidence["finding_focus"] = "insufficient_funds_charges"
        evidence["insufficient_funds_fee_total"] = fees.insufficient_funds_fee_total
        evidence["insufficient_funds_fee_count"] = fees.insufficient_funds_fee_count
        evidence["completed_month_count"] = len(completed_months(snapshot))
    elif monthly_fee_trend and _recurring_card_fee_change(fees):
        evidence["finding_focus"] = "recurring_merchant_fee_change"
        evidence["card_fee_transaction_count"] = fees.card_fee_transaction_count
        evidence["card_fee_total"] = fees.card_fee_total
        evidence.update(_monthly_banking_fee_trend_evidence(snapshot, fee_observations))
    elif monthly_fee_trend and not _card_fee_series(fees):
        evidence["finding_focus"] = "monthly_banking_fee_trend"
        evidence.update(_monthly_banking_fee_trend_evidence(snapshot, fee_observations))
    return [
        _leak(
            snapshot=snapshot,
            leak_type="bank_fee_leak",
            subject="bank-fees",
            title=title,
            description=description,
            monthly_impact=impact,
            annual_impact=annual_basis * Decimal("12"),
            impact_kind="estimated" if impact_is_period_change else "recurring",
            confidence=confidence,
            severity=severity_for_impact(impact, persistent=True, confidence=confidence),
            evidence=evidence,
            behaviour_ids=_observation_ids(fee_observations),
            feature_refs=_bank_fee_feature_refs(evidence),
        )
    ]


_APP_STORE_AGGREGATOR_KEYS = frozenset({"APPLE", "ITUNES", "GOOGLE", "GOOGLE PLAY", "APPLE COM"})


def _is_app_store_billing_merchant(merchant_name: str) -> bool:
    upper = (merchant_name or "").upper().strip()
    if upper in _APP_STORE_AGGREGATOR_KEYS:
        return True
    return (
        "APPLE.COM" in upper
        or "APPLE COM BILL" in upper
        or "GOOGLE *SERVICES" in upper
    )


def _is_monthly_billing_interval(interval: Decimal | None) -> bool:
    if interval is None:
        return False
    return Decimal("26") <= interval <= Decimal("35")


def _recurring_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    findings = []
    recurring_observations = observations.get("recurring_payment_pattern", [])
    price_observations = observations.get("price_increase_pattern", [])
    frequency_observations = observations.get("frequency_change_pattern", [])
    # Only suppress recurring when a same-day duplicate candidate exists.
    # Adjacent-day repeats must not block legitimate subscription detection.
    duplicate_merchants = {
        candidate.merchant_name
        for candidate in snapshot.duplicate_candidates
        if candidate.transaction_dates
        and (
            (max(candidate.transaction_dates) - min(candidate.transaction_dates)).days == 0
            or (
                candidate.is_debit_order
                and 0 <= candidate.billing_date_shift_days <= 5
                and candidate.recurring_debit_order_months >= 2
                and candidate.recurring_debit_order_count >= 3
                and not candidate.nearby_reversal_or_refund
            )
        )
    }
    for merchant in snapshot.merchants:
        categories = merchant.merchant_category_transaction_count
        subscription_tx = categories.get("Subscriptions", 0)
        total_tx = merchant.merchant_transaction_count
        is_subscription = (
            subscription_tx >= 2
            and subscription_tx * 2 >= total_tx
            and is_reliable_merchant_display_name(merchant.merchant_name)
        )
        # Mixed merchant activity must not change the subscription cadence or
        # amount used for a leak finding.
        recurrence = (
            merchant.subscription_recurrence
            if is_subscription and merchant.subscription_recurrence is not None
            else merchant.recurrence
        )
        interval = recurrence.median_interval_days or recurrence.average_interval_days
        if (
            recurrence.recurrence_strength not in {"medium", "high"}
            # Two card/subscription charges can be a low-history candidate.
            # Two debit orders remain below the stronger debit-order evidence
            # threshold because a mandate may have been imported only once.
            or recurrence.observation_count < (
                2 if is_subscription and merchant.debit_order_transaction_count < 2 else 3
            )
            or not matches_plausible_recurring_interval(interval)
            or support_ratio(merchant.confidence_support) < Decimal("0.60")
            or merchant.merchant_name in duplicate_merchants
        ):
            continue
        if _is_app_store_billing_merchant(merchant.merchant_name) and not _is_monthly_billing_interval(
            interval
        ):
            continue
        impact = _recurring_monthly_impact(merchant, recurrence=recurrence)
        if impact is None or impact < MIN_IMPACT:
            continue
        if total_tx > 0 and categories.get("Bank Fees", 0) == total_tx:
            continue
        debit_order_review = (
            not is_subscription
            and merchant.debit_order_transaction_count >= 2
            and merchant.debit_order_transaction_count * 2 >= total_tx
            and is_reliable_merchant_display_name(merchant.merchant_name)
        )
        if (
            _coffee_habit_merchant(merchant)
            or _convenience_store_habit_merchant(merchant)
            or _airtime_repeat_merchant(merchant)
            or _data_repeat_merchant(merchant)
            or is_repeated_shopping_merchant(merchant)
        ) and not is_subscription and not debit_order_review:
            continue
        is_unknown = not categories or set(categories).issubset({"Other"})
        reliable_merchant = is_reliable_merchant_display_name(merchant.merchant_name)
        average_amount = recurrence.typical_amount or recurrence.average_amount
        weak_commitment = (
            not is_subscription
            and not debit_order_review
            and is_weak_recurring_commitment(merchant)
        )
        if is_subscription:
            leak_type: LeakType = "subscription_leak"
            title = recurring_leak_title(
                subscription=True,
                merchant_name=merchant.merchant_name,
                average_amount=average_amount,
            )
            description = (
                "Recurring subscription-category payments followed a stable billing-like "
                "interval. This may warrant review; available data does not show whether "
                "the service is still used."
            )
            ceiling = Decimal("0.90") if recurrence.recurrence_strength == "high" else Decimal("0.78")
        elif debit_order_review:
            leak_type = "unknown_recurring_payment" if is_unknown else "recurring_payment_leak"
            title = debit_order_leak_title(merchant_name=merchant.merchant_name)
            description = (
                "Recurring payments described as debit orders followed a stable billing-like "
                "interval. This may warrant review; available data does not show whether "
                "the underlying service is still used."
            )
            ceiling = Decimal("0.78") if is_unknown else Decimal("0.85")
        elif weak_commitment:
            leak_type = "unknown_recurring_payment" if is_unknown else "recurring_payment_leak"
            title = repeated_payments_title(
                merchant_name=merchant.merchant_name if reliable_merchant else None,
                average_amount=average_amount,
            )
            description = (
                "Repeated payments were detected with a relatively stable interval and "
                "amount. This is not enough evidence to assert a subscription or recurring "
                "bill; treat it as a review cue only."
            )
            ceiling = Decimal("0.62") if is_unknown or not reliable_merchant else Decimal("0.68")
        elif is_unknown or not reliable_merchant:
            leak_type = "unknown_recurring_payment" if is_unknown else "recurring_payment_leak"
            title = recurring_leak_title(
                subscription=False,
                merchant_name=None,
                average_amount=average_amount if not reliable_merchant else None,
            )
            description = (
                "A stable billing-like payment interval was observed, but the merchant could not be identified reliably."
                if not reliable_merchant
                else "A stable recurring payment was observed, but its category could not be identified confidently."
            )
            ceiling = Decimal("0.70")
        else:
            leak_type = "recurring_payment_leak"
            title = recurring_leak_title(
                subscription=False,
                merchant_name=merchant.merchant_name,
                average_amount=average_amount,
            )
            description = "Payments at this merchant followed a stable billing-like interval and amount pattern."
            ceiling = Decimal("0.85") if recurrence.recurrence_strength == "high" else Decimal("0.72")
        confidence = leak_confidence(
            support=merchant.confidence_support,
            observation_count=recurrence.observation_count,
            pattern_strength=(
                Decimal("0.55")
                if weak_commitment
                else Decimal("1")
                if recurrence.recurrence_strength == "high"
                else Decimal("0.75")
            ),
            ceiling=ceiling,
        )
        if confidence is None:
            continue
        price_obs = _matching_recurring_price_observation(
            price_observations, merchant.merchant_name
        )
        frequency_obs = _matching_observation(
            frequency_observations, merchant.merchant_name
        )
        supporting_ids = list(
            dict.fromkeys(
                [
                    *_matching_observation_ids(
                        recurring_observations, merchant.merchant_name
                    ),
                    *([price_obs.observation_id] if price_obs else []),
                    *([frequency_obs.observation_id] if frequency_obs else []),
                ]
            )
        )
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                subject=merchant.merchant_name,
                title=title,
                description=description,
                monthly_impact=impact,
                annual_impact=None if weak_commitment else impact * Decimal("12"),
                impact_kind="recurring",
                confidence=confidence,
                severity=severity_for_impact(
                    impact,
                    persistent=not weak_commitment,
                    confidence=confidence,
                ),
                evidence={
                    "merchant_key": merchant.merchant_name
                    if reliable_merchant and (not is_unknown or debit_order_review or weak_commitment)
                    else None,
                    "observation_count": recurrence.observation_count,
                    "average_interval_days": recurrence.average_interval_days,
                    "median_interval_days": recurrence.median_interval_days,
                    "average_amount": recurrence.average_amount,
                    "typical_amount": recurrence.typical_amount,
                    "latest_amount": recurrence.latest_amount,
                    "observed_amounts": recurrence.observed_amounts,
                    "failed_payment_attempt_count": merchant.failed_payment_attempt_count,
                    "failed_payment_attempt_amounts": merchant.failed_payment_attempt_amounts,
                    "amount_variance": recurrence.amount_variance,
                    "interval_variance": recurrence.interval_variance,
                    "recurrence_strength": recurrence.recurrence_strength,
                    "first_observed_date": merchant.merchant_first_transaction_date,
                    "last_observed_date": merchant.merchant_last_transaction_date,
                    "classification_support_ratio": support_ratio(merchant.confidence_support),
                    "finding_kind": "potential_leak",
                    **(
                        {"finding_focus": "subscription_review"}
                        if is_subscription
                        else {"finding_focus": "debit_order_review"}
                        if debit_order_review
                        else {"finding_focus": "repeated_payments_detected"}
                        if weak_commitment
                        else {}
                    ),
                    **_recurring_signal_evidence(price_obs, frequency_obs),
                },
                behaviour_ids=supporting_ids,
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
        contributors = _spending_contributor_breakdown(snapshot, observation)
        if contributors.get("top_category_contributors"):
            description = (
                "Overall spending increased materially above the previous observed baseline. "
                "Supported category contributors are listed in evidence where comparable "
                "periods allow. This finding is separate from category-specific findings "
                "and must not be added to them when estimating total impact."
            )
        else:
            description = (
                "Overall spending increased materially above the previous observed baseline. "
                "The available comparable evidence does not yet identify a dominant category "
                "or merchant cause. This finding is separate from category-specific findings "
                "and must not be added to them when estimating total impact."
            )
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="spending_escalation_leak",
                subject="aggregate-spending",
                title=spending_increase_title(
                    source=None,
                    change_amount=change,
                ),
                description=description,
                monthly_impact=change,
                # One-period estimated deltas are not defensible to annualise.
                annual_impact=None,
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(
                    change, persistent=False, confidence=confidence
                ),
                evidence={
                    **_escalation_evidence(observation),
                    **contributors,
                    "amounts_not_additive_with_category_findings": True,
                    "annual_impact_omitted_reason": "single_period_estimated_change",
                    "finding_kind": "potential_leak",
                },
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
        if leak_type == "airtime_data_leak" and feature.airtime_only:
            if feature.airtime_transaction_count < 5 or feature.airtime_total_amount < Decimal("150"):
                continue
        elif leak_type == "airtime_data_leak" and feature.data_only:
            if feature.data_transaction_count < 5 or feature.data_total_amount < Decimal("150"):
                continue
        elif leak_type == "airtime_data_leak" and (
            feature.category_transaction_count < 5
            or feature.category_total_amount < Decimal("150")
        ):
            continue
        if leak_type == "transport_spending_leak" and (
            snapshot.spending_profile.total_spending or Decimal("0")
        ) < Decimal("2000"):
            continue
        if (
            leak_type == "transport_spending_leak"
            and feature.ride_hailing_only
            and feature.ride_hailing_transaction_count < minimum_transactions
        ):
            continue
        if (
            leak_type == "food_spending_leak"
            and feature.food_delivery_only
            and feature.food_delivery_transaction_count < minimum_transactions
        ):
            continue
        confidence = min(observation.confidence, 0.78)
        pattern_evidence = _category_spend_pattern_evidence(
            snapshot, category, observation
        )
        evidence = {
            **_escalation_evidence(observation),
            "category_name": category,
            "category_transaction_count": feature.category_transaction_count,
            "classification_support_ratio": support_ratio(feature.confidence_support),
            "amounts_not_additive_with_overall_escalation": True,
            "annual_impact_omitted_reason": "single_period_estimated_change",
            "finding_kind": "potential_leak",
            **pattern_evidence,
        }
        if feature.airtime_only:
            airtime_merchants = [
                item.merchant_name
                for item in snapshot.merchants
                if item.airtime_only and item.airtime_transaction_count > 0
            ]
            evidence.update(
                {
                    "finding_focus": "airtime_inefficiency",
                    "airtime_transaction_count": feature.airtime_transaction_count,
                    "airtime_total": feature.airtime_total_amount,
                    "average_transaction_amount": (
                        feature.airtime_total_amount / Decimal(feature.airtime_transaction_count)
                        if feature.airtime_transaction_count
                        else None
                    ),
                    "spending_share": (
                        feature.airtime_total_amount / snapshot.spending_profile.total_spending
                        if snapshot.spending_profile.total_spending not in (None, Decimal("0"))
                        else None
                    ),
                }
            )
            if len(airtime_merchants) == 1 and is_reliable_merchant_display_name(airtime_merchants[0]):
                evidence["merchant_key"] = airtime_merchants[0]
            title = _category_increase_title(
                default="Airtime",
                merchant_key=evidence.get("merchant_key"),
                change_amount=change,
            )
            description = _category_increase_description(
                "Airtime spending increased over the analysed period and may warrant review.",
                pattern_evidence,
            )
        elif feature.data_only:
            data_merchants = [
                item.merchant_name
                for item in snapshot.merchants
                if item.data_only and item.data_transaction_count > 0
            ]
            evidence.update(
                {
                    "finding_focus": "data_inefficiency",
                    "data_transaction_count": feature.data_transaction_count,
                    "data_total": feature.data_total_amount,
                    "spending_share": (
                        feature.data_total_amount / snapshot.spending_profile.total_spending
                        if snapshot.spending_profile.total_spending not in (None, Decimal("0"))
                        else None
                    ),
                }
            )
            if len(data_merchants) == 1 and is_reliable_merchant_display_name(data_merchants[0]):
                evidence["merchant_key"] = data_merchants[0]
            title = _category_increase_title(
                default="Mobile data",
                merchant_key=evidence.get("merchant_key"),
                change_amount=change,
            )
            description = _category_increase_description(
                "Mobile data spending increased over the analysed period and may warrant review.",
                pattern_evidence,
            )
        elif feature.ride_hailing_only:
            ride_merchants = [
                item.merchant_name
                for item in snapshot.merchants
                if item.ride_hailing_only and item.ride_hailing_transaction_count > 0
            ]
            evidence.update(
                {
                    "finding_focus": "ride_hailing_dependency",
                    "ride_hailing_transaction_count": feature.ride_hailing_transaction_count,
                    "ride_hailing_total": feature.ride_hailing_total_amount,
                    "spending_share": (
                        feature.ride_hailing_total_amount / snapshot.spending_profile.total_spending
                        if snapshot.spending_profile.total_spending not in (None, Decimal("0"))
                        else None
                    ),
                }
            )
            if len(ride_merchants) == 1 and is_reliable_merchant_display_name(ride_merchants[0]):
                evidence["merchant_key"] = ride_merchants[0]
            title = _category_increase_title(
                default="Ride-hailing",
                merchant_key=evidence.get("merchant_key"),
                change_amount=change,
            )
            description = _category_increase_description(
                "Ride-hailing spending increased over the analysed period and may warrant review.",
                pattern_evidence,
            )
        elif leak_type == "food_spending_leak" and feature.food_delivery_only:
            delivery_merchants = [
                item.merchant_name
                for item in snapshot.merchants
                if item.food_delivery_only and item.food_delivery_transaction_count > 0
            ]
            evidence.update(
                {
                    "finding_focus": "food_delivery_dependency",
                    "food_delivery_transaction_count": feature.food_delivery_transaction_count,
                    "food_delivery_total": feature.food_delivery_total_amount,
                    "spending_share": (
                        feature.food_delivery_total_amount / snapshot.spending_profile.total_spending
                        if snapshot.spending_profile.total_spending not in (None, Decimal("0"))
                        else None
                    ),
                }
            )
            if len(delivery_merchants) == 1 and is_reliable_merchant_display_name(delivery_merchants[0]):
                evidence["merchant_key"] = delivery_merchants[0]
            title = _category_increase_title(
                default="Food delivery",
                merchant_key=evidence.get("merchant_key"),
                change_amount=change,
            )
            description = _category_increase_description(
                "Food delivery spending increased over the analysed period and may warrant review.",
                pattern_evidence,
            )
        else:
            title = spending_increase_title(
                source=category,
                change_amount=change,
                source_is_merchant=False,
            )
            description = _category_increase_description(description, pattern_evidence)
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                subject=category,
                title=title,
                description=description,
                monthly_impact=change,
                # One-period estimated category deltas are not defensible to annualise.
                annual_impact=None,
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(
                    change, persistent=False, confidence=confidence
                ),
                evidence=evidence,
                behaviour_ids=[observation.observation_id],
                feature_refs=observation.supporting_features,
            )
        )
    return findings


def _category_increase_title(
    *,
    default: str,
    merchant_key: object,
    change_amount: Decimal | None,
) -> str:
    if isinstance(merchant_key, str) and is_reliable_merchant_display_name(merchant_key):
        return spending_increase_title(
            source=merchant_key,
            change_amount=change_amount,
            source_is_merchant=True,
        )
    return spending_increase_title(
        source=default,
        change_amount=change_amount,
        source_is_merchant=False,
    )


def _category_increase_description(
    base: str,
    pattern_evidence: dict[str, object],
) -> str:
    """Append supported merchant/count patterns without inventing a cause."""
    summary = pattern_evidence.get("supporting_pattern_summary")
    if isinstance(summary, str) and summary.strip():
        return f"{base} {summary}"
    return base


def _category_spend_pattern_evidence(
    snapshot: FinancialFeatureSnapshot,
    category: str,
    observation: BehaviourObservation,
) -> dict[str, object]:
    """List merchants and count shifts that support a category spend increase."""
    baseline_months = observation.evidence.get("baseline_months")
    current_period = observation.evidence.get("current_period")
    previous_count = _decimal(observation.evidence.get("transaction_count_previous"))
    current_count = _decimal(observation.evidence.get("transaction_count_current"))
    if not isinstance(current_period, str):
        return {
            "supporting_merchants": [],
            "cause_identified": False,
        }
    months = (
        [str(item) for item in baseline_months]
        if isinstance(baseline_months, list) and baseline_months
        else (
            [str(observation.evidence["previous_period"])]
            if isinstance(observation.evidence.get("previous_period"), str)
            else []
        )
    )
    months_by_key = {month.month: month for month in snapshot.months}
    current_month = months_by_key.get(current_period)
    if current_month is None or not months:
        return {
            "supporting_merchants": [],
            "cause_identified": False,
        }

    merchant_deltas: list[tuple[str, Decimal, int, int]] = []
    merchants = set()
    for month_key in [*months, current_period]:
        month = months_by_key.get(month_key)
        if month is not None:
            merchants.update(month.merchant_totals)
    for merchant in merchants:
        if not is_reliable_merchant_display_name(merchant):
            continue
        feature = next(
            (item for item in snapshot.merchants if item.merchant_name == merchant),
            None,
        )
        if feature is None:
            continue
        category_share = feature.merchant_category_transaction_count.get(category, 0)
        if category_share <= 0 or category_share * 2 < feature.merchant_transaction_count:
            continue
        baseline_total = Decimal("0")
        baseline_tx = 0
        present = 0
        for month_key in months:
            month = months_by_key.get(month_key)
            if month is None:
                continue
            present += 1
            baseline_total += month.merchant_totals.get(merchant) or Decimal("0")
            baseline_tx += feature.merchant_monthly_transaction_count.get(month_key, 0)
        if present == 0:
            continue
        baseline_avg = baseline_total / Decimal(present)
        current_total = current_month.merchant_totals.get(merchant) or Decimal("0")
        current_tx = feature.merchant_monthly_transaction_count.get(current_period, 0)
        delta = current_total - baseline_avg
        if delta >= MIN_IMPACT:
            merchant_deltas.append(
                (merchant, delta, int(round(baseline_tx / present)), current_tx)
            )
    merchant_deltas.sort(key=lambda item: item[1], reverse=True)
    supporting = [
        {
            "merchant_key": name,
            "merchant_display_name": merchant_display_name_for(name),
            "change_amount": amount,
            "transaction_count_previous": previous_tx,
            "transaction_count_current": current_tx,
        }
        for name, amount, previous_tx, current_tx in merchant_deltas[:3]
    ]
    summary_parts: list[str] = []
    if supporting:
        labels = [
            str(item["merchant_display_name"] or item["merchant_key"])
            for item in supporting
            if item.get("merchant_display_name") or item.get("merchant_key")
        ]
        if labels:
            summary_parts.append(
                "Supporting merchants in comparable months: " + ", ".join(labels) + "."
            )
    if (
        previous_count is not None
        and current_count is not None
        and current_count > previous_count
    ):
        summary_parts.append(
            f"Purchase count moved from {previous_count:.0f} to {current_count:.0f} "
            "across the compared periods."
        )
    return {
        "supporting_merchants": supporting,
        "transaction_count_previous": previous_count,
        "transaction_count_current": current_count,
        "cause_identified": bool(supporting),
        "supporting_pattern_summary": " ".join(summary_parts) if summary_parts else None,
    }


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
    if category in CONVENIENCE_FOOD_CATEGORIES:
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


def _convenience_store_habit_merchant(merchant: MerchantFeature) -> bool:
    count = merchant.convenience_store_transaction_count
    total = merchant.merchant_transaction_count
    return (
        count >= RECURRENCE_MIN_OBSERVATIONS
        and total > 0
        and count * 2 >= total
        and is_reliable_merchant_display_name(merchant.merchant_name)
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
    )


def _coffee_habit_merchant(merchant: MerchantFeature) -> bool:
    count = merchant.coffee_transaction_count
    total = merchant.merchant_transaction_count
    return (
        count >= RECURRENCE_MIN_OBSERVATIONS
        and total > 0
        and count * 2 >= total
        and is_reliable_merchant_display_name(merchant.merchant_name)
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
    )


def _data_repeat_merchant(merchant: MerchantFeature) -> bool:
    return (
        merchant.data_only
        and merchant.data_transaction_count >= RECURRENCE_MIN_OBSERVATIONS
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
    )


def _airtime_repeat_merchant(merchant: MerchantFeature) -> bool:
    return (
        merchant.airtime_only
        and merchant.airtime_transaction_count >= RECURRENCE_MIN_OBSERVATIONS
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
    )


def _atm_withdrawal_fee_stacking_eligible(cash: CashFeatures) -> bool:
    atm_total = cash.atm_fee_total or Decimal("0")
    return (
        atm_total >= MIN_IMPACT
        and cash.atm_fee_count >= 2
        and cash.cash_withdrawal_count >= 3
    )


def _cash_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    cash = snapshot.cash
    if cash.cash_withdrawal_count < 3:
        return []
    cash_observations = observations.get("cash_dependency", [])
    if not cash_observations:
        return []
    observation = cash_observations[0]
    share = _decimal(observation.evidence.get("cash_withdrawal_share"))
    atm_total = cash.atm_fee_total or Decimal("0")
    fee_backed = atm_total >= MIN_IMPACT
    reliance_backed = share is not None and share >= Decimal("0.15")
    if not fee_backed and not reliance_backed:
        return []

    months = max(1, len(completed_months(snapshot)))
    stacking = _atm_withdrawal_fee_stacking_eligible(cash)
    if stacking:
        impact = atm_total / Decimal(months)
        impact_kind = "recurring"
        title = "Potential ATM withdrawal fee stacking"
        description = (
            "Multiple ATM cash withdrawals were accompanied by repeated ATM transaction "
            "fees. This may indicate a stacking fee burden; available data does not "
            "prove the fees were avoidable."
        )
        if reliance_backed and share is not None and share >= Decimal("0.30"):
            description = (
                f"{description} Cash withdrawals also represented a meaningful share "
                "of observed spending."
            )
    elif fee_backed:
        impact = atm_total / Decimal(months)
        impact_kind = "recurring"
        title = "Potential ATM fee cost from repeated cash withdrawals"
        description = (
            "Repeated cash withdrawals were accompanied by identifiable ATM fee costs."
        )
    else:
        cash_monthly = cash.cash_withdrawal_total / Decimal(months)
        if cash_monthly < MIN_IMPACT:
            return []
        impact = cash_monthly * share if share is not None else cash_monthly
        impact_kind = "estimated"
        title = "Potential cash dependency pattern"
        description = (
            "Cash withdrawals represent a meaningful share of observed spending."
        )

    if (
        not stacking
        and reliance_backed
        and share is not None
        and share >= Decimal("0.30")
    ):
        title = "Potential cash dependency pattern"
        if fee_backed:
            description = (
                "Cash withdrawals made up a substantial share of observed spending and were "
                "accompanied by identifiable ATM fee costs."
            )
        else:
            description = (
                "Cash withdrawals represent a meaningful share of observed spending."
            )

    confidence = leak_confidence(
        support=None,
        observation_count=cash.cash_withdrawal_count,
        pattern_strength=Decimal("0.75"),
        ceiling=Decimal("0.75"),
    )
    if confidence is None:
        return []
    confidence = min(confidence, observation.confidence)
    evidence: dict[str, object] = {
        "cash_withdrawal_count": cash.cash_withdrawal_count,
        "cash_withdrawal_total": cash.cash_withdrawal_total,
        "atm_fee_total": atm_total if atm_total > 0 else None,
        "completed_month_count": months,
        "finding_kind": "potential_leak",
    }
    if share is not None:
        evidence["cash_withdrawal_share"] = share
    if stacking:
        evidence["finding_focus"] = "atm_withdrawal_fee_stacking"
        evidence["atm_fee_count"] = cash.atm_fee_count
    elif reliance_backed and share is not None and share >= Decimal("0.30"):
        evidence["finding_focus"] = "cash_dependency"
    return [
        _leak(
            snapshot=snapshot,
            leak_type="cash_usage_leak",
            subject="cash-withdrawals",
            title=title,
            description=description,
            monthly_impact=impact,
            annual_impact=impact * Decimal("12"),
            impact_kind=impact_kind,
            confidence=confidence,
            severity=severity_for_impact(impact, persistent=True, confidence=confidence),
            evidence=evidence,
            behaviour_ids=_observation_ids(cash_observations),
            feature_refs=["cash", "months[].cash_withdrawal_total", "fees.atm_fee_total"],
        )
    ]


def _duplicate_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    findings = []
    observation_ids = _observation_ids(observations.get("duplicate_payment_pattern", []))
    # One registry identity per merchant. Prefer the highest potential-impact
    # same-day candidate so distinct merchants stay distinct while identity keys
    # remain stable across detector versions.
    selected_by_merchant: dict[str, object] = {}
    for candidate in snapshot.duplicate_candidates:
        if candidate.is_debit_order:
            continue
        dates = candidate.transaction_dates
        high_confidence_ratio = (
            Decimal(candidate.high_confidence_transaction_count) / Decimal(len(dates))
            if dates
            else Decimal("0")
        )
        if (
            len(dates) < 2
            or (max(dates) - min(dates)).days != 0
            or candidate.amount < Decimal("20")
            or high_confidence_ratio < Decimal("0.60")
        ):
            continue
        # Refunds/reversals on the same day weaken the accidental-duplicate claim.
        if candidate.nearby_reversal_or_refund:
            continue
        # Divergent descriptions without a shared payment reference are weak
        # same-merchant/amount/date matches and are often intentional repeats.
        if (
            candidate.distinct_description_count > 1
            and not candidate.shared_reference_tokens
        ):
            continue
        impact = candidate.amount * Decimal(len(dates) - 1)
        current = selected_by_merchant.get(candidate.merchant_name)
        if current is None or impact > current[0]:  # type: ignore[index]
            selected_by_merchant[candidate.merchant_name] = (impact, candidate)

    for impact, candidate in selected_by_merchant.values():  # type: ignore[misc]
        dates = candidate.transaction_dates
        support = ConfidenceSupport(
            supporting_transaction_count=len(dates),
            high_confidence_transaction_count=candidate.high_confidence_transaction_count,
            low_confidence_transaction_count=(
                len(dates) - candidate.high_confidence_transaction_count
            ),
        )
        # Matching merchant+amount+date alone is weak; do not inflate confidence.
        close_timestamp = (
            candidate.min_time_gap_minutes is not None
            and candidate.min_time_gap_minutes <= 15
        )
        pattern_strength = Decimal("0.48")
        if candidate.shared_reference_tokens or close_timestamp:
            pattern_strength = Decimal("0.58")
        if candidate.distinct_description_count <= 1 and not close_timestamp:
            pattern_strength = min(pattern_strength, Decimal("0.52"))
        confidence = leak_confidence(
            support=support,
            observation_count=len(dates),
            pattern_strength=pattern_strength,
            ceiling=Decimal("0.70") if close_timestamp else Decimal("0.68"),
        )
        if confidence is None:
            continue
        display_merchant = (
            candidate.merchant_name
            if is_reliable_merchant_display_name(candidate.merchant_name)
            else None
        )
        alternate_count = sum(
            1
            for other in snapshot.duplicate_candidates
            if other.merchant_name == candidate.merchant_name
            and other.group_key != candidate.group_key
            and other.transaction_dates
            and (max(other.transaction_dates) - min(other.transaction_dates)).days == 0
        )
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="duplicate_payment_leak",
                subject=candidate.merchant_name,
                title=duplicate_leak_title(
                    merchant_name=display_merchant,
                    amount=candidate.amount,
                ),
                description=(
                    "Same-day transactions with the same merchant and amount were grouped as a "
                    "duplicate candidate that requires manual verification. Matching merchant, "
                    "amount and date alone does not confirm a duplicate, accidental payment, "
                    "error, or recoverable amount."
                ),
                monthly_impact=impact,
                annual_impact=None,
                impact_kind="one_time",
                confidence=confidence,
                severity=severity_for_impact(impact, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "duplicate_merchant_payment",
                    # Always persist the grouping key for identity continuity; display
                    # filtering happens separately and must not flip identity keys.
                    "merchant_key": candidate.merchant_name,
                    "candidate_amount": candidate.amount,
                    "transaction_count_in_group": len(dates),
                    "group_total": candidate.amount * Decimal(len(dates)),
                    "observed_date": dates[0].isoformat(),
                    "date_span_days": 0,
                    "match_basis": list(candidate.match_basis),
                    "distinct_description_count": candidate.distinct_description_count,
                    "shared_reference_tokens": candidate.shared_reference_tokens,
                    "nearby_reversal_or_refund": candidate.nearby_reversal_or_refund,
                    "alternate_same_merchant_candidate_count": alternate_count,
                    "potential_not_confirmed_savings": True,
                    "verification_required": True,
                    "finding_kind": "verification_required",
                    "uncertainty": (
                        "Matching fields can occur for intentional repeat purchases. "
                        "Manual verification is required before treating this as a duplicate."
                    ),
                    **(
                        {"min_time_gap_minutes": candidate.min_time_gap_minutes}
                        if candidate.min_time_gap_minutes is not None
                        else {}
                    ),
                },
                behaviour_ids=observation_ids,
                feature_refs=["duplicate_candidates"],
            )
        )
    return findings


_VIDEO_STREAMING_PROVIDERS: dict[str, tuple[str, ...]] = {
    "netflix": ("NETFLIX",),
    "showmax": ("SHOWMAX",),
    "dstv": ("DSTV", "MULTICHOICE"),
    "disney_plus": ("DISNEY PLUS", "DISNEYPLUS", "DISNEY+", "DISNEY"),
    "prime_video": ("PRIME VIDEO", "AMAZON PRIME"),
    "apple_tv": ("APPLE TV", "APPLE TV+"),
    "youtube_premium": ("YOUTUBE PREMIUM", "YOUTUBE"),
    "hbo_max": ("HBO MAX", "HBO"),
    "paramount_plus": ("PARAMOUNT PLUS", "PARAMOUNT+", "PARAMOUNT"),
    "britbox": ("BRITBOX",),
    "crunchyroll": ("CRUNCHYROLL",),
}
_MUSIC_STREAMING_PROVIDERS: dict[str, tuple[str, ...]] = {
    "spotify": ("SPOTIFY",),
    "apple_music": ("APPLE MUSIC",),
    "youtube_music": ("YOUTUBE MUSIC",),
    "deezer": ("DEEZER",),
    "tidal": ("TIDAL",),
}
_NON_STREAMING_SAAS_MARKERS = (
    "ICLOUD",
    "GOOGLE ONE",
    "GOOGLE STORAGE",
    "MICROSOFT 365",
    "OFFICE 365",
    "DROPBOX",
    "ONEDRIVE",
    "ADOBE",
    "CHATGPT",
    "OPENAI",
    "CANVA",
    "GITHUB",
)
_RENTAL_OR_ONE_OFF_MARKERS = ("RENTAL", "RENT ", "MOVIE RENTAL", "PAY PER VIEW", "PPV")


def _classify_streaming_provider(merchant_name: str) -> tuple[str, str] | None:
    """Return (subcategory, canonical_provider_id) for known streaming merchants."""
    upper = (merchant_name or "").upper().strip()
    if not upper or any(marker in upper for marker in _NON_STREAMING_SAAS_MARKERS):
        return None
    if any(marker in upper for marker in _RENTAL_OR_ONE_OFF_MARKERS):
        return None
    compact = " ".join(upper.replace(".", " ").replace("-", " ").replace("_", " ").split())
    for provider_id, aliases in _MUSIC_STREAMING_PROVIDERS.items():
        if any(alias in compact or alias in upper for alias in aliases):
            return ("music_streaming", provider_id)
    for provider_id, aliases in _VIDEO_STREAMING_PROVIDERS.items():
        if any(alias in compact or alias in upper for alias in aliases):
            return ("video_streaming", provider_id)
    return None


def _duplicate_debit_order_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-024 findings for duplicate debit-order collections backed by recurring history."""
    findings: list[LeakDetection] = []
    observation_ids = _observation_ids(observations.get("duplicate_payment_pattern", []))
    selected_by_merchant: dict[str, tuple[Decimal, object]] = {}
    for candidate in snapshot.duplicate_candidates:
        if not candidate.is_debit_order:
            continue
        dates = candidate.transaction_dates
        high_confidence_ratio = (
            Decimal(candidate.high_confidence_transaction_count) / Decimal(len(dates))
            if dates
            else Decimal("0")
        )
        if (
            len(dates) < 2
            or not (0 <= candidate.billing_date_shift_days <= 5)
            or candidate.amount < Decimal("20")
            or high_confidence_ratio < Decimal("0.60")
            or candidate.nearby_reversal_or_refund
            or candidate.recurring_debit_order_months < 2
            or candidate.recurring_debit_order_count < 3
            or len(candidate.match_basis) < 4
        ):
            continue
        if (
            candidate.distinct_description_count > 1
            and not candidate.shared_reference_tokens
            and candidate.billing_date_shift_days > 0
        ):
            continue
        impact = candidate.amount * Decimal(len(dates) - 1) - candidate.amount_variance
        if impact < MIN_IMPACT:
            impact = candidate.amount * Decimal(len(dates) - 1)
        current = selected_by_merchant.get(candidate.merchant_name)
        if current is None or impact > current[0]:
            selected_by_merchant[candidate.merchant_name] = (impact, candidate)

    for impact, candidate in selected_by_merchant.values():  # type: ignore[misc]
        dates = candidate.transaction_dates
        support = ConfidenceSupport(
            supporting_transaction_count=len(dates),
            high_confidence_transaction_count=candidate.high_confidence_transaction_count,
            low_confidence_transaction_count=(
                len(dates) - candidate.high_confidence_transaction_count
            ),
        )
        exact_same_day = (
            candidate.billing_date_shift_days == 0
            and candidate.amount_variance == Decimal("0")
        )
        pattern_strength = Decimal("0.62") if exact_same_day else Decimal("0.54")
        if candidate.shared_reference_tokens:
            pattern_strength = min(Decimal("0.68"), pattern_strength + Decimal("0.04"))
        confidence = leak_confidence(
            support=support,
            observation_count=candidate.recurring_debit_order_count,
            pattern_strength=pattern_strength,
            ceiling=Decimal("0.72") if exact_same_day else Decimal("0.66"),
        )
        if confidence is None:
            continue
        display_merchant = (
            merchant_display_name_for(candidate.merchant_name)
            if is_reliable_merchant_display_name(candidate.merchant_name)
            else None
        )
        title = (
            f"Possible duplicate debit order at {display_merchant} ({format_zar(candidate.amount)})"
            if display_merchant
            else f"Possible duplicate debit order ({format_zar(candidate.amount)})"
        )
        group_total = candidate.amount * Decimal(len(dates)) - candidate.amount_variance
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="duplicate_debit_order_leak",
                subject=candidate.merchant_name,
                title=title,
                description=(
                    "Multiple debit-order collections for the same merchant were observed within "
                    "the same billing cycle alongside established recurring debit-order history. "
                    "This requires manual verification against your mandate and statement; it does "
                    "not confirm a billing error or recoverable amount."
                ),
                monthly_impact=impact,
                annual_impact=None,
                impact_kind="one_time",
                confidence=confidence,
                severity=severity_for_impact(impact, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "duplicate_debit_order",
                    "merchant_key": candidate.merchant_name,
                    "candidate_amount": candidate.amount,
                    "transaction_count_in_group": len(dates),
                    "group_total": group_total,
                    "observed_date": dates[0].isoformat(),
                    "latest_observed_date": dates[-1].isoformat(),
                    "date_span_days": candidate.billing_date_shift_days,
                    "billing_date_shift_days": candidate.billing_date_shift_days,
                    "amount_variance": candidate.amount_variance,
                    "recurring_debit_order_count": candidate.recurring_debit_order_count,
                    "recurring_debit_order_months": candidate.recurring_debit_order_months,
                    "match_basis": list(candidate.match_basis),
                    "distinct_description_count": candidate.distinct_description_count,
                    "shared_reference_tokens": candidate.shared_reference_tokens,
                    "nearby_reversal_or_refund": candidate.nearby_reversal_or_refund,
                    "potential_not_confirmed_savings": True,
                    "verification_required": True,
                    "finding_kind": "verification_required",
                    "uncertainty": (
                        "Multiple debit-order collections in a billing window can reflect "
                        "arrears catch-up, date shifts, or separate mandates. Manual "
                        "verification is required before disputing the debit order."
                    ),
                },
                behaviour_ids=observation_ids,
                feature_refs=["duplicate_candidates", f"merchants[{candidate.merchant_name}]"],
            )
        )
    return findings


def _duplicate_streaming_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-017 findings when 2+ recurring streaming services in the same subcategory overlap."""
    if snapshot.date_end is None:
        return []
    by_subcategory: dict[str, dict[str, MerchantFeature]] = {}
    for merchant in snapshot.merchants:
        classified = _classify_streaming_provider(merchant.merchant_name)
        if classified is None:
            continue
        subcategory, provider_id = classified
        interval = merchant.recurrence.average_interval_days or merchant.merchant_average_interval_days
        if (
            merchant.merchant_transaction_count < 2
            or len(merchant.merchant_monthly_totals) < 2
            or not matches_plausible_recurring_interval(interval)
            or support_ratio(merchant.confidence_support) < Decimal("0.60")
            or merchant.merchant_last_transaction_date is None
            or (snapshot.date_end - merchant.merchant_last_transaction_date).days > 38
        ):
            continue
        impact = (
            _recurring_monthly_impact(
                merchant,
                recurrence=merchant.subscription_recurrence or merchant.recurrence,
            )
            or merchant.merchant_average_amount
        )
        if impact < Decimal("30"):
            continue
        group = by_subcategory.setdefault(subcategory, {})
        existing = group.get(provider_id)
        if existing is None or merchant.merchant_total_amount > existing.merchant_total_amount:
            group[provider_id] = merchant

    findings: list[LeakDetection] = []
    recurring_obs_ids = _observation_ids(observations.get("recurring_payment_pattern", []))
    for subcategory, provider_map in sorted(by_subcategory.items()):
        if len(provider_map) < 2:
            continue
        merchants = sorted(
            provider_map.values(),
            key=lambda item: (-item.merchant_total_amount, item.merchant_name),
        )
        latest_months = {
            max(m.merchant_monthly_totals.keys())
            for m in merchants
            if m.merchant_monthly_totals
        }
        target_latest_month = max(latest_months) if latest_months else None
        if target_latest_month is None:
            continue
        concurrent = [
            m for m in merchants if target_latest_month in m.merchant_monthly_totals
        ]
        if len(concurrent) < 2:
            continue
        month_counts: dict[str, int] = {}
        for m in concurrent:
            for month in m.merchant_monthly_totals:
                month_counts[month] = month_counts.get(month, 0) + 1
        overlapping_months = sorted(month for month, count in month_counts.items() if count >= 2)
        if len(overlapping_months) < 2:
            continue

        monthly_amounts = [
            (
                (m.subscription_recurrence or m.recurrence).average_amount
                or m.merchant_average_amount
            )
            for m in concurrent
        ]
        combined_monthly = sum(monthly_amounts, Decimal("0"))
        if combined_monthly < MIN_IMPACT:
            continue
        total_spend = sum((m.merchant_total_amount for m in concurrent), Decimal("0"))
        total_tx_count = sum(m.merchant_transaction_count for m in concurrent)
        high_conf_tx_count = sum(
            m.confidence_support.high_confidence_transaction_count for m in concurrent
        )
        support = ConfidenceSupport(
            supporting_transaction_count=total_tx_count,
            high_confidence_transaction_count=high_conf_tx_count,
            low_confidence_transaction_count=max(0, total_tx_count - high_conf_tx_count),
        )
        confidence = leak_confidence(
            support=support,
            observation_count=total_tx_count,
            pattern_strength=Decimal("0.72") if len(overlapping_months) >= 3 else Decimal("0.64"),
            ceiling=Decimal("0.82"),
        )
        if confidence is None:
            continue
        service_names = [
            merchant_display_name_for(m.merchant_name) or m.merchant_name
            for m in concurrent
        ]
        merchant_keys = [m.merchant_name for m in concurrent]
        subcategory_label = (
            "video streaming" if subcategory == "video_streaming" else "music streaming"
        )
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="duplicate_streaming_leak",
                subject=f"streaming-overlap-{subcategory}",
                title=f"Overlapping active {subcategory_label} subscriptions ({', '.join(service_names[:3])})",
                description=(
                    f"Multiple recurring {subcategory_label} subscriptions ({', '.join(service_names)}) "
                    f"were concurrently active across {len(overlapping_months)} billing months, "
                    f"totalling {format_zar(combined_monthly)} per month. This highlights overlapping "
                    "recurring media commitments for your review and does not assume any service is "
                    "unwanted or redundant."
                ),
                monthly_impact=combined_monthly,
                annual_impact=combined_monthly * Decimal("12"),
                impact_kind="recurring",
                confidence=confidence,
                severity=severity_for_impact(
                    combined_monthly, persistent=True, confidence=confidence
                ),
                evidence={
                    "finding_focus": "duplicate_streaming_services",
                    "streaming_subcategory": subcategory,
                    "active_streaming_service_count": len(concurrent),
                    "streaming_merchants": merchant_keys,
                    "streaming_service_names": service_names,
                    "combined_monthly_streaming_spend": combined_monthly,
                    "total_streaming_spend": total_spend,
                    "overlapping_months": overlapping_months,
                    "overlapping_month_count": len(overlapping_months),
                    "observation_count": total_tx_count,
                    "verification_required": True,
                    "no_redundancy_assumed": True,
                    "finding_kind": "potential_leak",
                },
                behaviour_ids=recurring_obs_ids,
                feature_refs=[f"merchants[{key}]" for key in merchant_keys],
            )
        )
    return findings


def _coffee_spending_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-028 findings when repeated small/medium coffee purchases form a material habit."""
    coffee_merchants = [
        merchant
        for merchant in snapshot.merchants
        if merchant.coffee_transaction_count > 0
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
        and is_reliable_merchant_display_name(merchant.merchant_name)
        and merchant.merchant_average_amount <= Decimal("250")
    ]
    if not coffee_merchants:
        return []
    total_count = sum(m.coffee_transaction_count for m in coffee_merchants)
    total_spend = sum(
        (
            m.coffee_total_amount
            if m.coffee_total_amount > Decimal("0")
            else m.merchant_total_amount
            for m in coffee_merchants
        ),
        Decimal("0"),
    )
    monthly_totals: dict[str, Decimal] = {}
    monthly_counts: dict[str, int] = {}
    for merchant in coffee_merchants:
        if merchant.coffee_transaction_count < merchant.merchant_transaction_count * 0.5:
            continue
        for month, amount in merchant.merchant_monthly_totals.items():
            monthly_totals[month] = monthly_totals.get(month, Decimal("0")) + amount
        for month, count in merchant.merchant_monthly_transaction_count.items():
            monthly_counts[month] = monthly_counts.get(month, 0) + count

    coverage_start, coverage_end = _coverage_bounds(snapshot)
    compare = _period_compare(
        [
            (month, monthly_totals[month], monthly_counts.get(month, 0))
            for month in sorted(monthly_totals)
        ],
        coverage_end,
        coverage_start,
        minimum_baseline=Decimal("60"),
    )
    has_escalation = (
        compare is not None
        and isinstance(compare.get("change_amount"), Decimal)
        and compare["change_amount"] >= Decimal("60")
        and isinstance(compare.get("change_percentage"), Decimal)
        and compare["change_percentage"] >= Decimal("20")
    )
    if total_spend < Decimal("200") or (total_count < 5 and not (total_count >= 4 and has_escalation)):
        return []

    active_month_count = max(1, len(monthly_totals))
    completed = completed_months(snapshot)
    divisor_months = max(1, len(completed) if completed else active_month_count)
    monthly_impact = total_spend / Decimal(divisor_months)
    if monthly_impact < MIN_IMPACT:
        return []
    avg_ticket = total_spend / Decimal(total_count)
    total_tx_support = sum(m.confidence_support.supporting_transaction_count for m in coffee_merchants)
    high_tx_support = sum(m.confidence_support.high_confidence_transaction_count for m in coffee_merchants)
    support = ConfidenceSupport(
        supporting_transaction_count=total_tx_support,
        high_confidence_transaction_count=high_tx_support,
        low_confidence_transaction_count=max(0, total_tx_support - high_tx_support),
    )
    confidence = leak_confidence(
        support=support,
        observation_count=total_count,
        pattern_strength=Decimal("0.68") if has_escalation or total_count >= 8 else Decimal("0.58"),
        ceiling=Decimal("0.78"),
    )
    if confidence is None:
        return []
    top_merchant = max(
        coffee_merchants,
        key=lambda item: (item.coffee_transaction_count, item.merchant_total_amount),
    )
    single_merchant = len(coffee_merchants) == 1
    display_name = merchant_display_name_for(top_merchant.merchant_name) or top_merchant.merchant_name
    title = (
        f"Recurring coffee spending pattern at {display_name}"
        if single_merchant
        else f"Recurring coffee spending pattern across {len(coffee_merchants)} cafes"
    )
    discretionary_total = (
        snapshot.weekend.discretionary_weekend_total
        + snapshot.weekend.discretionary_weekday_total
    )
    discretionary_share = (
        total_spend / discretionary_total if discretionary_total > Decimal("0") else None
    )
    total_spending = snapshot.spending_profile.total_spending or Decimal("0")
    spending_share = total_spend / total_spending if total_spending > Decimal("0") else None
    habit_obs_ids = [
        obs.observation_id
        for obs in observations.get("spending_habit_pattern", [])
        if obs.evidence.get("finding_focus") == "coffee_spending_habit"
    ]
    evidence: dict[str, object] = {
        "finding_focus": "coffee_spending_habit",
        "merchant_key": top_merchant.merchant_name if single_merchant else None,
        "coffee_merchants": [m.merchant_name for m in coffee_merchants],
        "coffee_transaction_count": total_count,
        "coffee_total_amount": total_spend,
        "average_transaction_amount": avg_ticket,
        "monthly_coffee_spend": monthly_impact,
        "active_month_count": active_month_count,
        "discretionary_spend_share": discretionary_share,
        "spending_share": spending_share,
        "observation_count": total_count,
        "finding_kind": "spending_pattern",
    }
    if compare is not None:
        evidence.update(
            {
                "previous_period": compare["previous_period"],
                "current_period": compare["current_period"],
                "previous_amount": compare["previous_amount"],
                "current_amount": compare["current_amount"],
                "change_amount": compare["change_amount"],
                "change_percentage": compare["change_percentage"],
                "months_compared": compare["months_compared"],
            }
        )
    return [
        _leak(
            snapshot=snapshot,
            leak_type="coffee_spending_leak",
            subject=top_merchant.merchant_name if single_merchant else "coffee-spending",
            title=title,
            description=(
                f"Repeated small-to-medium coffee purchases ({total_count} transactions averaging "
                f"{format_zar(avg_ticket)}) accumulated to {format_zar(total_spend)} over the "
                "observed period. This quantifies the cumulative cost of the habit and does not "
                "judge the purchases as unnecessary."
            ),
            monthly_impact=monthly_impact,
            annual_impact=monthly_impact * Decimal("12"),
            impact_kind="recurring" if active_month_count >= 2 else "estimated",
            confidence=confidence,
            severity=severity_for_impact(
                monthly_impact, persistent=active_month_count >= 2, confidence=confidence
            ),
            evidence=evidence,
            behaviour_ids=habit_obs_ids,
            feature_refs=[f"merchants[{m.merchant_name}]" for m in coffee_merchants],
        )
    ]


def _convenience_store_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-030 findings when frequent convenience-store visits form a material spend pattern."""
    conv_merchants = [
        merchant
        for merchant in snapshot.merchants
        if merchant.convenience_store_transaction_count > 0
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
        and is_reliable_merchant_display_name(merchant.merchant_name)
        and merchant.merchant_average_amount <= Decimal("400")
    ]
    if not conv_merchants:
        return []
    total_count = sum(m.convenience_store_transaction_count for m in conv_merchants)
    total_spend = sum(
        (
            m.convenience_store_total_amount
            if m.convenience_store_total_amount > Decimal("0")
            else m.merchant_total_amount
            for m in conv_merchants
        ),
        Decimal("0"),
    )
    monthly_totals: dict[str, Decimal] = {}
    monthly_counts: dict[str, int] = {}
    for merchant in conv_merchants:
        if merchant.convenience_store_transaction_count < merchant.merchant_transaction_count * 0.5:
            continue
        for month, amount in merchant.merchant_monthly_totals.items():
            monthly_totals[month] = monthly_totals.get(month, Decimal("0")) + amount
        for month, count in merchant.merchant_monthly_transaction_count.items():
            monthly_counts[month] = monthly_counts.get(month, 0) + count

    coverage_start, coverage_end = _coverage_bounds(snapshot)
    compare = _period_compare(
        [
            (month, monthly_totals[month], monthly_counts.get(month, 0))
            for month in sorted(monthly_totals)
        ],
        coverage_end,
        coverage_start,
        minimum_baseline=Decimal("80"),
    )
    has_escalation = (
        compare is not None
        and isinstance(compare.get("change_amount"), Decimal)
        and compare["change_amount"] >= Decimal("80")
        and isinstance(compare.get("change_percentage"), Decimal)
        and compare["change_percentage"] >= Decimal("20")
    )
    if total_spend < Decimal("250") or (total_count < 5 and not (total_count >= 4 and has_escalation)):
        return []

    active_month_count = max(1, len(monthly_totals))
    completed = completed_months(snapshot)
    divisor_months = max(1, len(completed) if completed else active_month_count)
    monthly_impact = total_spend / Decimal(divisor_months)
    if monthly_impact < MIN_IMPACT:
        return []
    avg_ticket = total_spend / Decimal(total_count)
    total_tx_support = sum(m.confidence_support.supporting_transaction_count for m in conv_merchants)
    high_tx_support = sum(m.confidence_support.high_confidence_transaction_count for m in conv_merchants)
    support = ConfidenceSupport(
        supporting_transaction_count=total_tx_support,
        high_confidence_transaction_count=high_tx_support,
        low_confidence_transaction_count=max(0, total_tx_support - high_tx_support),
    )
    confidence = leak_confidence(
        support=support,
        observation_count=total_count,
        pattern_strength=Decimal("0.70") if has_escalation or total_count >= 8 else Decimal("0.58"),
        ceiling=Decimal("0.80"),
    )
    if confidence is None:
        return []
    top_merchant = max(
        conv_merchants,
        key=lambda item: (item.convenience_store_transaction_count, item.merchant_total_amount),
    )
    single_merchant = len(conv_merchants) == 1
    display_name = merchant_display_name_for(top_merchant.merchant_name) or top_merchant.merchant_name
    title = (
        f"Repeated convenience-store spending at {display_name}"
        if single_merchant
        else f"Repeated convenience-store spending across {len(conv_merchants)} stores"
    )
    grocery_cat = next(
        (cat for cat in snapshot.categories if cat.category_name == "Groceries"),
        None,
    )
    grocery_share = (
        total_spend / grocery_cat.category_total_amount
        if grocery_cat and grocery_cat.category_total_amount > Decimal("0")
        else None
    )
    total_spending = snapshot.spending_profile.total_spending or Decimal("0")
    spending_share = total_spend / total_spending if total_spending > Decimal("0") else None
    habit_obs_ids = [
        obs.observation_id
        for obs in observations.get("spending_habit_pattern", [])
        if obs.evidence.get("finding_focus") == "convenience_store_spending"
    ]
    evidence: dict[str, object] = {
        "finding_focus": "convenience_store_spending",
        "merchant_key": top_merchant.merchant_name if single_merchant else None,
        "convenience_store_merchants": [m.merchant_name for m in conv_merchants],
        "convenience_store_transaction_count": total_count,
        "convenience_store_total_amount": total_spend,
        "average_transaction_amount": avg_ticket,
        "monthly_convenience_spend": monthly_impact,
        "active_month_count": active_month_count,
        "grocery_spend_share": grocery_share,
        "spending_share": spending_share,
        "observation_count": total_count,
        "finding_kind": "spending_pattern",
    }
    if compare is not None:
        evidence.update(
            {
                "previous_period": compare["previous_period"],
                "current_period": compare["current_period"],
                "previous_amount": compare["previous_amount"],
                "current_amount": compare["current_amount"],
                "change_amount": compare["change_amount"],
                "change_percentage": compare["change_percentage"],
                "months_compared": compare["months_compared"],
            }
        )
    return [
        _leak(
            snapshot=snapshot,
            leak_type="convenience_store_leak",
            subject=top_merchant.merchant_name if single_merchant else "convenience-store-spending",
            title=title,
            description=(
                f"Frequent convenience-store and quick-stop purchases ({total_count} visits "
                f"averaging {format_zar(avg_ticket)}) accumulated to {format_zar(total_spend)} "
                "over the observed period. This quantifies the cumulative spend pattern and "
                "does not mark the purchases as unnecessary."
            ),
            monthly_impact=monthly_impact,
            annual_impact=monthly_impact * Decimal("12"),
            impact_kind="recurring" if active_month_count >= 2 else "estimated",
            confidence=confidence,
            severity=severity_for_impact(
                monthly_impact, persistent=active_month_count >= 2, confidence=confidence
            ),
            evidence=evidence,
            behaviour_ids=habit_obs_ids,
            feature_refs=[f"merchants[{m.merchant_name}]" for m in conv_merchants],
        )
    ]


def _weekend_spending_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-032 findings when calendar-normalised discretionary weekend spend spikes."""
    weekend = snapshot.weekend
    disc_weekend_tx = weekend.discretionary_weekend_transaction_count
    disc_weekday_tx = weekend.discretionary_weekday_transaction_count
    disc_weekend_total = weekend.discretionary_weekend_total
    disc_weekday_total = weekend.discretionary_weekday_total
    disc_weekend_share = weekend.discretionary_weekend_share
    disc_weekend_daily = weekend.discretionary_weekend_daily_average
    disc_weekday_daily = weekend.discretionary_weekday_daily_average
    weekday_tx_total = (
        weekend.dated_spending_transaction_count - weekend.weekend_spending_transaction_count
    )
    if (
        weekend.weekend_calendar_days < 4
        or weekend.weekday_calendar_days < 10
        or weekday_tx_total < 2
        or weekend.active_weekend_count < 3
        or disc_weekend_tx < 6
        or disc_weekend_total < Decimal("800")
        or disc_weekend_share is None
        or disc_weekend_share < Decimal("0.45")
        or disc_weekend_daily is None
        or disc_weekend_daily < Decimal("40")
    ):
        return []
    if disc_weekday_daily is not None and disc_weekday_daily > Decimal("0"):
        if disc_weekend_daily < disc_weekday_daily * Decimal("1.60"):
            return []

    coverage_start, coverage_end = _coverage_bounds(snapshot)
    compare = _period_compare(
        [
            (month, amount, 0)
            for month, amount in sorted(weekend.discretionary_weekend_monthly_totals.items())
        ],
        coverage_end,
        coverage_start,
        minimum_baseline=Decimal("200"),
    )
    has_monthly_spike = (
        compare is not None
        and isinstance(compare.get("change_amount"), Decimal)
        and compare["change_amount"] >= Decimal("150")
        and isinstance(compare.get("change_percentage"), Decimal)
        and compare["change_percentage"] >= Decimal("20")
    )
    has_sustained_high_density = (
        weekend.active_weekend_count >= 4
        and disc_weekend_tx >= 8
        and disc_weekend_share >= Decimal("0.50")
    )
    if not (has_monthly_spike or has_sustained_high_density):
        return []

    excess_daily = max(
        Decimal("0"),
        disc_weekend_daily - (disc_weekday_daily or Decimal("0")),
    )
    excess_total = excess_daily * Decimal(weekend.weekend_calendar_days)
    months_count = max(
        1,
        len(completed_months(snapshot)) or len(weekend.discretionary_weekend_monthly_totals),
    )
    monthly_impact = excess_total / Decimal(months_count)
    if monthly_impact < MIN_IMPACT:
        return []

    support = ConfidenceSupport(
        supporting_transaction_count=disc_weekend_tx + disc_weekday_tx,
        high_confidence_transaction_count=disc_weekend_tx + disc_weekday_tx,
        low_confidence_transaction_count=0,
    )
    confidence = leak_confidence(
        support=support,
        observation_count=disc_weekend_tx,
        pattern_strength=Decimal("0.72") if has_monthly_spike else Decimal("0.64"),
        ceiling=Decimal("0.80"),
    )
    if confidence is None:
        return []
    weekend_obs_ids = _observation_ids(observations.get("weekend_spending_pattern", []))
    evidence: dict[str, object] = {
        "finding_focus": "weekend_spending_spike",
        "weekend_spending_total": weekend.weekend_spending_total,
        "weekday_spending_total": weekend.weekday_spending_total,
        "weekend_spending_share": weekend.weekend_spending_share,
        "weekend_calendar_days": weekend.weekend_calendar_days,
        "weekday_calendar_days": weekend.weekday_calendar_days,
        "weekend_daily_average": weekend.weekend_daily_average,
        "weekday_daily_average": weekend.weekday_daily_average,
        "discretionary_weekend_total": disc_weekend_total,
        "discretionary_weekday_total": disc_weekday_total,
        "discretionary_weekend_share": disc_weekend_share,
        "discretionary_weekend_daily_average": disc_weekend_daily,
        "discretionary_weekday_daily_average": disc_weekday_daily,
        "discretionary_weekend_transaction_count": disc_weekend_tx,
        "active_weekend_count": weekend.active_weekend_count,
        "top_weekend_categories": list(weekend.top_weekend_categories),
        "top_weekend_merchants": list(weekend.top_weekend_merchants),
        "finding_kind": "spending_pattern",
    }
    if compare is not None:
        evidence.update(
            {
                "previous_period": compare["previous_period"],
                "current_period": compare["current_period"],
                "previous_amount": compare["previous_amount"],
                "current_amount": compare["current_amount"],
                "change_amount": compare["change_amount"],
                "change_percentage": compare["change_percentage"],
                "months_compared": compare["months_compared"],
            }
        )
    return [
        _leak(
            snapshot=snapshot,
            leak_type="weekend_spending_leak",
            subject="weekend-spending-spike",
            title="Discretionary weekend spending spike",
            description=(
                f"Discretionary weekend spending averaged {format_zar(disc_weekend_daily)} per "
                f"weekend calendar day versus {format_zar(disc_weekday_daily or Decimal('0'))} "
                f"per weekday across {weekend.active_weekend_count} active weekends "
                f"({int((disc_weekend_share * Decimal('100')).quantize(Decimal('1')))}% of "
                "discretionary spend). Fixed bills, debit orders, and essential groceries are "
                "excluded from this comparison."
            ),
            monthly_impact=monthly_impact,
            annual_impact=monthly_impact * Decimal("12"),
            impact_kind="recurring" if months_count >= 2 else "estimated",
            confidence=confidence,
            severity=severity_for_impact(
                monthly_impact, persistent=months_count >= 2, confidence=confidence
            ),
            evidence=evidence,
            behaviour_ids=weekend_obs_ids,
            feature_refs=["weekend"],
        )
    ]


def _payday_spending_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Emit FI-033 findings when discretionary spending clusters right after salary credits."""
    payday = snapshot.payday
    if (
        payday.salary_event_count < 2
        or payday.salary_cycles_with_discretionary_spike < 2
        or payday.post_salary_discretionary_transaction_count < 4
        or payday.post_salary_discretionary_total < Decimal("500")
        or payday.post_salary_discretionary_share is None
        or payday.post_salary_discretionary_share < Decimal("0.45")
    ):
        return []
    salary_dates = sorted(payday.salary_event_dates)
    if len(salary_dates) >= 2:
        intervals = [
            (later - earlier).days for earlier, later in zip(salary_dates, salary_dates[1:])
        ]
        if any(gap < 20 or gap > 40 for gap in intervals):
            return []

    monthly_impact = payday.post_salary_discretionary_total / Decimal(payday.salary_event_count)
    if monthly_impact < MIN_IMPACT:
        return []

    support = ConfidenceSupport(
        supporting_transaction_count=payday.post_salary_discretionary_transaction_count,
        high_confidence_transaction_count=payday.post_salary_discretionary_transaction_count,
        low_confidence_transaction_count=0,
    )
    confidence = leak_confidence(
        support=support,
        observation_count=payday.post_salary_discretionary_transaction_count,
        pattern_strength=(
            Decimal("0.74")
            if payday.salary_cycles_with_discretionary_spike >= 3
            else Decimal("0.64")
        ),
        ceiling=Decimal("0.82"),
    )
    if confidence is None:
        return []
    payday_obs_ids = _observation_ids(observations.get("payday_spending_pattern", []))
    share_pct = int((payday.post_salary_discretionary_share * Decimal("100")).quantize(Decimal("1")))
    return [
        _leak(
            snapshot=snapshot,
            leak_type="payday_spending_leak",
            subject="payday-discretionary-spike",
            title="Post-payday discretionary spending concentration",
            description=(
                f"{share_pct}% of observed discretionary spending "
                f"({format_zar(payday.post_salary_discretionary_total)} across "
                f"{payday.salary_cycles_with_discretionary_spike} salary cycles) occurred within "
                f"{payday.window_days} days of receiving salary, excluding rent, debit orders, "
                "utilities, insurance, and essential grocery obligations."
            ),
            monthly_impact=monthly_impact,
            annual_impact=monthly_impact * Decimal("12"),
            impact_kind="recurring",
            confidence=confidence,
            severity=severity_for_impact(monthly_impact, persistent=True, confidence=confidence),
            evidence={
                "finding_focus": "payday_spending_pattern",
                "window_days": payday.window_days,
                "salary_event_count": payday.salary_event_count,
                "salary_event_dates": [d.isoformat() for d in salary_dates],
                "salary_cycles_with_discretionary_spike": payday.salary_cycles_with_discretionary_spike,
                "post_salary_spending_total": payday.post_salary_spending_total,
                "post_salary_discretionary_total": payday.post_salary_discretionary_total,
                "post_salary_essential_total": payday.post_salary_essential_total,
                "outside_salary_window_discretionary_total": payday.outside_salary_window_discretionary_total,
                "post_salary_spending_share": payday.post_salary_spending_share,
                "post_salary_discretionary_share": payday.post_salary_discretionary_share,
                "post_salary_discretionary_transaction_count": payday.post_salary_discretionary_transaction_count,
                "top_post_salary_discretionary_categories": list(
                    payday.top_post_salary_discretionary_categories
                ),
                "top_post_salary_discretionary_merchants": list(
                    payday.top_post_salary_discretionary_merchants
                ),
                "finding_kind": "spending_pattern",
            },
            behaviour_ids=payday_obs_ids,
            feature_refs=["payday", "income.estimated_payday_interval"],
        )
    ]


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
    merchant_key = evidence.get("merchant_key")
    display_name = merchant_display_name_for(merchant_key if isinstance(merchant_key, str) else None)
    if display_name:
        evidence = {**evidence, "merchant_display_name": display_name}
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


_BANK_FEE_FOCUS_REFS: dict[str, tuple[str, ...]] = {
    "sms_banking": ("fees.sms_fee_total",),
    "atm_balance_enquiry": ("fees.balance_enquiry_fee_total",),
    "immediate_payment_fee": ("fees.immediate_payment_fee_total",),
    "foreign_transaction_fee": (
        "fees.foreign_transaction_fee_total",
        "fees.foreign_transaction_fee_count",
    ),
    "interest_charges": (
        "fees.interest_charge_total",
        "fees.interest_charge_count",
    ),
    "overdraft_fee_pattern": (
        "fees.overdraft_fee_total",
        "fees.overdraft_fee_count",
    ),
    "insufficient_funds_charges": (
        "fees.insufficient_funds_fee_total",
        "fees.insufficient_funds_fee_count",
    ),
    "recurring_merchant_fee_change": (
        "fees.card_fee_total",
        "fees.card_fee_transaction_count",
    ),
    "monthly_banking_fee_trend": (),
}

_BANK_FEE_SHARED_REFS = (
    "fees",
    "months[].bank_fee_total",
    "spending_profile.bank_fee_ratio",
)


def _bank_fee_feature_refs(evidence: dict[str, object]) -> list[str]:
    """Cite the fee fields this finding used, plus the shared fee totals."""
    focus = evidence.get("finding_focus")
    specific = _BANK_FEE_FOCUS_REFS.get(focus, ()) if isinstance(focus, str) else ()
    refs: list[str] = []
    for reference in (*specific, *_BANK_FEE_SHARED_REFS):
        if reference not in refs:
            refs.append(reference)
    return refs


def _completed_month_average(snapshot: FinancialFeatureSnapshot, selector):
    months = completed_months(snapshot)
    if not months:
        return None
    return sum((selector(month) for month in months), Decimal("0")) / Decimal(len(months))


def _recurring_monthly_impact(
    merchant: MerchantFeature,
    *,
    recurrence=None,
) -> Decimal | None:
    recurrence = recurrence or merchant.recurrence
    interval = recurrence.median_interval_days or recurrence.average_interval_days
    amount = recurrence.typical_amount or recurrence.average_amount
    if interval in (None, Decimal("0")) or amount is None:
        return None
    return amount * Decimal("30") / interval


def _foreign_transaction_fee_burden(
    snapshot: FinancialFeatureSnapshot,
    fees: FeeFeatures,
    fee_observations: list[BehaviourObservation],
) -> bool:
    total = fees.foreign_transaction_fee_total or Decimal("0")
    if _specific_fee_burden(
        total,
        fees.foreign_transaction_fee_count,
        fees.foreign_transaction_fee_high_confidence_count,
        fees,
        fee_observations,
    ):
        return True
    # One bank-fee leak cannot carry two independent movements. A foreign-fee
    # increase is specific only when it accounts for the whole fee change.
    foreign_change = _material_subtype_increase(
        snapshot, lambda month: month.foreign_transaction_fee_total
    )
    overall_change = _decimal_evidence(fee_observations, "change_amount")
    if (
        foreign_change is None
        or overall_change is None
        or fees.foreign_transaction_fee_count < 2
        or total < MIN_IMPACT
        or Decimal(fees.foreign_transaction_fee_high_confidence_count)
        / Decimal(fees.foreign_transaction_fee_count)
        < Decimal("0.60")
    ):
        return False
    return foreign_change == overall_change


def _material_subtype_increase(snapshot: FinancialFeatureSnapshot, selector) -> Decimal | None:
    months = completed_months(snapshot)
    if len(months) < MIN_TREND_MONTHS:
        return None
    current = selector(months[-1])
    previous_amount = sum((selector(month) for month in months[:-1]), Decimal("0")) / Decimal(
        len(months) - 1
    )
    if previous_amount <= 0:
        return None
    change = current - previous_amount
    percentage = (change / previous_amount) * Decimal("100")
    if change < MIN_FEE_BURDEN_TOTAL or percentage < MIN_RELATIVE_CHANGE_PERCENT:
        return None
    return change


def _interest_charge_burden(
    fees: FeeFeatures, fee_observations: list[BehaviourObservation]
) -> bool:
    return _specific_fee_burden(
        fees.interest_charge_total or Decimal("0"),
        fees.interest_charge_count,
        fees.interest_charge_high_confidence_count,
        fees,
        fee_observations,
    )


def _overdraft_fee_burden(
    fees: FeeFeatures, fee_observations: list[BehaviourObservation]
) -> bool:
    return _specific_fee_burden(
        fees.overdraft_fee_total or Decimal("0"),
        fees.overdraft_fee_count,
        fees.overdraft_fee_high_confidence_count,
        fees,
        fee_observations,
    )


def _insufficient_funds_fee_burden(
    fees: FeeFeatures, fee_observations: list[BehaviourObservation]
) -> bool:
    return _specific_fee_burden(
        fees.insufficient_funds_fee_total or Decimal("0"),
        fees.insufficient_funds_fee_count,
        fees.insufficient_funds_fee_high_confidence_count,
        fees,
        fee_observations,
    )


def _eligible_non_account_fee_pool(
    fees: FeeFeatures,
    fee_observations: list[BehaviourObservation],
) -> set[Decimal]:
    eligible = {fees.bank_fee_total}
    account_total = fees.account_fee_total or Decimal("0")
    if (
        account_total > 0
        and fees.bank_fee_total > account_total
        and not _bool_evidence(fee_observations, "overall_monthly_fee_trend")
    ):
        eligible.add(fees.bank_fee_total - account_total)
    return eligible


def _specific_fee_burden(
    total: Decimal,
    count: int,
    high_confidence_count: int,
    fees: FeeFeatures,
    fee_observations: list[BehaviourObservation],
) -> bool:
    if (
        not fee_observations
        or count < 2
        or total < MIN_IMPACT
        or total not in _eligible_non_account_fee_pool(fees, fee_observations)
    ):
        return False
    return Decimal(high_confidence_count) / Decimal(count) >= Decimal("0.60")


def _card_fee_series(fees: FeeFeatures) -> bool:
    card_total = fees.card_fee_total or Decimal("0")
    return card_total > 0 and card_total == fees.bank_fee_total


def _recurring_card_fee_change(fees: FeeFeatures) -> bool:
    if not _card_fee_series(fees) or fees.card_fee_transaction_count < 3:
        return False
    return (
        Decimal(fees.card_fee_high_confidence_count) / Decimal(fees.card_fee_transaction_count)
        >= Decimal("0.60")
    )


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


def _matching_observation(
    observations: list[BehaviourObservation], merchant: str
) -> BehaviourObservation | None:
    return next(
        (
            observation
            for observation in observations
            if observation.evidence.get("merchant_key") == merchant
        ),
        None,
    )


def _matching_recurring_price_observation(
    observations: list[BehaviourObservation], merchant: str
) -> BehaviourObservation | None:
    return next(
        (
            observation
            for observation in observations
            if observation.evidence.get("merchant_key") == merchant
            and observation.evidence.get("finding_focus")
            in {
                "subscription_price_creep",
                "debit_order_amount_increase",
                "insurance_premium_increase",
            }
        ),
        None,
    )


def _recurring_signal_evidence(
    price_obs: BehaviourObservation | None,
    frequency_obs: BehaviourObservation | None,
) -> dict[str, object]:
    payload: dict[str, object] = {}
    if price_obs is not None:
        ev = price_obs.evidence
        payload["price_change_focus"] = ev.get("finding_focus")
        payload["previous_average_amount"] = ev.get("average_previous_amount")
        payload["latest_amount"] = ev.get("latest_amount")
        payload["amount_change"] = ev.get("change_amount")
        payload["amount_change_percentage"] = ev.get("change_percentage")
    if frequency_obs is not None:
        ev = frequency_obs.evidence
        payload["baseline_interval_days"] = ev.get("baseline_interval_days")
        payload["current_interval_days"] = ev.get("current_interval_days")
        payload["interval_change_days"] = ev.get("interval_change_days")
    return {key: value for key, value in payload.items() if value is not None}


def _bool_evidence(observations: list[BehaviourObservation], key: str) -> bool:
    return any(observation.evidence.get(key) is True for observation in observations)


def _monthly_banking_fee_trend_evidence(
    snapshot: FinancialFeatureSnapshot,
    observations: list[BehaviourObservation],
) -> dict[str, object]:
    observation = next(
        (
            item
            for item in observations
            if item.evidence.get("overall_monthly_fee_trend") is True
        ),
        observations[0] if observations else None,
    )
    completed = completed_months(snapshot)
    payload: dict[str, object] = {
        "completed_month_count": len(completed),
        "completed_month_fee_totals": {
            month.month: month.bank_fee_total for month in completed
        },
    }
    if observation is None:
        return payload
    for key in (
        "previous_period",
        "current_period",
        "previous_amount",
        "current_amount",
        "change_percentage",
        "months_compared",
    ):
        value = observation.evidence.get(key)
        if value is not None:
            payload[key] = value
    return payload


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
        "baseline_month_count",
        "baseline_months",
        "baseline_period_start",
        "baseline_period_end",
        "baseline_is_average",
        "periods_comparable",
    )
    return {
        key: observation.evidence[key]
        for key in keys
        if key in observation.evidence
    } | {"behaviour_confidence": observation.confidence}


def _fee_type_breakdown(fees: FeeFeatures) -> dict[str, object]:
    """Group observed fee totals into useful types without claiming avoidability."""
    typed = {
        "service_charges": fees.account_fee_total or Decimal("0"),
        "payment_fees": (fees.immediate_payment_fee_total or Decimal("0"))
        + (fees.transaction_fee_total or Decimal("0")),
        "balance_enquiry_fees": fees.balance_enquiry_fee_total or Decimal("0"),
        "sms_fees": fees.sms_fee_total or Decimal("0"),
        "atm_fees": fees.atm_fee_total or Decimal("0"),
        "card_fees": fees.card_fee_total or Decimal("0"),
        "foreign_transaction_fees": fees.foreign_transaction_fee_total or Decimal("0"),
        "interest_charges": fees.interest_charge_total or Decimal("0"),
        "overdraft_fees": fees.overdraft_fee_total or Decimal("0"),
        "insufficient_funds_fees": fees.insufficient_funds_fee_total or Decimal("0"),
    }
    recurring_total = (
        typed["service_charges"]
        + typed["sms_fees"]
        + typed["card_fees"]
    )
    one_off_total = (
        typed["payment_fees"]
        + typed["balance_enquiry_fees"]
        + typed["atm_fees"]
        + typed["foreign_transaction_fees"]
        + typed["interest_charges"]
        + typed["overdraft_fees"]
        + typed["insufficient_funds_fees"]
    )
    classified = recurring_total + one_off_total
    return {
        **{key: value for key, value in typed.items() if value > 0},
        "recurring_total": recurring_total,
        "one_off_total": one_off_total,
        "unclassified_fee_total": max(Decimal("0"), fees.bank_fee_total - classified),
    }


def _spending_contributor_breakdown(
    snapshot: FinancialFeatureSnapshot,
    observation: BehaviourObservation,
) -> dict[str, object]:
    """Identify supported category/merchant contributors for overall escalation.

    Contributors are compared against the same multi-month baseline average used
    for ``change_amount``, not a single prior month, so shares stay aligned.
    """
    baseline_months = observation.evidence.get("baseline_months")
    previous_period = observation.evidence.get("previous_period")
    current_period = observation.evidence.get("current_period")
    change = _decimal(observation.evidence.get("change_amount")) or Decimal("0")
    months_by_key = {month.month: month for month in snapshot.months}
    if not isinstance(current_period, str):
        return {
            "cause_identified": False,
            "top_category_contributors": [],
            "top_merchant_contributors": [],
        }
    baseline_keys = (
        [str(item) for item in baseline_months]
        if isinstance(baseline_months, list) and baseline_months
        else [str(previous_period)]
        if isinstance(previous_period, str)
        else []
    )
    baseline_months_data = [
        months_by_key[key] for key in baseline_keys if key in months_by_key
    ]
    current_month = months_by_key.get(current_period)
    if not baseline_months_data or current_month is None or change <= 0:
        return {
            "cause_identified": False,
            "top_category_contributors": [],
            "top_merchant_contributors": [],
        }

    def _baseline_average(totals_for) -> Decimal:
        return sum((totals_for(month) for month in baseline_months_data), Decimal("0")) / Decimal(
            len(baseline_months_data)
        )

    category_deltas: list[tuple[str, Decimal]] = []
    categories: set[str] = set()
    for month in baseline_months_data:
        categories.update(month.category_totals)
    categories.update(current_month.category_totals)
    for category in categories:
        baseline = _baseline_average(
            lambda month, name=category: month.category_totals.get(name) or Decimal("0")
        )
        delta = (current_month.category_totals.get(category) or Decimal("0")) - baseline
        if delta >= MIN_IMPACT:
            category_deltas.append((category, delta))
    category_deltas.sort(key=lambda item: item[1], reverse=True)

    merchant_deltas: list[tuple[str, Decimal]] = []
    merchants: set[str] = set()
    for month in baseline_months_data:
        merchants.update(month.merchant_totals)
    merchants.update(current_month.merchant_totals)
    for merchant in merchants:
        if not is_reliable_merchant_display_name(merchant):
            continue
        baseline = _baseline_average(
            lambda month, name=merchant: month.merchant_totals.get(name) or Decimal("0")
        )
        delta = (current_month.merchant_totals.get(merchant) or Decimal("0")) - baseline
        if delta >= MIN_IMPACT:
            merchant_deltas.append((merchant, delta))
    merchant_deltas.sort(key=lambda item: item[1], reverse=True)

    top_categories = [
        {
            "category_name": name,
            "change_amount": amount,
            "share_of_overall_change": (amount / change) if change > 0 else None,
        }
        for name, amount in category_deltas[:3]
    ]
    top_merchants = [
        {
            "merchant_key": name,
            "merchant_display_name": merchant_display_name_for(name),
            "change_amount": amount,
            "share_of_overall_change": (amount / change) if change > 0 else None,
        }
        for name, amount in merchant_deltas[:3]
    ]
    explained = sum((item["change_amount"] for item in top_categories), Decimal("0"))
    return {
        "cause_identified": bool(top_categories) and explained >= (change * Decimal("0.40")),
        "top_category_contributors": top_categories,
        "top_merchant_contributors": top_merchants,
        "contributor_explanation": (
            "Listed contributors are supported by comparable monthly totals against the "
            "same baseline used for the overall change."
            if top_categories
            else "Cause not yet identified from comparable category or merchant totals."
        ),
    }
