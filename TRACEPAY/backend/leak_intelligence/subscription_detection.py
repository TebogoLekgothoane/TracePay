"""Deterministic subscription detection, independent of leak scoring."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from statistics import median
import re

from categorisation.normalize import extract_merchant_name, merchant_key, normalize_for_matching

from .common import is_purchase_reversal
from .models import FeatureTransaction, SubscriptionGroup, SubscriptionObservation

_FAILURE_MARKERS = (
    "INSUFFICIENT FUNDS", "UNSUCCESSFUL", "FAILED PAYMENT", "FAILED PURCHASE",
)
_FEE_MARKERS = (" FEE", "FEE:", "CHARGE", "BANK FEE")
_RECURRING_MARKERS = ("RECURRING", "SUBSCRIPTION", "MONTHLY", "DEBIT ORDER", "DEBICHECK")
_EXCLUDED_MERCHANTS = ("UBER", "BOLT", "MR D FOOD", "CHECKERS SIXTY60", "TAKEALOT")
_EXCLUDED_TEXT = (
    "VAS -", "VAS PURCHASE", "AIRTIME", "DATA BUNDLE", "PAYSHAP",
    "ONCE-OFF PAYMENT", "ONCE OFF PAYMENT", "ATM WITHDRAWAL", "GROCERY",
    "MONEY TRANSFERRED IN FOR GOALSAVE", "MONEY TRANSFERRED OUT FROM GOALSAVE",
    "MONEY ADDED TO FIXED DEPOSIT", "MONEY EARLY PAID OUT", "GOALSAVE",
)
_ALIASES = {
    "OPENAI": "chatgpt", "CHATGPT PLUS": "chatgpt", "CHATGPT": "chatgpt",
    "APPLE.COM/BILL": "APPLE", "APPLE SERVICES": "APPLE",
    "SPOTIFY AB": "SPOTIFY", "SPOTIFY": "SPOTIFY",
    "CURSOR": "cursor", "AI POWERED IDE": "cursor",
}
_REFERENCED_AMOUNT = re.compile(r"\bFOR\s+(?:ZAR|R)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b", re.I)
_REFERENCE = re.compile(r"\b(?:REF|REFERENCE|AUTH|TRN|TXN)\s*[:#-]?\s*[A-Z0-9-]{4,}\b", re.I)
_PHONE = re.compile(r"(?<!\w)(?:\+\d{8,15}|\d{10,15})(?!\w)")


def _text(item: FeatureTransaction) -> str:
    text = normalize_for_matching(" ".join(filter(None, (item.description, item.merchant_name, item.categorisation.merchant_name))))
    text = _PHONE.sub(" ", text)
    text = _REFERENCE.sub(" ", text)
    text = re.sub(r"\bBRANCH\s*:?\s*[^ ]+(?:\s+[^ ]+)?", " ", text)
    text = re.sub(r"\bE-STAMP\b.*$", " ", text)
    text = re.sub(r"\b(?:US|IE|ZA|GB)\b", " ", text)
    return " ".join(text.split()).upper()


def _merchant(item: FeatureTransaction) -> tuple[str, str, str]:
    text = _text(item)
    raw = item.merchant_name or item.categorisation.merchant_name or extract_merchant_name(text) or text
    normalized = merchant_key(raw) or normalize_for_matching(raw)
    search = f"{normalized} {text}".upper().replace("*", " ")
    canonical = None
    for alias, value in _ALIASES.items():
        if alias in search:
            canonical = value.upper()
            break
    if canonical is None:
        canonical = normalized.upper()
    # Cursor usage is a separate variable-spend product even when the amount
    # happens to equal a subscription charge on the same date.
    product_kind = "usage" if canonical == "CURSOR" and "USAGE" in text else "subscription"
    display = {"CHATGPT": "ChatGPT", "APPLE": "Apple", "SPOTIFY": "Spotify", "CURSOR": "Cursor"}.get(canonical, (raw or canonical).strip().title())
    return display, canonical, product_kind


def _outcome(item: FeatureTransaction) -> str:
    raw = (item.description or "").strip().upper()
    text = _text(item)
    if raw.startswith("REVERSAL") or is_purchase_reversal(item):
        return "reversal"
    if raw.startswith("FEE: UNSUCCESSFUL") or any(marker in text for marker in _FAILURE_MARKERS):
        return "failed"
    if raw.startswith("FEE:") or raw.startswith("FEE REVERSAL") or any(marker in text for marker in _FEE_MARKERS) or item.categorisation.transaction_class == "bank_fee":
        return "fee"
    if item.transaction_type not in {None, "debit"}:
        return "fee"
    if item.categorisation.transaction_class in {"income", "internal_transfer", "person_to_person", "savings", "investment", "bank_fee"}:
        return "fee"
    return "successful"


def _amount_cluster(amount: Decimal, clusters: list[list[Decimal]]) -> list[Decimal] | None:
    for cluster in clusters:
        centre = Decimal(str(median(cluster)))
        tolerance = Decimal("2") if centre < Decimal("20") else centre * Decimal("0.15")
        if abs(amount - centre) <= tolerance:
            return cluster
    cluster = [amount]
    clusters.append(cluster)
    return cluster


def _cadence(intervals: list[int]) -> tuple[str, Decimal | None, int]:
    if not intervals:
        return "irregular", None, 0
    typical = Decimal(str(median(intervals)))
    labels = ((7, "weekly", 2), (14, "fortnightly", 3), (30, "monthly", 6), (90, "quarterly", 12), (365, "annual", 21))
    for target, label, tolerance in labels:
        if abs(typical - target) <= tolerance:
            # A late payment is a materially longer billing gap. An early
            # charge is not treated as lateness (it can be a billing-date
            # shift, weekend adjustment, or an imported statement boundary).
            late = sum(value > target + tolerance for value in intervals)
            return label, typical, late
    return "irregular", typical, 0


def _referenced_amount(item: FeatureTransaction) -> Decimal | None:
    match = _REFERENCED_AMOUNT.search(item.description or "")
    if not match:
        return None
    try:
        return Decimal(match.group(1).replace(",", ""))
    except Exception:
        return None


def _excluded(item: FeatureTransaction, merchant_key_value: str) -> bool:
    text = _text(item)
    category = (item.categorisation.category_name or "").strip().upper()
    return (
        any(marker in merchant_key_value.upper() for marker in _EXCLUDED_MERCHANTS)
        or any(marker in text for marker in _EXCLUDED_TEXT)
        or category in {"AIRTIME & DATA", "GROCERIES", "FAST FOOD", "RESTAURANTS", "TRANSPORT", "CASH WITHDRAWAL", "TRANSFERS"}
        or item.categorisation.transaction_class in {"internal_transfer", "person_to_person", "income", "savings", "investment"}
    )


def _next_month_day(value: date, day: int) -> date:
    year, month = value.year + (value.month == 12), 1 if value.month == 12 else value.month + 1
    while True:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1


def _expected_day(rows: list[FeatureTransaction]) -> int | None:
    days = sorted(row.transaction_date.day for row in rows if row.transaction_date)
    if not days:
        return None
    counts = {day: days.count(day) for day in set(days)}
    return min(counts, key=lambda day: (-counts[day], day))


def detect_subscriptions(transactions: list[FeatureTransaction]) -> list[SubscriptionGroup]:
    """Build stable subscription candidates from canonical transaction rows."""
    ordered = sorted(
        transactions,
        key=lambda row: (row.transaction_date or date.min, row.transaction_id),
    )
    window_end = max((row.transaction_date for row in ordered if row.transaction_date), default=None)
    reversals: dict[str, list[FeatureTransaction]] = defaultdict(list)
    successful_by_product: dict[tuple[str, str, int], list[FeatureTransaction]] = defaultdict(list)
    failed_by_merchant: dict[str, list[FeatureTransaction]] = defaultdict(list)
    product_clusters: dict[tuple[str, str], list[list[Decimal]]] = defaultdict(list)
    eligible_successes: list[tuple[str, str, str, FeatureTransaction]] = []

    for item in ordered:
        outcome = _outcome(item)
        display, key, product_kind = _merchant(item)
        if not key:
            continue
        if outcome == "reversal":
            reversals[key].append(item)
            continue
        if outcome == "failed":
            failed_by_merchant[key].append(item)
            continue
        if outcome != "successful" or item.transaction_date is None or _excluded(item, key):
            continue
        text = _text(item)
        category = (item.categorisation.category_name or "").strip()
        is_known_service = key in {"CHATGPT", "CURSOR", "APPLE", "SPOTIFY"}
        recurring_hint = (
            category == "Subscriptions"
            or any(marker in text for marker in _RECURRING_MARKERS)
            or (key == "CURSOR" and product_kind == "usage" and "USAGE" in text)
            or (is_known_service and product_kind != "usage")
        )
        if not recurring_hint:
            continue
        eligible_successes.append((display, key, product_kind, item))

    # A reversal cancels the matching successful debit within three days.
    cancelled: set[str] = set()
    for _display, key, _kind, payment in eligible_successes:
        if payment.transaction_date is None:
            continue
        for reversal in reversals.get(key, []):
            if reversal.transaction_date is None:
                continue
            if (
                abs((reversal.transaction_date - payment.transaction_date).days) <= 3
                and abs(abs(reversal.amount) - abs(payment.amount)) <= Decimal("0.01")
            ):
                cancelled.add(payment.transaction_id)

    for display, key, product_kind, item in eligible_successes:
        if item.transaction_id in cancelled:
            continue
        # Variable usage charges form a single usage product regardless of
        # amount. Subscription charges are clustered so independent Apple
        # products remain separate and modest price changes stay together.
        if product_kind == "usage":
            cluster_index = 0
        else:
            cluster_key = (key, product_kind)
            clusters = product_clusters[cluster_key]
            cluster = _amount_cluster(abs(item.amount), clusters)
            assert cluster is not None
            cluster_index = clusters.index(cluster)
        successful_by_product[(key, product_kind, cluster_index)].append(item)

    results: list[SubscriptionGroup] = []
    for (key, product_kind, cluster_index), rows in sorted(successful_by_product.items()):
        rows.sort(key=lambda row: (row.transaction_date or date.min, row.transaction_id))
        amounts = [abs(row.amount) for row in rows]
        failure_candidates = failed_by_merchant.get(key, [])
        matched_failures: list[FeatureTransaction] = []
        centre = Decimal(str(median(amounts))) if amounts else None
        tolerance = Decimal("2") if centre is not None and centre < Decimal("20") else (centre or Decimal("0")) * Decimal("0.15")
        for failure in failure_candidates:
            intended = _referenced_amount(failure)
            if intended is not None and centre is not None and abs(intended - centre) <= tolerance:
                matched_failures.append(failure)
            elif intended is None and failure.transaction_date and any(
                row.transaction_date and abs((failure.transaction_date - row.transaction_date).days) <= 5
                for row in rows
            ):
                # Some banks expose a fee/failed line without the attempted
                # purchase value. Associate it only when temporally adjacent
                # to an observed successful charge for this same merchant.
                matched_failures.append(failure)
        # A service with one successful charge plus a matching failed attempt
        # is shown with low confidence; unmatched failures never invent a bill.
        if len(rows) < 2 and not (len(rows) == 1 and matched_failures):
            continue
        if product_kind == "usage" and len(rows) < 2:
            continue

        dates = [row.transaction_date for row in rows if row.transaction_date]
        intervals = [(right - left).days for left, right in zip(dates, dates[1:])]
        distinct_months = {(value.year, value.month) for value in dates}
        monthly_calendar = (
            len(distinct_months) >= 2
            and all((right.year * 12 + right.month) - (left.year * 12 + left.month) == 1 for left, right in zip(dates, dates[1:]))
            and all(gap <= 45 for gap in intervals)
        )
        cadence, cadence_days, interval_late = _cadence(intervals)
        if monthly_calendar:
            cadence, cadence_days = "monthly", Decimal("30")
        current = amounts[-1] if amounts else None
        fixed = product_kind != "usage" and bool(amounts) and (
            max(amounts) - min(amounts) <= (Decimal("2") if (current or Decimal("0")) < Decimal("20") else (current or Decimal("0")) * Decimal("0.15"))
        )
        classification = "variable" if product_kind == "usage" or not fixed else "fixed"
        expected_day = _expected_day(rows) if monthly_calendar else None
        late_dates = [row.transaction_date for row in rows if row.transaction_date and expected_day and row.transaction_date.day > expected_day + 7]
        late_count = max(interval_late, len(late_dates))
        if classification == "variable":
            span_months = max(1, ((dates[-1].year - dates[0].year) * 12 + dates[-1].month - dates[0].month + 1)) if dates else 1
            monthly_cost = (sum(amounts, Decimal("0")) / Decimal(span_months)).quantize(Decimal("0.01"))
        elif cadence == "monthly" and current is not None:
            monthly_cost = current.quantize(Decimal("0.01"))
        elif cadence_days and cadence_days > 0 and current is not None and cadence != "irregular":
            monthly_cost = (current * Decimal("30") / cadence_days).quantize(Decimal("0.01"))
        else:
            monthly_cost = None

        last_success = dates[-1] if dates else None
        next_expected = _next_month_day(last_success, expected_day) if last_success and expected_day else None
        recent_failures = [row for row in matched_failures if row.transaction_date and last_success and row.transaction_date > last_success]
        if recent_failures:
            status = "failed_recently"
        elif late_count:
            status = "late"
        elif window_end and last_success and (window_end - last_success).days > 75:
            status = "ended"
        else:
            status = "active"
        total_fees = sum((abs(row.amount) for row in matched_failures if _is_failure_fee(row)), Decimal("0"))
        observations = [
            SubscriptionObservation(transaction_id=row.transaction_id, transaction_date=row.transaction_date, amount=abs(row.amount), outcome="successful")
            for row in rows
        ]
        observations.extend(
            SubscriptionObservation(
                transaction_id=row.transaction_id,
                transaction_date=row.transaction_date,
                amount=_referenced_amount(row) or abs(row.amount),
                outcome="failed",
                fee_amount=abs(row.amount) if _is_failure_fee(row) else None,
                referenced_amount=_referenced_amount(row),
            )
            for row in matched_failures
        )
        display = {"CHATGPT": "ChatGPT", "CURSOR": "Cursor", "APPLE": "Apple", "SPOTIFY": "Spotify"}.get(key, _merchant(rows[-1])[0])
        history = [
            {"date": row.transaction_date.isoformat(), "amount": abs(row.amount)}
            for row in rows if row.transaction_date
        ]
        results.append(SubscriptionGroup(
            merchant_name=display,
            merchant_key=key,
            product_key=f"{key}:{product_kind}:{cluster_index}",
            classification=classification,
            cadence=cadence,
            cadence_days=cadence_days,
            status=status,
            expected_day_of_month=expected_day,
            last_successful_charge=last_success,
            next_expected_date=next_expected,
            late_payment_count=late_count,
            failed_payment_attempt_count=len(matched_failures),
            total_failure_fees=total_fees,
            current_amount=current,
            amount_history=amounts,
            price_history=history,
            estimated_monthly_cost=monthly_cost,
            confidence="high" if len(rows) >= 3 and cadence != "irregular" else "medium" if rows else "low",
            matched_transaction_ids=[row.transaction_id for row in rows + matched_failures],
            successful_transaction_ids=[row.transaction_id for row in rows],
            failed_transaction_ids=[row.transaction_id for row in matched_failures],
            observations=observations,
        ))
    return sorted(results, key=lambda item: (item.merchant_key, item.product_key, item.current_amount or Decimal("0")))


def _is_failure_fee(item: FeatureTransaction) -> bool:
    raw = (item.description or "").strip().upper()
    return (
        raw.startswith("FEE:")
        or raw.startswith("FEE ")
        or " FEE" in raw
        or item.categorisation.transaction_class == "bank_fee"
        or (item.categorisation.category_name or "").strip().casefold() == "bank fees"
    )
