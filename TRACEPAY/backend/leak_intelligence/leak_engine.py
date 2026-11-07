"""Deterministic, conservative potential financial leak detection."""

from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal
import re

from .behaviour_engine import (
    DOMINANT_FEE_SHARE,
    MIN_FEE_BURDEN_TOTAL,
    MIN_RELATIVE_CHANGE_PERCENT,
    MIN_TREND_MONTHS,
    _coverage_bounds,
    _period_compare,
    is_repeated_shopping_merchant,
    is_weak_recurring_commitment,
)
from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .commitment_groups import cover_provider, credit_provider, is_gambling_merchant
from .evidence_status import evidence_status_for
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
from .engine import (
    AMOUNT_TOLERANCE,
    DEBIT_ORDER_DUPLICATE_MAX_SHIFT_DAYS,
    DEBIT_ORDER_MONTHLY_DUPLICATE_MAX_SHIFT_DAYS,
    MONTHLY_GAP_DAYS,
    NEAR_DAY_DUPLICATE_MAX_DAYS,
    NEAR_DAY_DUPLICATE_MIN_AMOUNT,
    NEAR_MISS_MIN_LISTED_AMOUNT,
    RECURRENCE_MIN_OBSERVATIONS,
)
from .near_misses import build_near_miss
from .models import (
    NearMiss,
    CashFeatures,
    ConfidenceSupport,
    FeeFeatures,
    FinancialFeatureSnapshot,
    MerchantFeature,
)
from .periods import completed_months
from .recurrence_rules import matches_plausible_recurring_interval
from .growth_materiality import GROWTH_MATERIALITY, assess_category_growth
from .service import (
    CONVENIENCE_FOOD_CATEGORIES,
    ESSENTIAL_SPENDING_CATEGORIES,
    TRANSPORT_CATEGORIES,
)

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

    near_misses: list[NearMiss] = []
    # Duplicates are judged first: a merchant whose same-day pair is raised as a
    # duplicate is not also reported as a recurring payment.
    duplicate_findings = _duplicate_leaks(snapshot, observations, near_misses)
    raised_duplicate_merchants = {
        key
        for leak in duplicate_findings
        if isinstance(key := leak.evidence.get("merchant_key"), str)
    }
    findings = [
        *_bank_fee_leaks(snapshot, observations, near_misses),
        *_recurring_leaks(snapshot, observations, near_misses, raised_duplicate_merchants),
        *_duplicate_streaming_leaks(snapshot, observations),
        *_overlapping_cover_leaks(snapshot, observations),
        *_gambling_spending_leaks(snapshot, observations),
        *_high_cost_credit_leaks(snapshot, observations),
        *_short_term_lender_leaks(snapshot, _claimed_credit_merchants(snapshot)),
        *_pass_through_leaks(snapshot),
        *_penalty_fee_leaks(snapshot),
        *_recurring_transfer_leaks(snapshot),
        *_inactive_recurring_leaks(snapshot, near_misses),
        *_irregular_transaction_leaks(snapshot),
        *_spending_escalation_leaks(snapshot, observations, near_misses),
        *(category_findings := _category_leaks(snapshot, observations)),
        *_sustained_habit_leaks(snapshot, category_findings),
        *_short_history_topup_leaks(snapshot, category_findings),
        *_coffee_spending_leaks(snapshot, observations),
        *_convenience_store_leaks(snapshot, observations),
        *_weekend_spending_leaks(snapshot, observations),
        *_payday_spending_leaks(snapshot, observations),
        *_cash_leaks(snapshot, observations),
        *duplicate_findings,
        *_duplicate_debit_order_leaks(snapshot, observations),
        *_trial_conversion_leaks(snapshot),
        *_unidentified_recurring_leaks(snapshot),
    ]
    deduplicated = {finding.fingerprint: finding for finding in findings}
    return _result(
        snapshot,
        sorted(deduplicated.values(), key=lambda item: (-item.confidence, item.leak_id)),
        _ranked_near_misses([*snapshot.near_misses, *near_misses]),
    )


# Everyday shopping the customer moves between stores. A store that goes quiet
# because they shop elsewhere is not a commitment that lapsed.
_EVERYDAY_SHOPPING_CATEGORIES = frozenset(
    {
        "groceries",
        "fuel",
        "restaurants",
        "fast food",
        "coffee",
        "shopping",
        "ride hailing",
        "public transport",
        "transport",
        "gambling",
        "cash withdrawal",
        "cash withdrawals",
        "atm cash withdrawal",
    }
)


def _is_everyday_shopping_merchant(merchant: MerchantFeature) -> bool:
    """True when the merchant is everyday retail and was never paid by debit order."""
    if merchant.debit_order_transaction_count >= 1:
        return False
    counts = merchant.merchant_category_transaction_count
    if not counts:
        return False
    dominant = max(counts, key=lambda name: counts[name])
    return dominant.strip().lower() in _EVERYDAY_SHOPPING_CATEGORIES


def _inactive_recurring_leaks(
    snapshot: FinancialFeatureSnapshot,
    misses: list[NearMiss] | None = None,
) -> list[LeakDetection]:
    """Report a missed expected charge as a review cue, never as cancellation/resolution."""
    if snapshot.date_end is None:
        return []
    findings: list[LeakDetection] = []
    for merchant in snapshot.merchants:
        if _is_everyday_shopping_merchant(merchant):
            continue
        recurrence = merchant.recurrence
        interval = recurrence.median_interval_days or recurrence.average_interval_days
        amount = recurrence.average_amount
        last_date = merchant.merchant_last_transaction_date
        # Two charges and then silence: worth explaining, but too little to call it missing.
        if (
            misses is not None
            and recurrence.recurrence_strength in {"medium", "high"}
            and recurrence.observation_count == 2
            and amount is not None
            and last_date is not None
            and is_reliable_merchant_display_name(merchant.merchant_name)
            and (
                merchant.debit_order_transaction_count >= 1
                or merchant.merchant_category_transaction_count.get("Subscriptions", 0) >= 2
            )
            and (
                snapshot.account_observation_end.get(
                    merchant.last_account_id or "", snapshot.date_end
                )
                - last_date
            ).days
            > 60
        ):
            misses.append(
                build_near_miss(
                    "inactive_recurring_payment_leak",
                    "missing_needs_three_charges",
                    merchant=merchant.merchant_name,
                    amount=amount,
                    dates=[last_date],
                )
            )
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
        # Judge absence only as far as the account that was being charged is
        # covered by uploaded statements: an account whose statements stop
        # earlier than another's has simply not been seen since.
        observed_until = snapshot.account_observation_end.get(
            merchant.last_account_id or "", snapshot.date_end
        )
        days_since = (observed_until - last_date).days
        window = max(30, int(interval * Decimal("1.6")))
        if days_since <= window:
            # Only a payment that is a few days from being flagged is a near miss.
            if misses is not None and days_since >= window - 14 and days_since > 0:
                misses.append(
                    build_near_miss(
                        "inactive_recurring_payment_leak",
                        "still_within_expected_window",
                        merchant=merchant.merchant_name,
                        amount=amount,
                        dates=[last_date],
                        detail=f"Last charged {days_since} days ago; flagged after {window}.",
                    )
                )
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


MAX_NEAR_MISSES_PER_TYPE = 8
MAX_NEAR_MISSES = 40


def _ranked_near_misses(misses: list[NearMiss]) -> list[NearMiss]:
    """Largest first, each look-alike once, a few per rule so one rule cannot crowd out the rest."""
    seen: set[tuple] = set()
    per_type: dict[str, int] = {}
    kept: list[NearMiss] = []
    for item in sorted(misses, key=lambda m: (-m.amount, m.merchant or "", m.dates, m.reason_code)):
        key = (item.leak_type, item.merchant, item.amount, tuple(item.dates), item.reason_code)
        if key in seen or per_type.get(item.leak_type, 0) >= MAX_NEAR_MISSES_PER_TYPE:
            continue
        seen.add(key)
        per_type[item.leak_type] = per_type.get(item.leak_type, 0) + 1
        kept.append(item)
    return kept[:MAX_NEAR_MISSES]


def _result(
    snapshot: FinancialFeatureSnapshot,
    leaks: list[LeakDetection],
    near_misses: list[NearMiss] | None = None,
) -> LeakDetectionResult:
    return LeakDetectionResult(
        user_id=snapshot.user_id,
        transaction_count=snapshot.transaction_count,
        period_start=snapshot.date_start,
        period_end=snapshot.date_end,
        detector_version=DETECTOR_VERSION,
        leaks=leaks,
        near_misses=near_misses or [],
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
    misses: list[NearMiss] | None = None,
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
        fee_total = snapshot.spending_profile.bank_fee_total
        if misses is not None and fees.bank_fee_transaction_count >= 1 and fee_total:
            if fees.bank_fee_transaction_count < 2:
                code, detail = "single_fee", None
            elif monthly_average is None:
                code, detail = "no_full_month", None
            elif monthly_average < MIN_IMPACT and not typed_burden:
                code, detail = "fees_too_small", f"About R{monthly_average:.2f} a month."
            else:
                code, detail = "fees_below_trigger", f"About R{monthly_average:.2f} a month."
            misses.append(
                build_near_miss(
                    "bank_fee_leak",
                    code,
                    amount=fee_total,
                    dates=[snapshot.date_end] if snapshot.date_end else [],
                    detail=detail,
                )
            )
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
        "top_fee_sources": fees.top_fee_sources,
        "fee_sources": fees.fee_sources,
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
    # Interest and penalty charges follow a debt or an overdrawn balance, so
    # they are reported as what was paid, not projected as a yearly cost.
    borrowing_cost = interest_burden or overdraft_burden or insufficient_funds_burden
    completed_count = Decimal(max(1, len(completed_months(snapshot))))
    annual_estimate: Decimal | None = annual_basis * Decimal("12")
    if borrowing_cost:
        evidence["observed_total_paid"] = typed_total
        evidence["impact_basis"] = "observed_history"
        # The finding is about this one charge, so its monthly figure is that
        # charge's own average, not the average of every fee on the account.
        impact = (typed_total / completed_count).quantize(Decimal("0.01"))
        annual_estimate = None
    else:
        borrowing_total = (
            (fees.interest_charge_total or Decimal("0"))
            + (fees.overdraft_fee_total or Decimal("0"))
            + (fees.insufficient_funds_fee_total or Decimal("0"))
        )
        if borrowing_total > 0:
            # Debt costs stop when the debt does; they are never projected forward.
            evidence["borrowing_cost_total_paid"] = borrowing_total
            evidence["borrowing_costs_excluded_from_annual_estimate"] = True
            remaining = annual_basis - borrowing_total / completed_count
            annual_estimate = remaining * Decimal("12") if remaining >= MIN_IMPACT else None
    return [
        _leak(
            snapshot=snapshot,
            leak_type="bank_fee_leak",
            subject="bank-fees",
            title=title,
            description=description,
            monthly_impact=impact,
            annual_impact=annual_estimate,
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


def _series_price_step(merchant, recurrence) -> dict[str, Decimal] | None:
    """A regular charge that was followed, one billing cycle later, by a higher amount.

    A plan upgrade (more storage, a bigger tier) bills on the same day each month at a new
    price, so it appears about one cycle after the last old-price charge and stays the
    merchant's latest charge. A different purchase at the same merchant (a gadget, an app)
    does not land one cycle later. Timing is the only evidence the statements give, so a
    step is reported as a possible plan change for the customer to confirm.
    """
    latest_date = merchant.merchant_last_transaction_date
    latest_amount = merchant.recurrence.latest_amount
    typical = recurrence.typical_amount
    series_last = recurrence.last_date
    if None in (latest_date, latest_amount, typical, series_last) or typical <= 0:
        return None
    if latest_amount <= typical * (Decimal("1") + Decimal("0.08")):
        return None
    gap = (latest_date - series_last).days
    low, high = MONTHLY_GAP_DAYS
    if not low <= gap <= high:
        return None
    return {"first_amount": typical, "latest_amount": latest_amount}


def _recurrence_diagnostic(recurrence) -> str | None:
    """The measured numbers behind a failed steady-pattern test, so a rule can be tuned.

    Medium recurrence needs gaps within 35% of their average and amounts within 25%.
    """
    average_interval = recurrence.average_interval_days
    average_amount = recurrence.average_amount
    if not average_interval or not average_amount:
        return None
    interval_spread = (recurrence.interval_variance or Decimal("0")).sqrt() / average_interval
    amount_spread = (recurrence.amount_variance or Decimal("0")).sqrt() / average_amount
    text = (
        f"{recurrence.observation_count} charges; gaps average {average_interval:.0f} days and "
        f"vary by {interval_spread:.0%} (steady is up to 35%); "
        f"amounts vary by {amount_spread:.0%} (up to 25%); "
        f"{len(recurrence.observed_amounts)} different amounts."
    )
    if recurrence.series_note:
        text += f" No amount repeats on a steady cycle. Most repeated: {recurrence.series_note}."
    return text


def _recurring_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
    misses: list[NearMiss] | None = None,
    raised_duplicate_merchants: set[str] | None = None,
) -> list[LeakDetection]:
    findings = []
    recurring_observations = observations.get("recurring_payment_pattern", [])
    price_observations = observations.get("price_increase_pattern", [])
    frequency_observations = observations.get("frequency_change_pattern", [])
    # Only suppress recurring when a same-day duplicate is actually raised for the
    # merchant. A candidate the duplicate rules rejected (different descriptions, a
    # refund nearby) must not also hide a genuine subscription: nothing would be
    # reported at all. Adjacent-day repeats never block subscription detection.
    duplicate_merchants = {
        candidate.merchant_name
        for candidate in snapshot.duplicate_candidates
        if candidate.transaction_dates
        and (
            (
                (max(candidate.transaction_dates) - min(candidate.transaction_dates)).days == 0
                and (
                    raised_duplicate_merchants is None
                    or candidate.merchant_name in raised_duplicate_merchants
                )
            )
            or (
                candidate.is_debit_order
                and 0 <= candidate.billing_date_shift_days <= DEBIT_ORDER_MONTHLY_DUPLICATE_MAX_SHIFT_DAYS
                and candidate.recurring_debit_order_months >= 2
                and candidate.recurring_debit_order_count >= 3
                and not candidate.nearby_reversal_or_refund
            )
        )
    }
    # Betting operators and credit providers are reported by their own
    # detectors, so the generic recurring finding would only repeat them.
    credit_merchants = _claimed_credit_merchants(snapshot)

    def merchant_series():
        for item in snapshot.merchants:
            yield item, None
            for extra in item.extra_subscription_series:
                if extra.typical_amount is not None:
                    yield (
                        item.model_copy(
                            update={"subscription_recurrence": extra, "extra_subscription_series": []}
                        ),
                        extra.typical_amount,
                    )

    for merchant, series_amount in merchant_series():
        if is_gambling_merchant(merchant.merchant_name) or merchant.merchant_name in credit_merchants:
            continue
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
        required_charges = 2 if is_subscription and merchant.debit_order_transaction_count < 2 else 3
        # A merchant is only worth explaining when it is a subscription or almost a
        # regular payer; most merchants are one-offs and would only add noise.
        # Repeat shopping at a supermarket is not a bill, so a merchant needs a debit
        # order behind it to count as "almost a regular payer".
        worth_explaining = is_subscription or (
            merchant.debit_order_transaction_count >= 1
            and recurrence.recurrence_strength in {"medium", "high"}
            and recurrence.observation_count >= 2
        )
        near_miss_amount = recurrence.typical_amount or recurrence.average_amount

        def miss(code: str, detail: str | None = None, amount: Decimal | None = None) -> None:
            shown = amount if amount is not None else near_miss_amount
            # A further series is judged by the same rules but is not listed twice.
            if misses is None or not worth_explaining or shown is None or series_amount is not None:
                return
            last_charge = merchant.merchant_last_transaction_date
            misses.append(
                build_near_miss(
                    "subscription_leak" if is_subscription else "recurring_payment_leak",
                    code,
                    merchant=merchant.merchant_name,
                    amount=shown,
                    dates=[last_charge] if last_charge else [],
                    detail=detail,
                )
            )

        if recurrence.recurrence_strength not in {"medium", "high"}:
            miss("recurrence_not_established", _recurrence_diagnostic(recurrence))
            continue
        # Two card/subscription charges can be a low-history candidate.
        # Two debit orders remain below the stronger debit-order evidence
        # threshold because a mandate may have been imported only once.
        if recurrence.observation_count < required_charges:
            miss(
                "too_few_charges",
                f"{recurrence.observation_count} seen; {required_charges} are needed.",
            )
            continue
        if not matches_plausible_recurring_interval(interval):
            miss("interval_not_billing_like")
            continue
        if support_ratio(merchant.confidence_support) < Decimal("0.60"):
            miss("merchant_not_confident")
            continue
        if merchant.merchant_name in duplicate_merchants:
            miss("handled_as_duplicate")
            continue
        if _is_app_store_billing_merchant(merchant.merchant_name) and not _is_monthly_billing_interval(
            interval
        ):
            miss("app_store_not_monthly")
            continue
        # Price and frequency signals are read from all of a merchant's charges. A series
        # chosen for its one steady amount has no price rise of its own: a different
        # purchase at the same merchant is not a rise in this plan.
        merchant_wide_signals = recurrence.basis != "dominant_amount"
        price_obs = (
            _matching_recurring_price_observation(price_observations, merchant.merchant_name)
            if merchant_wide_signals
            else None
        )
        # A step to a higher amount one billing cycle after the regular charge is a
        # possible plan change; it is the one price signal a stable series can carry.
        price_step = (
            _series_price_step(merchant, recurrence) if not merchant_wide_signals else None
        )
        # After a price rise the current price is what is being charged now,
        # not the median of the old and new prices.
        typical = recurrence.typical_amount or recurrence.average_amount
        current_price = (
            recurrence.latest_amount
            if price_obs is not None
            and recurrence.latest_amount is not None
            and typical is not None
            and recurrence.latest_amount > typical
            else None
        )
        if price_step is not None:
            current_price = price_step["latest_amount"]
        elif current_price is None and typical is not None:
            # A lower price held for the last two charges is what is being paid now.
            trend = merchant.merchant_amount_trend
            if (
                trend is not None
                and trend.latest_amount is not None
                and trend.previous_amount is not None
                and trend.latest_amount < typical
                and abs(trend.latest_amount - trend.previous_amount) <= AMOUNT_TOLERANCE
            ):
                current_price = trend.latest_amount
        impact = _recurring_monthly_impact(
            merchant, recurrence=recurrence, amount=current_price
        )
        if impact is None or impact < MIN_IMPACT:
            if impact is not None:
                miss("below_minimum_impact", f"About R{impact:.2f} a month.", amount=impact)
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
            miss("spending_habit", amount=impact)
            continue
        # Several mandates at one merchant (two policies, a loan and a policy)
        # are separate commitments. Their total is reported as a commitment on
        # the recurring-payment observation; it is not an amount lost, and
        # nothing here shows any one of them to be a duplicate or unwanted.
        if debit_order_review and not is_subscription and merchant.parallel_mandate_amounts:
            miss("parallel_mandates", amount=impact)
            continue
        is_unknown = not categories or set(categories).issubset({"Other"})
        reliable_merchant = is_reliable_merchant_display_name(merchant.merchant_name)
        average_amount = current_price or recurrence.typical_amount or recurrence.average_amount
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
            first_price = _decimal(price_obs.evidence.get("first_amount")) if price_obs else None
            latest_price = _decimal(price_obs.evidence.get("latest_amount")) if price_obs else None
            if first_price is not None and latest_price is not None and latest_price > first_price:
                description = (
                    f"This regular payment rose from {format_zar(first_price)} to "
                    f"{format_zar(latest_price)}. That is what the statements show; they do not "
                    "show whether the increase was agreed or is in your contract."
                )
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
            miss("confidence_too_low", amount=impact)
            continue
        frequency_obs = (
            _matching_observation(frequency_observations, merchant.merchant_name)
            if merchant_wide_signals
            else None
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
        signal = _recurring_signal_evidence(price_obs, frequency_obs, interval)
        if price_step is not None:
            signal.update(_price_rise_impact(price_step, interval))
            signal.update(
                {
                    "price_change_focus": "plan_step_up",
                    "first_amount": price_step["first_amount"],
                    "latest_amount": price_step["latest_amount"],
                    "plan_change_possible": True,
                    "plan_change_note": (
                        "The regular charge was followed one billing cycle later by a higher "
                        "amount. If you changed plan on purpose (more storage, a bigger tier), "
                        "this is your own upgrade; the statements cannot tell."
                    ),
                }
            )
        # The cost of the service is not the cost of the rise. When a rise is
        # established, the finding's impact is the rise; the service cost stays
        # in evidence as context and is never added to it.
        service_cost = impact
        rise = signal.get("price_increase_monthly")
        headline_is_increase = (
            isinstance(rise, Decimal)
            and rise >= MIN_IMPACT
            and not signal.get("promotional_start_possible")
            and not weak_commitment
        )
        if headline_is_increase:
            impact = rise
        # Say so when the cadence was read across a gap or past an introductory price.
        if recurrence.missed_cycle_count:
            signal["missed_cycle_count"] = recurrence.missed_cycle_count
        if recurrence.introductory_amount is not None:
            signal["introductory_amount"] = recurrence.introductory_amount
        signal["service_cost_monthly"] = service_cost
        if recurrence.basis == "dominant_amount":
            # Said plainly: the cost is the regular charge, not the other charges.
            signal["recurrence_basis"] = "dominant_amount"
            signal["recurrence_basis_note"] = (
                "Read from the regular charge only. Other charges from this merchant, in "
                "different amounts, are not counted in this cost."
            )
            if recurrence.other_regular_amounts:
                signal["other_regular_amounts"] = list(recurrence.other_regular_amounts)
        signal["headline_impact_basis"] = (
            "price_increase" if headline_is_increase else "recurring_cost"
        )
        if recurrence.basis == "dominant_amount" and recurrence.typical_amount is not None:
            # The finding's own charges, so its evidence is not every charge at the merchant.
            signal["series_amount"] = recurrence.typical_amount
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                # A further regular amount is its own finding, with its own identity.
                subject=(
                    merchant.merchant_name
                    if series_amount is None
                    else f"{merchant.merchant_name} {series_amount:.2f}"
                ),
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
                    "merchant_category": max(categories, key=categories.get) if categories else None,
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
                    **signal,
                },
                behaviour_ids=supporting_ids,
                feature_refs=[
                    f"merchants[{merchant.merchant_name}].recurrence",
                    f"merchants[{merchant.merchant_name}].confidence_support",
                ],
            )
        )
    return findings


# An overall rise is not believable when this much of the money behind it is unidentified.
UNIDENTIFIED_SPEND_MAX_SHARE = Decimal("0.30")
# The merchants named as the cause must account for at least this share of the rise.
ESCALATION_MIN_EXPLAINED_SHARE = Decimal("0.25")


def _unidentified_share(snapshot: FinancialFeatureSnapshot, months: list[str]) -> Decimal:
    wanted = set(months)
    chosen = [month for month in snapshot.months if month.month in wanted]
    outflow = sum((month.total_outflow for month in chosen), Decimal("0"))
    if outflow <= 0:
        return Decimal("0")
    return sum((month.unclassified_outflow for month in chosen), Decimal("0")) / outflow


ESCALATION_ONE_OFF_SHARE = Decimal("0.60")
ESCALATION_BROAD_EXTRA_TRANSACTIONS = 3
ESCALATION_STEP_CHANGE_PERCENT = Decimal("35")


def _rise_is_one_month_blip(
    snapshot: FinancialFeatureSnapshot,
    observation: BehaviourObservation,
) -> bool:
    """True when only the latest month is up: ordinary variation until a second month agrees.

    A rise of ``ESCALATION_STEP_CHANGE_PERCENT`` or more is a step change and does not wait.
    """
    current = observation.evidence.get("current_period")
    baseline = [str(m) for m in (observation.evidence.get("baseline_months") or [])]
    percent = _decimal(observation.evidence.get("change_percentage"))
    if not isinstance(current, str) or len(baseline) < 2:
        return False
    if percent is not None and percent >= ESCALATION_STEP_CHANGE_PERCENT:
        return False
    if _rise_is_broad(snapshot, current, baseline):
        return False
    totals = {month.month: month.total_outflow for month in snapshot.months}
    previous = baseline[-1]
    earlier = [totals.get(m, Decimal("0")) for m in baseline[:-1]]
    if previous not in totals or not earlier:
        return False
    usual = sum(earlier, Decimal("0")) / Decimal(len(earlier))
    # The month before was also meaningfully above the months before it.
    return not (usual > 0 and totals[previous] >= usual * Decimal("1.10"))


def _rise_is_one_large_purchase(
    snapshot: FinancialFeatureSnapshot,
    observation: BehaviourObservation,
    change: Decimal,
) -> bool:
    """True when one purchase, not wider spending, is most of an overall rise.

    A single big shop or bill makes one month higher than the average of the others,
    but spending has not escalated: nothing about next month is different.
    """
    current = observation.evidence.get("current_period")
    baseline = [str(m) for m in (observation.evidence.get("baseline_months") or [])]
    if not isinstance(current, str) or not baseline or change <= 0:
        return False
    biggest_rise = Decimal("0")
    biggest_category_count = 0
    for category in snapshot.categories:
        largest = category.category_monthly_max_amount
        if current not in largest:
            continue
        usual = sum((largest.get(month, Decimal("0")) for month in baseline), Decimal("0")) / Decimal(
            len(baseline)
        )
        if largest[current] - usual > biggest_rise:
            biggest_rise = largest[current] - usual
            biggest_category_count = category.category_monthly_transaction_count.get(current, 0)
    if biggest_rise / change < ESCALATION_ONE_OFF_SHARE:
        return False
    # With a single purchase a month in that category there is nothing to single out:
    # a rising monthly purchase is a trend, not a one-off.
    if biggest_category_count < 2:
        return False
    return not _rise_is_broad(snapshot, current, baseline)


def _rise_is_broad(snapshot: FinancialFeatureSnapshot, current: str, baseline: list[str]) -> bool:
    """True when the latest month has several more purchases than usual."""
    by_month = {month.month: month for month in snapshot.months}
    in_baseline = [m for m in baseline if m in by_month]
    if current not in by_month or not in_baseline:
        return False
    usual_count = sum(
        (Decimal(by_month[m].outflow_transaction_count) for m in in_baseline), Decimal("0")
    ) / Decimal(len(in_baseline))
    extra = Decimal(by_month[current].outflow_transaction_count) - usual_count
    return extra >= ESCALATION_BROAD_EXTRA_TRANSACTIONS


def _spending_escalation_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
    misses: list[NearMiss] | None = None,
) -> list[LeakDetection]:
    findings = []
    overall_support = _snapshot_support_ratio(snapshot)
    if overall_support < Decimal("0.60"):
        return findings
    for observation in observations.get("spending_increase", []):
        change = _decimal(observation.evidence.get("change_amount"))
        if change is None or change < MIN_IMPACT:
            continue
        compared = [
            str(value)
            for value in [
                observation.evidence.get("current_period"),
                *(observation.evidence.get("baseline_months") or []),
            ]
            if value
        ]
        if _unidentified_share(snapshot, compared) >= UNIDENTIFIED_SPEND_MAX_SHARE:
            if misses is not None:
                misses.append(
                    build_near_miss(
                        "spending_escalation_leak",
                        "mostly_unidentified",
                        amount=change,
                        dates=[snapshot.date_end] if snapshot.date_end else [],
                    )
                )
            continue
        for reason_check, detail in (
            (_rise_is_one_month_blip(snapshot, observation), "Spending was higher for one month only."),
            (
                _rise_is_one_large_purchase(snapshot, observation, change),
                "One large purchase accounts for most of the rise.",
            ),
        ):
            if reason_check:
                if misses is not None:
                    misses.append(
                        build_near_miss(
                            "spending_escalation_leak",
                            "cause_not_identified",
                            amount=change,
                            dates=[snapshot.date_end] if snapshot.date_end else [],
                            detail=detail,
                        )
                    )
                break
        else:
            reason_check = False
        if reason_check:
            continue
        confidence = min(observation.confidence, 0.80)
        contributors = _spending_contributor_breakdown(snapshot, observation)
        merchant_contributors = contributors.get("top_merchant_contributors") or []
        explained = sum(
            (
                _decimal(item.get("share_of_overall_change")) or Decimal("0")
                for item in merchant_contributors
                if isinstance(item, dict)
            ),
            Decimal("0"),
        )
        if merchant_contributors and explained < ESCALATION_MIN_EXPLAINED_SHARE:
            # The named merchants account for a sliver of the rise. Reporting it as a
            # spending problem would blame spending for money that went elsewhere.
            if misses is not None:
                misses.append(
                    build_near_miss(
                        "spending_escalation_leak",
                        "cause_not_identified",
                        amount=change,
                        dates=[snapshot.date_end] if snapshot.date_end else [],
                        detail=f"The merchants behind it explain {explained * 100:.0f}% of the rise.",
                    )
                )
            continue
        attributed = bool(merchant_contributors)
        if not attributed:
            # No merchant can be tied to the increase, so no transactions can be
            # shown for it. Say less rather than imply a cause.
            confidence = min(confidence, 0.60)
        contributors = {
            **contributors,
            "increase_attribution": "merchant_rows" if attributed else "insufficient",
            "increase_calculation": _escalation_calculation(observation),
        }
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
                monthly_impact=change.quantize(Decimal("0.01")),
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
        # Delivery-only categories are judged by their own purchase-count rules above;
        # ride-hailing, like the rest, must also clear the general materiality bar, so
        # a few rides at irregular amounts are not read as a growing dependency.
        materiality = None if feature.food_delivery_only else GROWTH_MATERIALITY.get(leak_type)
        assessment = None
        if materiality is not None:
            assessment = assess_category_growth(
                feature,
                [str(item) for item in observation.evidence.get("baseline_months") or []],
                str(observation.evidence.get("current_period")),
                materiality,
                essential=category in ESSENTIAL_SPENDING_CATEGORIES,
            )
            if not assessment.passes:
                # Ordinary movement in spending: noted by the behaviour layer, not a finding.
                continue
        confidence = min(observation.confidence, 0.78)
        pattern_evidence = _category_spend_pattern_evidence(
            snapshot, category, observation
        )
        evidence = {
            **_escalation_evidence(observation),
            **(
                {
                    "growth_materiality_basis": assessment.basis,
                    "growth_materiality_metrics": dict(assessment.metrics),
                }
                if assessment is not None
                else {}
            ),
            # A change in spending is an observation to review, never a confirmed loss.
            "growth_is_not_a_confirmed_loss": True,
            "category_name": category,
            "category_transaction_count": feature.category_transaction_count,
            "classification_support_ratio": support_ratio(feature.confidence_support),
            "amounts_not_additive_with_overall_escalation": True,
            "annual_impact_omitted_reason": "single_period_estimated_change",
            "finding_kind": "potential_leak",
            "increase_calculation": _escalation_calculation(observation).replace(
                "the merchants whose own spend rose", f"the {category} rows in those months"
            ),
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


# Steady habits that escalation-only detection never sees. Each entry:
# (leak type, title, description, minimum monthly average in rand).
_HABIT_CATEGORIES: dict[str, tuple[LeakType, str, str, Decimal]] = {
    "Airtime & Data": (
        "airtime_data_leak",
        "Potential frequent airtime and data top-ups",
        "Airtime and data were bought many times each month. Several small top-ups, "
        "each with its own fee, can cost more than fewer larger purchases or a bundle.",
        Decimal("100"),
    ),
    "Fast Food": (
        "food_spending_leak",
        "Potential recurring food delivery and fast food spending",
        "Food delivery and fast food purchases repeated every month at a material amount.",
        Decimal("150"),
    ),
    "Ride Hailing": (
        "transport_spending_leak",
        "Potential recurring ride-hailing spending",
        "Ride-hailing trips repeated every month at a material amount.",
        Decimal("150"),
    ),
}
HABIT_MIN_MONTHS = 2
HABIT_MIN_MONTHLY_TRANSACTIONS = Decimal("3")
HABIT_MIN_TRANSACTIONS = 8


def _sustained_habit_leaks(
    snapshot: FinancialFeatureSnapshot,
    category_findings: list[LeakDetection],
) -> list[LeakDetection]:
    """Flag spending that repeats at a material level every completed month.

    Escalation detectors need a month-on-month rise, so a flat but heavy habit
    never reaches them. This detector uses only completed months, requires the
    same category in every one of them, and skips categories that already have
    an escalation finding so one habit is reported once.
    """
    months = {month.month for month in completed_months(snapshot)}
    if len(months) < HABIT_MIN_MONTHS:
        return []
    already = {
        item.evidence.get("category_name") for item in category_findings
    }
    findings: list[LeakDetection] = []
    for feature in snapshot.categories:
        definition = _HABIT_CATEGORIES.get(feature.category_name)
        if definition is None or feature.category_name in already:
            continue
        leak_type, title, description, minimum_monthly = definition
        totals = {m: feature.category_monthly_total.get(m, Decimal("0")) for m in months}
        counts = {m: feature.category_monthly_transaction_count.get(m, 0) for m in months}
        # Every month, or all but one quiet month (a holiday) once there are four or more.
        active_months = sum(1 for total in totals.values() if total > 0)
        if active_months < max(HABIT_MIN_MONTHS, -(-3 * len(months) // 4)):
            continue
        month_count = Decimal(len(months))
        total_amount = sum(totals.values(), Decimal("0"))
        total_count = sum(counts.values())
        monthly_average = (total_amount / month_count).quantize(Decimal("0.01"))
        if (
            total_count < HABIT_MIN_TRANSACTIONS
            or Decimal(total_count) / month_count < HABIT_MIN_MONTHLY_TRANSACTIONS
            or monthly_average < minimum_monthly
            or support_ratio(feature.confidence_support) < Decimal("0.60")
        ):
            continue
        confidence = leak_confidence(
            support=feature.confidence_support,
            observation_count=total_count,
            pattern_strength=Decimal("0.70"),
            ceiling=Decimal("0.72"),
        )
        if confidence is None:
            continue
        evidence: dict[str, object] = {
            "category_name": feature.category_name,
            "finding_focus": "sustained_habit",
            "completed_month_count": len(months),
            "category_transaction_count": total_count,
            "category_total_amount": total_amount,
            "monthly_average_spend": monthly_average,
            "monthly_average_transactions": (Decimal(total_count) / month_count).quantize(Decimal("0.1")),
            "average_transaction_amount": (total_amount / Decimal(total_count)).quantize(Decimal("0.01")),
            "monthly_totals": {m: totals[m] for m in sorted(totals)},
            "classification_support_ratio": support_ratio(feature.confidence_support),
            "finding_kind": "potential_leak",
        }
        if leak_type == "airtime_data_leak" and snapshot.fees.vas_fee_total:
            evidence["vas_fee_total"] = snapshot.fees.vas_fee_total
            evidence["vas_fee_count"] = snapshot.fees.vas_fee_count
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type=leak_type,
                subject=f"habit:{feature.category_name}",
                title=title,
                description=description,
                monthly_impact=monthly_average,
                annual_impact=monthly_average * Decimal("12"),
                impact_kind="recurring",
                confidence=confidence,
                severity=severity_for_impact(monthly_average, persistent=True, confidence=confidence),
                evidence=evidence,
                behaviour_ids=[],
                feature_refs=[f"categories[{feature.category_name}].category_monthly_total"],
            )
        )
    return findings


SHORT_HISTORY_MIN_DAYS = 28
SHORT_HISTORY_TOPUP_MIN_COUNT = 10
SHORT_HISTORY_TOPUP_MAX_AVERAGE = Decimal("100")
SHORT_HISTORY_TOPUP_MIN_MONTHLY = Decimal("100")


def _short_history_topup_leaks(
    snapshot: FinancialFeatureSnapshot,
    category_findings: list[LeakDetection],
) -> list[LeakDetection]:
    """Many small airtime top-ups seen over weeks, before two full months exist.

    The habit rule needs two completed months. A statement of a month and a half can
    already show a dozen R10-R20 top-ups, each with its own fee.
    """
    if len(completed_months(snapshot)) >= HABIT_MIN_MONTHS:
        return []
    if snapshot.date_start is None or snapshot.date_end is None:
        return []
    span_days = (snapshot.date_end - snapshot.date_start).days + 1
    if span_days < SHORT_HISTORY_MIN_DAYS:
        return []
    if any(item.evidence.get("category_name") == "Airtime & Data" for item in category_findings):
        return []
    feature = next((item for item in snapshot.categories if item.category_name == "Airtime & Data"), None)
    if feature is None or support_ratio(feature.confidence_support) < Decimal("0.60"):
        return []
    total_count = sum(feature.category_monthly_transaction_count.values())
    total_amount = sum(feature.category_monthly_total.values(), Decimal("0"))
    if total_count < SHORT_HISTORY_TOPUP_MIN_COUNT or total_amount <= 0:
        return []
    average = total_amount / Decimal(total_count)
    monthly = (total_amount * Decimal("30.44") / Decimal(span_days)).quantize(Decimal("0.01"))
    if average > SHORT_HISTORY_TOPUP_MAX_AVERAGE or monthly < SHORT_HISTORY_TOPUP_MIN_MONTHLY:
        return []
    confidence = leak_confidence(
        support=feature.confidence_support,
        observation_count=total_count,
        pattern_strength=Decimal("0.60"),
        ceiling=Decimal("0.68"),
    )
    if confidence is None:
        return []
    fee_total = next(
        (
            row["total"]
            for row in snapshot.fees.fee_sources
            if row.get("key") == "airtime" and isinstance(row.get("total"), Decimal)
        ),
        None,
    )
    evidence: dict[str, object] = {
        "category_name": "Airtime & Data",
        "finding_focus": "frequent_small_topups",
        "finding_kind": "potential_leak",
        "category_transaction_count": total_count,
        "category_total_amount": total_amount,
        "average_transaction_amount": average.quantize(Decimal("0.01")),
        "monthly_average_spend": monthly,
        "history_days": span_days,
        "short_history": True,
        "classification_support_ratio": support_ratio(feature.confidence_support),
    }
    if fee_total is not None:
        evidence["airtime_fee_total"] = fee_total
    return [
        _leak(
            snapshot=snapshot,
            leak_type="airtime_data_leak",
            subject="habit:Airtime & Data",
            title="Potential frequent small airtime top-ups",
            description=(
                f"Airtime was bought {total_count} times in {span_days} days, about "
                f"{format_zar(average)} each. Each small top-up can carry its own fee, so fewer, "
                "larger purchases or a bundle can cost less. This is a pattern over a short "
                "period, not a confirmed loss."
            ),
            monthly_impact=monthly,
            annual_impact=None,
            impact_kind="estimated",
            confidence=confidence,
            severity=severity_for_impact(monthly, persistent=False, confidence=confidence),
            evidence=evidence,
            behaviour_ids=[],
            feature_refs=["categories[Airtime & Data].category_monthly_total"],
        )
    ]


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


def _atm_withdrawal_fee_stacking_eligible(cash: CashFeatures, months: int = 1) -> bool:
    """Fees stack when the customer takes cash out in several small withdrawals.

    One withdrawal a month with its fee is ordinary use: there is nothing to
    consolidate. Stacking needs about two or more withdrawals a month on average.
    """
    atm_total = cash.atm_fee_total or Decimal("0")
    return (
        atm_total >= MIN_IMPACT
        and cash.atm_fee_count >= 2
        and cash.cash_withdrawal_count >= 3
        and Decimal(cash.cash_withdrawal_count) / Decimal(max(1, months)) >= Decimal("2")
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
    stacking = _atm_withdrawal_fee_stacking_eligible(cash, months)
    # A fee on a single monthly withdrawal is the price of getting cash, not a leak.
    fee_backed = fee_backed and Decimal(cash.cash_withdrawal_count) / Decimal(months) >= Decimal("2")
    if not fee_backed and not reliance_backed:
        return []
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


# A double charge lands seconds or minutes apart. Rows hours apart on the same
# day are two purchases (morning and evening commute, two fill-ups).
DUPLICATE_MAX_TIME_GAP_MINUTES = 30
# Without timestamps the evidence is only "same merchant, amount and day", so
# only high-value, one-off style purchases are surfaced.
DUPLICATE_UNTIMED_MIN_AMOUNT = Decimal("100")
_DUPLICATE_EXCLUDED_CATEGORIES = frozenset(
    {"transfers", "cash withdrawal", "cash withdrawals", "atm cash withdrawal", "savings", "investments"}
)
# Fixed-price, high-frequency spend where buying the same thing twice in a day
# is normal: rides, fuel, airtime and vouchers, meals and coffees, parking, tolls.
_DUPLICATE_EVERYDAY_REPEAT_MARKERS = (
    "transport",
    "fuel",
    "airtime",
    "data",
    "restaurant",
    "fast food",
    "food",
    "coffee",
    "takeaway",
    "parking",
    "toll",
    "taxi",
    "ride",
    "convenience",
    "vending",
)


def _habitual_same_day_repeat_keys(candidates: list) -> set[tuple[str, Decimal]]:
    """Merchant and amount pairs that repeat within a day on several different days."""
    days: dict[tuple[str, Decimal], set] = {}
    for candidate in candidates:
        dates = candidate.transaction_dates
        if candidate.is_debit_order or len(dates) < 2 or (max(dates) - min(dates)).days != 0:
            continue
        days.setdefault((candidate.merchant_name, candidate.amount), set()).add(dates[0])
    return {key for key, seen in days.items() if len(seen) >= 2}


def _implausible_duplicate_reason(candidate, habitual: set[tuple[str, Decimal]]) -> str | None:
    """Why a same-day group has no evidence beyond merchant, amount and day, or None."""
    category = (candidate.category_name or "").strip().casefold()
    if category in _DUPLICATE_EXCLUDED_CATEGORIES:
        return "excluded_category"
    # The same pair doubling up on several days is a routine, not an accident.
    if (candidate.merchant_name, candidate.amount) in habitual:
        return "habitual_same_day_repeat"
    if candidate.max_time_gap_minutes is not None:
        if candidate.max_time_gap_minutes <= DUPLICATE_MAX_TIME_GAP_MINUTES:
            return None
        return "hours_apart"
    if candidate.shared_reference_tokens:
        return None
    if len(candidate.transaction_dates) != 2:
        return "untimed_group_size"
    if candidate.amount < DUPLICATE_UNTIMED_MIN_AMOUNT:
        return "untimed_below_minimum"
    if any(marker in category for marker in _DUPLICATE_EVERYDAY_REPEAT_MARKERS):
        return "everyday_spend"
    return None


def _is_plausible_duplicate(candidate, habitual: set[tuple[str, Decimal]]) -> bool:
    """Whether a same-day group has any evidence beyond merchant, amount and day."""
    return _implausible_duplicate_reason(candidate, habitual) is None


def _duplicate_near_miss(candidate, code: str) -> NearMiss:
    return build_near_miss(
        "duplicate_payment_leak",
        code,
        merchant=candidate.merchant_name,
        amount=candidate.amount,
        dates=candidate.transaction_dates,
        detail="Same-day repeats are only raised from R20." if code == "below_minimum_amount" else None,
    )


def _duplicate_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
    misses: list[NearMiss] | None = None,
) -> list[LeakDetection]:
    def miss(candidate, code: str) -> None:
        # An unrecognised payee has no merchant name to show, so it is not listed.
        if misses is None or candidate.description_signature is not None:
            return
        # A small same-day pair of rides, food or airtime is ordinary, not a near miss.
        category = (candidate.category_name or "").strip().casefold()
        if code == "untimed_below_minimum" and any(
            marker in category for marker in _DUPLICATE_EVERYDAY_REPEAT_MARKERS
        ):
            return
        if code == "below_minimum_amount" and candidate.amount < NEAR_MISS_MIN_LISTED_AMOUNT:
            return
        misses.append(_duplicate_near_miss(candidate, code))

    findings = []
    habitual = _habitual_same_day_repeat_keys(snapshot.duplicate_candidates)
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
        unidentified = candidate.description_signature is not None
        if len(dates) < 2 or (max(dates) - min(dates)).days != 0:
            continue
        if candidate.amount < Decimal("20"):
            miss(candidate, "below_minimum_amount")
            continue
        # An unrecognised payee has no classification confidence by definition.
        if high_confidence_ratio < Decimal("0.60") and not unidentified:
            miss(candidate, "merchant_not_recognised")
            continue
        # Refunds/reversals on the same day weaken the accidental-duplicate claim.
        if candidate.nearby_reversal_or_refund:
            miss(candidate, "refund_nearby")
            continue
        # With no merchant to vouch for it, only a tight timestamp pair is evidence
        # enough: two rows within minutes with the same description and amount.
        if unidentified and (
            len(dates) != 2
            or candidate.min_time_gap_minutes is None
            or candidate.min_time_gap_minutes > 15
        ):
            continue
        reason = _implausible_duplicate_reason(candidate, habitual)
        if reason is not None:
            miss(candidate, reason)
            continue
        # Divergent descriptions without a shared payment reference are weak
        # same-merchant/amount/date matches and are often intentional repeats.
        if (
            candidate.distinct_description_count > 1
            and not candidate.shared_reference_tokens
        ):
            miss(candidate, "different_descriptions")
            continue
        impact = candidate.amount * Decimal(len(dates) - 1)
        current = selected_by_merchant.get(candidate.merchant_name)
        if current is None or impact > current[0]:  # type: ignore[index]
            selected_by_merchant[candidate.merchant_name] = (impact, candidate)

    # Identical purchases a few days apart. A merchant that already has a same-day
    # finding, or any same-day candidate, keeps the same-day reading.
    same_day_merchants = {item.merchant_name for item in snapshot.duplicate_candidates}
    for candidate in snapshot.near_day_duplicate_candidates:
        dates = candidate.transaction_dates
        high_confidence_ratio = (
            Decimal(candidate.high_confidence_transaction_count) / Decimal(len(dates))
            if dates
            else Decimal("0")
        )
        if (
            candidate.merchant_name in same_day_merchants
            or candidate.merchant_name in selected_by_merchant
            or candidate.is_debit_order
            or len(dates) != 2
            or not 1 <= (max(dates) - min(dates)).days <= NEAR_DAY_DUPLICATE_MAX_DAYS
            or candidate.amount < NEAR_DAY_DUPLICATE_MIN_AMOUNT
        ):
            continue
        if high_confidence_ratio < Decimal("0.60"):
            miss(candidate, "merchant_not_recognised")
            continue
        if candidate.nearby_reversal_or_refund:
            miss(candidate, "refund_nearby")
            continue
        if candidate.distinct_description_count > 1 and not candidate.shared_reference_tokens:
            miss(candidate, "different_descriptions")
            continue
        category = (candidate.category_name or "").strip().casefold()
        if category in _DUPLICATE_EXCLUDED_CATEGORIES:
            miss(candidate, "excluded_category")
            continue
        if any(marker in category for marker in _DUPLICATE_EVERYDAY_REPEAT_MARKERS):
            miss(candidate, "everyday_spend")
            continue
        selected_by_merchant[candidate.merchant_name] = (candidate.amount, candidate)

    for impact, candidate in selected_by_merchant.values():  # type: ignore[misc]
        dates = candidate.transaction_dates
        near_day = "near_day_window" in candidate.match_basis
        unidentified = candidate.description_signature is not None
        support = (
            None
            if unidentified
            else ConfidenceSupport(
                supporting_transaction_count=len(dates),
                high_confidence_transaction_count=candidate.high_confidence_transaction_count,
                low_confidence_transaction_count=(
                    len(dates) - candidate.high_confidence_transaction_count
                ),
            )
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
        ceiling = Decimal("0.70") if close_timestamp else Decimal("0.68")
        if near_day:
            # Days apart is weaker than the same day: never stronger than "possible".
            pattern_strength = Decimal("0.44")
            ceiling = Decimal("0.60")
        confidence = leak_confidence(
            support=support,
            observation_count=len(dates),
            pattern_strength=pattern_strength,
            ceiling=ceiling,
        )
        if confidence is None:
            continue
        display_merchant = (
            candidate.merchant_name
            if not unidentified and is_reliable_merchant_display_name(candidate.merchant_name)
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
                    (
                        "Two transactions with the same merchant and amount, a few days apart, "
                        "were grouped as a duplicate candidate that requires manual verification. "
                        "Two orders or visits can look identical, and matching merchant and "
                        "amount alone does not confirm a duplicate, accidental payment, error, "
                        "or recoverable amount."
                    )
                    if near_day
                    else (
                        "Same-day transactions with the same merchant and amount were grouped as a "
                        "duplicate candidate that requires manual verification. Matching merchant, "
                        "amount and date alone does not confirm a duplicate, accidental payment, "
                        "error, or recoverable amount."
                    )
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
                    # An unrecognised payee has no merchant key; the description's own
                    # words identify the group and no merchant is named.
                    "merchant_key": None if unidentified else candidate.merchant_name,
                    **(
                        {"description_signature": candidate.description_signature}
                        if unidentified
                        else {}
                    ),
                    "candidate_amount": candidate.amount,
                    "transaction_count_in_group": len(dates),
                    "group_total": candidate.amount * Decimal(len(dates)),
                    "observed_date": dates[0].isoformat(),
                    "date_span_days": (max(dates) - min(dates)).days,
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
                behaviour_ids=[] if near_day else observation_ids,
                feature_refs=["near_day_duplicate_candidates" if near_day else "duplicate_candidates"],
            )
        )
    return findings


_VIDEO_STREAMING_PROVIDERS: dict[str, tuple[str, ...]] = {
    "netflix": ("NETFLIX",),
    "showmax": ("SHOWMAX",),
    "dstv": ("DSTV", "MULTICHOICE"),
    # Bare "DISNEY"/"HBO"/"PARAMOUNT" also match the Disney Store, HBO merchandise
    # and Paramount Pictures, none of which are streaming subscriptions.
    "disney_plus": ("DISNEY PLUS", "DISNEYPLUS", "DISNEY+"),
    "prime_video": ("PRIME VIDEO", "AMAZON PRIME"),
    "apple_tv": ("APPLE TV", "APPLE TV+"),
    "youtube_premium": ("YOUTUBE PREMIUM", "YOUTUBE"),
    "hbo_max": ("HBO MAX", "HBOMAX"),
    "paramount_plus": ("PARAMOUNT PLUS", "PARAMOUNT+", "PARAMOUNTPLUS"),
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
            or not (0 <= candidate.billing_date_shift_days <= DEBIT_ORDER_MONTHLY_DUPLICATE_MAX_SHIFT_DAYS)
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
        beyond_usual_shift = (
            candidate.billing_date_shift_days > DEBIT_ORDER_DUPLICATE_MAX_SHIFT_DAYS
        )
        pattern_strength = Decimal("0.62") if exact_same_day else Decimal("0.54")
        if candidate.shared_reference_tokens:
            pattern_strength = min(Decimal("0.68"), pattern_strength + Decimal("0.04"))
        if beyond_usual_shift:
            pattern_strength = min(pattern_strength, Decimal("0.50"))
        confidence = leak_confidence(
            support=support,
            observation_count=candidate.recurring_debit_order_count,
            pattern_strength=pattern_strength,
            ceiling=(
                Decimal("0.72")
                if exact_same_day
                else Decimal("0.60")
                if beyond_usual_shift
                else Decimal("0.66")
            ),
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
                    "date_gap_beyond_usual_shift": beyond_usual_shift,
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


def _trial_conversion_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Verification findings for a recorded trial that was followed by paid charges.

    The trial itself is only ever what a row shows (a zero-value record or trial
    wording). Whether a trial was agreed, and whether the customer meant to keep
    paying, is not in the statement, so the customer is asked.
    """
    findings: list[LeakDetection] = []
    for candidate in snapshot.trial_conversion_candidates:
        paid = candidate.paid_amounts
        typical = Decimal(str(sorted(paid)[len(paid) // 2]))
        if typical < MIN_IMPACT:
            continue
        strong = (
            candidate.trial_evidence == "zero_value_record"
            and len(paid) >= 2
            and candidate.amount_stable
            and candidate.subscription_category
        )
        confidence = leak_confidence(
            support=None,
            observation_count=len(paid) + len(candidate.trial_dates),
            pattern_strength=Decimal("0.80") if strong else Decimal("0.50"),
            ceiling=Decimal("0.74") if strong else Decimal("0.62"),
        )
        if confidence is None:
            continue
        display = (
            merchant_display_name_for(candidate.merchant_name)
            if is_reliable_merchant_display_name(candidate.merchant_name)
            else None
        ) or candidate.merchant_name
        evidence_basis = (
            "a zero-value record"
            if candidate.trial_evidence == "zero_value_record"
            else "trial wording in the description"
        )
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="subscription_leak",
                subject=f"{candidate.merchant_name} trial conversion",
                title=f"Possible free trial that became a paid subscription at {display}",
                description=(
                    f"{evidence_basis.capitalize()} at this merchant was followed by paid charges. "
                    "The statement does not show whether a free trial was agreed or whether you "
                    "meant to keep paying, so this needs your confirmation."
                ),
                monthly_impact=typical,
                annual_impact=None,
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(typical, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "trial_conversion",
                    "finding_kind": "verification_required",
                    "merchant_key": candidate.merchant_name,
                    "trial_evidence": candidate.trial_evidence,
                    "trial_dates": [item.isoformat() for item in candidate.trial_dates],
                    "first_paid_date": candidate.paid_dates[0].isoformat(),
                    "first_paid_amount": paid[0],
                    "days_from_trial_to_first_paid": candidate.days_from_trial_to_first_paid,
                    "paid_payment_count": len(paid),
                    "paid_payment_dates": [item.isoformat() for item in candidate.paid_dates],
                    "paid_amounts": paid,
                    # Actual money paid since the trial record, not a projection.
                    "observed_total_paid": sum(paid, Decimal("0")),
                    "amount_stable": candidate.amount_stable,
                    "subscription_category": candidate.subscription_category,
                    "observation_count": len(paid),
                    "first_observed_date": candidate.trial_dates[0],
                    "last_observed_date": candidate.paid_dates[-1],
                    "verification_prompt": (
                        f"Did you sign up for a free trial with {display}, and do you want to "
                        "keep paying for it?"
                    ),
                    "evidence_status": "likely" if strong else "possible",
                    "evidence_status_reason": (
                        "A zero-value record was followed by repeated, stable subscription charges."
                        if strong
                        else "A trial record exists, but the paid charges are too few, unstable or "
                        "not clearly a subscription to say more than possible."
                    ),
                },
                behaviour_ids=[],
                feature_refs=[f"trial_conversion_candidates[{candidate.merchant_name}]"],
            )
        )
    return findings


def _unidentified_recurring_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Verification findings for stable recurring payments to a payee we cannot name."""
    findings: list[LeakDetection] = []
    for candidate in snapshot.unidentified_recurring_candidates:
        amounts = candidate.amounts
        typical = Decimal(str(sorted(amounts)[len(amounts) // 2]))
        interval = candidate.median_interval_days
        monthly = (
            typical
            if _is_monthly_billing_interval(interval)
            else (typical * Decimal("30") / interval).quantize(Decimal("0.01"))
        )
        if monthly < MIN_IMPACT:
            continue
        # The payments themselves are well extracted; what is unknown is the
        # payee, so the pattern is scored on its own regularity.
        confidence = leak_confidence(
            support=None,
            observation_count=len(amounts),
            pattern_strength=Decimal("0.60"),
            ceiling=Decimal("0.60"),
        )
        if confidence is None:
            continue
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="unknown_recurring_payment",
                subject=f"unidentified {candidate.description_signature}",
                title="Recurring payments to an unidentified merchant",
                description=(
                    f"{len(amounts)} payments of about the same amount went to a payee that could "
                    f"not be identified, repeating {candidate.cadence}. Please say whether you "
                    "recognise it. This is not a confirmed loss."
                ),
                monthly_impact=monthly,
                annual_impact=None,
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(monthly, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "unidentified_recurring_merchant",
                    "finding_kind": "verification_required",
                    "merchant_key": None,
                    "description_signature": candidate.description_signature,
                    "cadence": candidate.cadence,
                    "payment_count": len(amounts),
                    "payment_dates": [item.isoformat() for item in candidate.dates],
                    "payment_amounts": amounts,
                    # Actual money paid to this payee in the statements.
                    "observed_total_paid": sum(amounts, Decimal("0")),
                    "first_observed_date": candidate.dates[0],
                    "last_observed_date": candidate.dates[-1],
                    "median_interval_days": interval,
                    "observation_count": len(amounts),
                    "verification_prompt": "Do you recognise this payee? If so, tell us who it is.",
                },
                behaviour_ids=[],
                feature_refs=["unidentified_recurring_candidates"],
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


COMMITMENT_MIN_MONTHLY = Decimal("30")
COMMITMENT_MAX_DAYS_SINCE_LAST = 38
GAMBLING_MIN_MONTHLY = Decimal("100")
GAMBLING_MIN_TRANSACTIONS = 4


def _active_commitment(
    snapshot: FinancialFeatureSnapshot, merchant: MerchantFeature
) -> Decimal | None:
    """Monthly cost of a payment still running on a billing cadence, else None."""
    if snapshot.date_end is None:
        return None
    recurrence = merchant.subscription_recurrence or merchant.recurrence
    interval = recurrence.median_interval_days or recurrence.average_interval_days
    if (
        merchant.merchant_transaction_count < 2
        or len(merchant.merchant_monthly_totals) < 2
        or not matches_plausible_recurring_interval(interval)
        or support_ratio(merchant.confidence_support) < Decimal("0.60")
        or merchant.merchant_last_transaction_date is None
        or (snapshot.date_end - merchant.merchant_last_transaction_date).days
        > COMMITMENT_MAX_DAYS_SINCE_LAST
    ):
        return None
    impact = (
        _recurring_monthly_impact(merchant, recurrence=recurrence) or merchant.merchant_average_amount
    )
    return impact if impact >= COMMITMENT_MIN_MONTHLY else None


def _concurrent_commitments(
    providers: dict[str, tuple[MerchantFeature, Decimal]],
) -> tuple[list[tuple[MerchantFeature, Decimal]], list[str]] | None:
    """Providers charged in the same latest month, and the months two or more overlapped."""
    if len(providers) < 2:
        return None
    latest = max(max(item.merchant_monthly_totals) for item, _ in providers.values())
    concurrent = sorted(
        (entry for entry in providers.values() if latest in entry[0].merchant_monthly_totals),
        key=lambda entry: (-entry[0].merchant_total_amount, entry[0].merchant_name),
    )
    if len(concurrent) < 2:
        return None
    counts: dict[str, int] = {}
    for item, _ in concurrent:
        for month in item.merchant_monthly_totals:
            counts[month] = counts.get(month, 0) + 1
    overlapping = sorted(month for month, count in counts.items() if count >= 2)
    return (concurrent, overlapping) if len(overlapping) >= 2 else None


def _combined_support(items: list[MerchantFeature]) -> ConfidenceSupport:
    total = sum(item.confidence_support.supporting_transaction_count for item in items)
    high = sum(item.confidence_support.high_confidence_transaction_count for item in items)
    return ConfidenceSupport(
        supporting_transaction_count=total,
        high_confidence_transaction_count=high,
        low_confidence_transaction_count=max(0, total - high),
    )


def _overlapping_cover_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Funeral or life cover paid to two or more providers over the same months.

    Several policies are often deliberate (one per family member), so this is a
    prompt to check the policies against each other, never a claim of waste.
    """
    providers: dict[str, tuple[MerchantFeature, Decimal]] = {}
    for merchant in snapshot.merchants:
        provider_id = cover_provider(merchant.merchant_name)
        if (
            provider_id is None
            or merchant.insurance_transaction_count * 2 < merchant.merchant_transaction_count
        ):
            continue
        impact = _active_commitment(snapshot, merchant)
        if impact is None:
            continue
        existing = providers.get(provider_id)
        if existing is None or merchant.merchant_total_amount > existing[0].merchant_total_amount:
            providers[provider_id] = (merchant, impact)
    found = _concurrent_commitments(providers)
    if found is None:
        return []
    concurrent, overlapping = found
    merchants = [item for item, _ in concurrent]
    amounts = [amount for _, amount in concurrent]
    combined = sum(amounts, Decimal("0"))
    observation_count = sum(item.merchant_transaction_count for item in merchants)
    confidence = leak_confidence(
        support=_combined_support(merchants),
        observation_count=observation_count,
        pattern_strength=Decimal("0.72") if len(overlapping) >= 3 else Decimal("0.64"),
        ceiling=Decimal("0.80"),
    )
    if confidence is None:
        return []
    names = [merchant_display_name_for(item.merchant_name) or item.merchant_name for item in merchants]
    keys = [item.merchant_name for item in merchants]
    return [
        _leak(
            snapshot=snapshot,
            leak_type="overlapping_cover_leak",
            subject="funeral-life-cover-overlap",
            title=f"Funeral or life cover with {len(names)} providers ({', '.join(names[:3])})",
            description=(
                f"Premiums for funeral or life cover were paid to {len(names)} providers "
                f"({', '.join(names)}) across {len(overlapping)} months, about "
                f"{format_zar(combined)} a month together. Policies are often held on purpose, "
                "for example one for each person covered, so this does not assume any of them "
                "is unwanted. It is worth checking who and what each policy covers."
            ),
            monthly_impact=combined,
            annual_impact=combined * Decimal("12"),
            impact_kind="recurring",
            confidence=confidence,
            severity=severity_for_impact(combined, persistent=True, confidence=confidence),
            evidence={
                "finding_focus": "overlapping_cover",
                "finding_kind": "potential_leak",
                "cover_kind": "funeral_or_life",
                "provider_count": len(names),
                "provider_names": names,
                "combined_merchants": keys,
                "provider_monthly_amounts": amounts,
                "combined_monthly_premium": combined,
                # Everything but the largest premium: what stops if the smaller
                # policies turn out to cover the same people and risks.
                "possible_overlap_monthly": combined - max(amounts),
                "overlapping_months": overlapping,
                "overlapping_month_count": len(overlapping),
                "observation_count": observation_count,
                "verification_required": True,
                "no_redundancy_assumed": True,
            },
            behaviour_ids=_observation_ids(observations.get("recurring_payment_pattern", [])),
            feature_refs=[f"merchants[{key}]" for key in keys],
        )
    ]


def _gambling_spending_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Payments to betting and lottery operators that add up to a material monthly cost.

    This states what was paid. Winnings, withdrawals and what the money was
    meant for are not in the statement, so no net result or judgement is given.
    """
    gambling = [
        merchant
        for merchant in snapshot.merchants
        if is_gambling_merchant(merchant.merchant_name)
        and support_ratio(merchant.confidence_support) >= Decimal("0.60")
    ]
    if not gambling:
        return []
    total_count = sum(item.merchant_transaction_count for item in gambling)
    total_spend = sum((item.merchant_total_amount for item in gambling), Decimal("0"))
    monthly_totals: dict[str, Decimal] = {}
    monthly_counts: dict[str, int] = {}
    for item in gambling:
        for month, amount in item.merchant_monthly_totals.items():
            monthly_totals[month] = monthly_totals.get(month, Decimal("0")) + amount
        for month, count in item.merchant_monthly_transaction_count.items():
            monthly_counts[month] = monthly_counts.get(month, 0) + count
    active_months = len(monthly_totals)
    if total_count < GAMBLING_MIN_TRANSACTIONS or active_months < 2:
        return []
    # A month still in progress would count its payments without its full length.
    completed = [month.month for month in completed_months(snapshot) if month.month in monthly_totals]
    if completed:
        monthly_impact = sum((monthly_totals[month] for month in completed), Decimal("0")) / Decimal(
            len(completed)
        )
    else:
        monthly_impact = total_spend / Decimal(active_months)
    if monthly_impact < GAMBLING_MIN_MONTHLY:
        return []
    coverage_start, coverage_end = _coverage_bounds(snapshot)
    compare = _period_compare(
        [(month, monthly_totals[month], monthly_counts.get(month, 0)) for month in sorted(monthly_totals)],
        coverage_end,
        coverage_start,
        minimum_baseline=Decimal("60"),
    )
    confidence = leak_confidence(
        support=_combined_support(gambling),
        observation_count=total_count,
        pattern_strength=Decimal("0.68") if total_count >= 8 else Decimal("0.58"),
        ceiling=Decimal("0.78"),
    )
    if confidence is None:
        return []
    top = max(gambling, key=lambda item: (item.merchant_total_amount, item.merchant_name))
    single = len(gambling) == 1
    display = merchant_display_name_for(top.merchant_name) or top.merchant_name
    evidence: dict[str, object] = {
        "finding_focus": "gambling_spending",
        "finding_kind": "spending_pattern",
        "merchant_key": top.merchant_name if single else None,
        "gambling_merchants": [item.merchant_name for item in gambling],
        "gambling_transaction_count": total_count,
        "gambling_total_amount": total_spend,
        "observed_total_paid": total_spend,
        "average_transaction_amount": total_spend / Decimal(total_count),
        "monthly_gambling_spend": monthly_impact,
        "active_month_count": active_months,
        "winnings_not_netted": True,
        "observation_count": total_count,
    }
    if compare is not None:
        evidence.update(
            {
                key: compare[key]
                for key in (
                    "previous_period",
                    "current_period",
                    "previous_amount",
                    "current_amount",
                    "change_amount",
                    "change_percentage",
                    "months_compared",
                )
                if key in compare
            }
        )
    return [
        _leak(
            snapshot=snapshot,
            leak_type="gambling_spending_leak",
            subject=top.merchant_name if single else "gambling-spending",
            title=(
                f"Regular betting or lottery payments to {display}"
                if single
                else f"Regular betting or lottery payments across {len(gambling)} operators"
            ),
            description=(
                f"{total_count} payments to betting or lottery operators added up to "
                f"{format_zar(total_spend)} over {active_months} months. This shows what was "
                "paid in. It does not show winnings or withdrawals, and it makes no judgement "
                "about the spending."
            ),
            monthly_impact=monthly_impact,
            annual_impact=monthly_impact * Decimal("12"),
            impact_kind="recurring",
            confidence=confidence,
            severity=severity_for_impact(monthly_impact, persistent=True, confidence=confidence),
            evidence=evidence,
            behaviour_ids=[],
            feature_refs=[f"merchants[{item.merchant_name}]" for item in gambling],
        )
    ]


def _credit_series(
    snapshot: FinancialFeatureSnapshot,
) -> dict[str, tuple[MerchantFeature, Decimal, bool]]:
    """Credit repayments still running: merchant name to (merchant, monthly cost, costly lender)."""
    series: dict[str, tuple[MerchantFeature, Decimal, bool]] = {}
    for merchant in snapshot.merchants:
        classified = credit_provider(merchant.merchant_name)
        if classified is None:
            continue
        impact = _active_commitment(snapshot, merchant)
        if impact is not None:
            series[merchant.merchant_name] = (merchant, impact, classified[1])
    return series


def _stacked_credit_names(
    series: dict[str, tuple[MerchantFeature, Decimal, bool]],
) -> set[str]:
    found = _concurrent_commitments(
        {name: (merchant, impact) for name, (merchant, impact, _) in series.items()}
    )
    return {item.merchant_name for item, _ in found[0]} if found else set()


def _claimed_credit_merchants(snapshot: FinancialFeatureSnapshot) -> set[str]:
    """Credit merchants that a high-cost-credit finding reports."""
    series = _credit_series(snapshot)
    return _stacked_credit_names(series) | {
        name
        for name, (merchant, _, high_cost) in series.items()
        if high_cost and merchant.merchant_transaction_count >= 3
    }


PASS_THROUGH_SINGLE_EVENT_MIN_PAYMENTS = 10


def _pass_through_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Large deposits paid straight back out in many small payments, leaving almost nothing.

    The statement shows the movement, not the reasons, so this is a prompt. The cost
    named is what the bank charged on those days, never the money itself.
    """
    events = snapshot.pass_through_events
    if not events:
        return []
    if len(events) < 2 and events[0].outflow_count < PASS_THROUGH_SINGLE_EVENT_MIN_PAYMENTS:
        return []
    fees = sum((event.fee_total for event in events), Decimal("0"))
    if fees < MIN_IMPACT:
        return []
    deposits = sum((event.amount for event in events), Decimal("0"))
    payments = sum(event.outflow_count for event in events)
    confidence = leak_confidence(
        support=None,
        observation_count=payments,
        pattern_strength=Decimal("0.60"),
        ceiling=Decimal("0.70"),
    )
    if confidence is None:
        return []
    return [
        _leak(
            snapshot=snapshot,
            leak_type="money_pass_through_leak",
            subject="deposits-paid-straight-out",
            title="Large deposits leave within days in many small payments",
            description=(
                f"{len(events)} deposits totalling {format_zar(deposits)} were paid back out within "
                f"{events[0].days_window} days, in {payments} payments, leaving almost nothing in "
                f"the account. The bank charged {format_zar(fees)} in fees on those days; that is "
                "part of your bank fees, not extra. The statement does not show what the payments "
                "were for, so this is not a finding that any of it was wasted."
            ),
            monthly_impact=fees.quantize(Decimal("0.01")),
            annual_impact=None,
            impact_kind="estimated",
            confidence=confidence,
            severity=severity_for_impact(fees, persistent=False, confidence=confidence),
            evidence={
                "finding_focus": "deposits_paid_straight_out",
                "finding_kind": "spending_pattern",
                "event_count": len(events),
                "total_deposited": deposits,
                "payment_count": payments,
                "fees_in_windows": fees,
                "amounts_not_additive_with_category_findings": True,
                "events": [
                    {
                        "date": event.credit_date.isoformat(),
                        "amount": event.amount,
                        "share_spent": event.share_spent,
                        "payments": event.outflow_count,
                        "fees": event.fee_total,
                        "left": event.end_balance,
                    }
                    for event in events
                ],
                "event_transaction_ids": [tid for event in events for tid in event.transaction_ids],
                "observation_count": payments,
                "verification_prompt": (
                    "Large deposits are being paid out in many small payments within days. "
                    "Fewer, planned payments would pay fewer fees, and a small buffer would "
                    "avoid failed or declined payments."
                ),
            },
            behaviour_ids=[],
            feature_refs=["pass_through_events"],
        )
    ]


def _short_term_lender_leaks(
    snapshot: FinancialFeatureSnapshot,
    claimed: set[str],
) -> list[LeakDetection]:
    """Repayments to short-term lenders seen too few times to call a schedule.

    A short statement can show one lender twice, or several lenders once each. Either
    is worth a prompt: the statement cannot show the cost, only that it was repaid.
    """
    lenders = [
        merchant
        for merchant in snapshot.merchants
        if merchant.merchant_name not in claimed
        and (found := credit_provider(merchant.merchant_name)) is not None
        and found[1]
        and merchant.merchant_total_amount > 0
        and merchant.merchant_transaction_count >= 1
    ]
    repeated = [item for item in lenders if item.merchant_transaction_count >= 2]
    if not repeated and len(lenders) < 2:
        return []
    names = [merchant_display_name_for(item.merchant_name) or item.merchant_name for item in lenders]
    total = sum((item.merchant_total_amount for item in lenders), Decimal("0"))
    count = sum(item.merchant_transaction_count for item in lenders)
    confidence = leak_confidence(
        support=_combined_support(lenders),
        observation_count=count,
        pattern_strength=Decimal("0.55"),
        ceiling=Decimal("0.65"),
    )
    if confidence is None:
        return []
    return [
        _leak(
            snapshot=snapshot,
            leak_type="high_cost_credit_leak",
            subject="short-term-lenders",
            title=f"Repayments to {', '.join(names[:3])}, lenders that often charge high rates",
            description=(
                f"{count} repayments totalling {format_zar(total)} went to short-term lenders "
                f"({', '.join(names)}). The statement does not show the amounts borrowed or the "
                "interest, so this is a prompt to check the cost of each loan, not a finding "
                "that any of it is too expensive."
            ),
            monthly_impact=total,
            annual_impact=None,
            impact_kind="estimated",
            confidence=confidence,
            severity=severity_for_impact(total, persistent=False, confidence=confidence),
            evidence={
                "finding_focus": "short_term_lenders",
                "finding_kind": "potential_leak",
                "provider_names": names,
                "provider_count": len(names),
                "repayment_count": count,
                "total_repaid": total,
                "includes_high_cost_lender": True,
                "observation_count": count,
                "verification_required": True,
            },
            behaviour_ids=[],
            feature_refs=[f"merchants[{item.merchant_name}]" for item in lenders],
        )
    ]


def _high_cost_credit_leaks(
    snapshot: FinancialFeatureSnapshot,
    observations: dict[str, list[BehaviourObservation]],
) -> list[LeakDetection]:
    """Several credit repayments running together, or a repayment to a costly lender.

    The statement shows the repayments, not the interest rate, the balance or
    what the credit paid for, so both are verification prompts.
    """
    series = _credit_series(snapshot)
    findings: list[LeakDetection] = []
    stacked_names: set[str] = set()
    found = _concurrent_commitments(
        {name: (merchant, impact) for name, (merchant, impact, _) in series.items()}
    )
    if found is not None:
        concurrent, overlapping = found
        merchants = [item for item, _ in concurrent]
        amounts = [amount for _, amount in concurrent]
        combined = sum(amounts, Decimal("0"))
        observation_count = sum(item.merchant_transaction_count for item in merchants)
        confidence = leak_confidence(
            support=_combined_support(merchants),
            observation_count=observation_count,
            pattern_strength=Decimal("0.72") if len(overlapping) >= 3 else Decimal("0.64"),
            ceiling=Decimal("0.80"),
        )
        if confidence is not None:
            stacked_names = {item.merchant_name for item in merchants}
            names = [merchant_display_name_for(item.merchant_name) or item.merchant_name for item in merchants]
            keys = [item.merchant_name for item in merchants]
            findings.append(
                _leak(
                    snapshot=snapshot,
                    leak_type="high_cost_credit_leak",
                    subject="credit-repayment-stacking",
                    title=f"{len(names)} credit repayments running together ({', '.join(names[:3])})",
                    description=(
                        f"Repayments to {len(names)} credit providers ({', '.join(names)}) were "
                        f"made across {len(overlapping)} months, about {format_zar(combined)} a "
                        "month together. The statement does not show the interest rates or what "
                        "is still owed, so it cannot say whether any of this credit is costly."
                    ),
                    monthly_impact=combined,
                    annual_impact=combined * Decimal("12"),
                    impact_kind="recurring",
                    confidence=confidence,
                    severity=severity_for_impact(combined, persistent=True, confidence=confidence),
                    evidence={
                        "finding_focus": "credit_stacking",
                        "finding_kind": "potential_leak",
                        "provider_count": len(names),
                        "provider_names": names,
                        "combined_merchants": keys,
                        "provider_monthly_amounts": amounts,
                        "combined_monthly_repayment": combined,
                        "includes_high_cost_lender": any(series[key][2] for key in keys),
                        "overlapping_months": overlapping,
                        "overlapping_month_count": len(overlapping),
                        "observation_count": observation_count,
                        "verification_required": True,
                    },
                    behaviour_ids=_observation_ids(observations.get("recurring_payment_pattern", [])),
                    feature_refs=[f"merchants[{key}]" for key in keys],
                )
            )
    for name, (merchant, impact, high_cost) in sorted(series.items()):
        if not high_cost or name in stacked_names or merchant.merchant_transaction_count < 3:
            continue
        confidence = leak_confidence(
            support=merchant.confidence_support,
            observation_count=merchant.merchant_transaction_count,
            pattern_strength=Decimal("0.60"),
            ceiling=Decimal("0.70"),
        )
        if confidence is None:
            continue
        display = merchant_display_name_for(name) or name
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="high_cost_credit_leak",
                subject=name,
                title=f"Regular repayments to {display}, a lender that often charges high rates",
                description=(
                    f"{merchant.merchant_transaction_count} repayments of about {format_zar(impact)} "
                    "a month went to a lender in the short-term credit category. The statement "
                    "does not show the interest rate or the balance, so this is a prompt to check "
                    "the cost of the loan, not a finding that it is too expensive."
                ),
                monthly_impact=impact,
                annual_impact=impact * Decimal("12"),
                impact_kind="recurring",
                confidence=confidence,
                severity=severity_for_impact(impact, persistent=True, confidence=confidence),
                evidence={
                    "finding_focus": "high_cost_lender_repayments",
                    "finding_kind": "verification_required",
                    "merchant_key": name,
                    "observed_total_paid": merchant.merchant_total_amount,
                    "payment_count": merchant.merchant_transaction_count,
                    "observation_count": merchant.merchant_transaction_count,
                    "first_observed_date": merchant.merchant_first_transaction_date,
                    "last_observed_date": merchant.merchant_last_transaction_date,
                    "verification_prompt": (
                        f"What is the interest rate on your loan with {display}, and how much is left to pay?"
                    ),
                },
                behaviour_ids=[],
                feature_refs=[f"merchants[{name}]"],
            )
        )
    return findings


def _recurring_transfer_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Regular payments to the same person: a commitment worth naming, not a loss.

    Rent, family support, a stokvel and an informal loan all look like this. The
    statement cannot tell them apart, so the customer is asked what it is.
    """
    findings: list[LeakDetection] = []
    for candidate in snapshot.person_payment_candidates:
        amounts = candidate.amounts
        typical = Decimal(str(sorted(amounts)[len(amounts) // 2]))
        interval = candidate.median_interval_days
        monthly = (
            typical
            if _is_monthly_billing_interval(interval)
            else (typical * Decimal("30") / interval).quantize(Decimal("0.01"))
        )
        if monthly < MIN_IMPACT:
            continue
        confidence = leak_confidence(
            support=None,
            observation_count=len(amounts),
            pattern_strength=Decimal("0.75") if candidate.amount_stable else Decimal("0.60"),
            ceiling=Decimal("0.70"),
        )
        if confidence is None:
            continue
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="recurring_transfer_leak",
                subject=f"person-{candidate.recipient_key}",
                title=f"Regular payments to the same recipient ({candidate.cadence})",
                description=(
                    f"{len(amounts)} payments of about {format_zar(typical)} went to "
                    f"{candidate.recipient_label}, repeating {candidate.cadence}. Regular "
                    "payments to a person are often deliberate, such as rent, family support, "
                    "a stokvel or a loan. The statement does not show what they are for, so "
                    "this is not a confirmed loss."
                ),
                monthly_impact=monthly,
                annual_impact=None,
                impact_kind="estimated",
                confidence=confidence,
                severity=severity_for_impact(monthly, persistent=False, confidence=confidence),
                evidence={
                    "finding_focus": "recurring_person_payments",
                    "finding_kind": "verification_required",
                    "merchant_key": None,
                    "recipient_key": candidate.recipient_key,
                    "recipient_label": candidate.recipient_label,
                    "recipient_transaction_ids": candidate.transaction_ids,
                    "cadence": candidate.cadence,
                    "payment_count": len(amounts),
                    "payment_dates": [item.isoformat() for item in candidate.dates],
                    "payment_amounts": amounts,
                    "typical_amount": typical,
                    "amount_stable": candidate.amount_stable,
                    "median_interval_days": interval,
                    "observed_total_paid": sum(amounts, Decimal("0")),
                    "observation_count": len(amounts),
                    "first_observed_date": candidate.dates[0],
                    "last_observed_date": candidate.dates[-1],
                    "verification_prompt": (
                        "What are these regular payments for, and are they still needed? "
                        "For example rent, family support, a stokvel or a loan."
                    ),
                },
                behaviour_ids=[],
                feature_refs=["person_payment_candidates"],
            )
        )
    return findings


def _penalty_fee_leaks(snapshot: FinancialFeatureSnapshot) -> list[LeakDetection]:
    """Late-payment and similar penalties a provider charged, as money already paid.

    The statement shows the charge, not why the payment was late, so nothing is
    said about avoidability beyond naming what was charged.
    """
    findings: list[LeakDetection] = []
    for candidate in snapshot.penalty_fee_candidates:
        total = sum(candidate.amounts, Decimal("0"))
        if total < MIN_IMPACT:
            continue
        months = sorted({item.strftime("%Y-%m") for item in candidate.dates})
        repeated = len(months) >= 2
        confidence = leak_confidence(
            support=None,
            observation_count=len(candidate.amounts),
            pattern_strength=Decimal("0.80") if repeated else Decimal("0.70"),
            ceiling=Decimal("0.80"),
        )
        if confidence is None:
            continue
        display = (
            merchant_display_name_for(candidate.payee) if candidate.payee_is_merchant else None
        )
        who = display or "a provider"
        count = len(candidate.amounts)
        findings.append(
            _leak(
                snapshot=snapshot,
                leak_type="penalty_fee_leak",
                subject=candidate.payee,
                title=(
                    f"Penalty fees charged by {who}"
                    if repeated
                    else f"Late or penalty fee charged by {who}"
                ),
                description=(
                    f"{count} charge{'s' if count != 1 else ''} described as "
                    f"{' / '.join(item.lower() for item in candidate.wording)} "
                    f"totalled {format_zar(total)}"
                    + (f" across {len(months)} months" if repeated else "")
                    + ". The statement shows the charge but not why it was applied, so it "
                    "does not say whether it could have been avoided."
                ),
                monthly_impact=total,
                annual_impact=None,
                impact_kind="one_time",
                confidence=confidence,
                severity=severity_for_impact(total, persistent=repeated, confidence=confidence),
                evidence={
                    "finding_focus": "penalty_fees",
                    "finding_kind": "potential_leak",
                    "merchant_key": candidate.payee if candidate.payee_is_merchant else None,
                    "payee": candidate.payee,
                    "penalty_wording": candidate.wording,
                    "penalty_transaction_ids": candidate.transaction_ids,
                    "penalty_dates": [item.isoformat() for item in candidate.dates],
                    "penalty_amounts": candidate.amounts,
                    "penalty_count": count,
                    "penalty_months": months,
                    "repeated_across_months": repeated,
                    "observed_total_paid": total,
                    "observation_count": count,
                    "first_observed_date": candidate.dates[0],
                    "last_observed_date": candidate.dates[-1],
                },
                behaviour_ids=[],
                feature_refs=["penalty_fee_candidates"],
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
    if "evidence_status" not in evidence:
        status, status_reason = evidence_status_for(leak_type, evidence, confidence)
        evidence = {
            **evidence,
            "evidence_status": status,
            "evidence_status_reason": status_reason,
        }
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
    amount: Decimal | None = None,
) -> Decimal | None:
    recurrence = recurrence or merchant.recurrence
    interval = recurrence.median_interval_days or recurrence.average_interval_days
    amount = amount or recurrence.typical_amount or recurrence.average_amount
    if interval in (None, Decimal("0")) or amount is None:
        return None
    # A bill that lands once per calendar month costs its amount per month; the
    # 28-31 day spread is a calendar effect, not a cheaper rate.
    if _is_monthly_billing_interval(interval):
        return amount.quantize(Decimal("0.01"))
    return (amount * Decimal("30") / interval).quantize(Decimal("0.01"))


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
        allow_dominant_share=True,
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
    *,
    allow_dominant_share: bool = False,
) -> bool:
    if (
        not fee_observations
        or count < 2
        or total < MIN_IMPACT
        or not (
            total in _eligible_non_account_fee_pool(fees, fee_observations)
            or (
                allow_dominant_share
                and not fees.insufficient_funds_fee_copies_removed
                and total >= fees.bank_fee_total * DOMINANT_FEE_SHARE
            )
        )
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
                "recurring_bill_price_increase",
                # Any merchant already established as recurring: a step in
                # its price is part of that recurring finding.
                "merchant_price_increase",
            }
        ),
        None,
    )


def _price_rise_impact(
    evidence: dict[str, object], interval: Decimal | None
) -> dict[str, object]:
    """The cost of a price rise itself, apart from the cost of the whole service.

    Original and current amounts come from the observed payments. The annual
    figure is an estimate that assumes the current price continues; the amount
    paid above the original price so far is an actual historical figure.
    """
    original = _decimal(evidence.get("first_amount"))
    current = _decimal(evidence.get("latest_amount"))
    if original is None or current is None or original <= 0 or current - original < Decimal("1"):
        return {}
    increase = current - original
    if interval is None or interval <= 0 or _is_monthly_billing_interval(interval):
        monthly = increase
    else:
        monthly = increase * Decimal("30") / interval
    monthly = monthly.quantize(Decimal("0.01"))
    return {
        key: value
        for key, value in {
            "original_recurring_amount": original,
            "current_recurring_amount": current,
            "price_increase_per_payment": increase,
            "price_increase_percentage": ((increase / original) * Decimal("100")).quantize(
                Decimal("0.01")
            ),
            "price_increase_monthly": monthly,
            "price_increase_annual_estimate": monthly * Decimal("12"),
            "price_increase_first_observed": evidence.get("first_increase_date"),
            "additional_paid_to_date": evidence.get("additional_paid_to_date"),
            "promotional_start_possible": bool(evidence.get("promotional_start_possible")),
            # The increase is part of the recurring cost, not on top of it.
            "impact_components_additive": False,
        }.items()
        if value is not None
    }


def _recurring_signal_evidence(
    price_obs: BehaviourObservation | None,
    frequency_obs: BehaviourObservation | None,
    interval: Decimal | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {}
    if price_obs is not None:
        ev = price_obs.evidence
        payload.update(_price_rise_impact(ev, interval))
        payload["price_change_focus"] = ev.get("finding_focus")
        payload["previous_average_amount"] = ev.get("average_previous_amount")
        payload["latest_amount"] = ev.get("latest_amount")
        payload["previous_amount"] = ev.get("previous_amount")
        payload["first_amount"] = ev.get("first_amount")
        payload["price_increase_count"] = ev.get("increase_count")
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


def _escalation_calculation(observation: BehaviourObservation) -> str:
    """Say how the increase was worked out, from the observation's own figures."""
    evidence = observation.evidence
    current = _decimal(evidence.get("current_amount"))
    baseline = _decimal(evidence.get("previous_amount"))
    change = _decimal(evidence.get("change_amount"))
    if current is None or baseline is None or change is None:
        return "The increase could not be recomputed from the recorded figures."
    count = evidence.get("baseline_month_count")
    months = f"the average of {count} earlier months" if isinstance(count, int) and count > 1 else "the month before"
    return (
        f"Purchase outflow in {evidence.get('current_period')} was R{current:,.2f} against {months} "
        f"(R{baseline:,.2f}), a difference of R{change:,.2f}. Supporting rows are the earlier "
        "and current rows of the merchants whose own spend rose."
    )


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
        "vas_fees": fees.vas_fee_total or Decimal("0"),
        "card_replacement_fees": fees.card_replacement_fee_total or Decimal("0"),
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
        + typed["vas_fees"]
        + typed["card_replacement_fees"]
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
