"""Deterministic subscription detection, independent of leak scoring.

The pipeline runs in fixed steps, each consuming only the previous step:

A. Normalise every row (uppercase, strip references, phones, branches, dates,
   country suffixes and ``*``). The raw description is kept for display.
B. Classify every row. Only ``payment`` rows set amounts or dates; failed
   attempts are evidence, and their R10/R3 fee is a cost, never the price.
C. Map merchants to canonical services through the alias table, with an
   optional resolver (the LLM layer) for strings the table does not know.
D. Group payments by (canonical merchant, amount cluster).
E. Classify each group as fixed, variable usage or one-off.
F. Derive cadence and lateness from successful payments, in calendar months.
G. Take the current amount from the latest payment and derive the monthly
   estimate from real totals, never ``amount x 30 / interval`` on irregular data.
H. Build the output with price history and matched rows.
I. Rows are sorted by (date, id) before anything else, the analysis date is
   the latest row date rather than the clock, and nothing is random, so the
   same stored transactions always produce the same output.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from statistics import median, median_low
import re

from .common import is_purchase_reversal
from .models import FeatureTransaction, SubscriptionGroup, SubscriptionObservation
from .subscription_aliases import resolve_alias

ZERO = Decimal("0")
CENT = Decimal("0.01")

# Optional resolver for merchant strings the alias table does not know. It
# receives normalised merchant strings and returns {merchant: (canonical
# name, display name)}. It can only name a merchant; it never sees amounts.
MerchantResolver = Callable[[list[str]], dict[str, tuple[str, str]]]

_MONTHS = r"JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC"
_RECURRING_MARKERS = ("RECURRING", "SUBSCRIPTION", "SUBSCR", "MONTHLY", "DEBIT ORDER", "DEBICHECK")
_INTERNAL_TRANSFER_MARKERS = (
    "GOALSAVE", "MONEY ADDED TO FIXED DEPOSIT", "FIXED DEPOSIT", "MONEY EARLY PAID OUT",
)
_EXCLUDED_TEXT = (
    "MR D FOOD", "VAS -", "VAS PURCHASE", "VAS MOBILE", "AIRTIME", "DATA BUNDLE",
    "PAYSHAP", "ONCE-OFF PAYMENT", "ONCE OFF PAYMENT", "CASH WITHDRAWAL", "CHECKERS",
    "SHOPRITE", "PICK N PAY", "WOOLWORTHS FOOD",
)
# Ride-hailing, food delivery, ATMs and grocers, matched as whole words.
_EXCLUDED_WORDS = re.compile(r"\b(?:UBER|BOLT|ATM|SPAR|PNP|BOXER)\b")
_EXCLUDED_CATEGORIES = {
    "airtime & data", "groceries", "fast food", "restaurants", "transport",
    "cash withdrawal", "transfers", "food delivery", "ride hailing",
}
_EXCLUDED_CLASSES = {"person_to_person"}
_INTERNAL_CLASSES = {"internal_transfer", "savings", "investment"}

_REFERENCED_AMOUNT = re.compile(r"\bFOR\s+(?:ZAR|R)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.I)
_REFERENCE = re.compile(
    r"\b(?:REF(?:ERENCE)?|AUTH|TRN|TXN)\s*(?:NO\.?)?\s*[:#-]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)", re.I
)
_PHONE = re.compile(r"(?<![\w.])\+?\d[\d ]{7,14}\d(?![\w.])")
_BRANCH = re.compile(r"\bBRANCH\s*:?\s*\S+")
_ESTAMP = re.compile(r"\bE-?STAMP\b\s*\S*")
_DATES = re.compile(
    rf"\b\d{{4}}-\d{{2}}-\d{{2}}\b|\b\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}\b"
    rf"|\b\d{{1,2}}\s+(?:{_MONTHS})[A-Z]*\s+\d{{2,4}}\b"
)
_MONTH_WORDS = re.compile(rf"\b(?:{_MONTHS})[A-Z]*\b|\bMID\b")
_COUNTRY = re.compile(r"\b(?:US|IE|ZA|GB|USA)\b")
_LONG_NUMBER = re.compile(r"\b\d{4,}\b")
_FOR_AMOUNT_TAIL = re.compile(r"\bFOR\s+(?:ZAR|R)\s*[0-9].*$")
_LEADING_BOILERPLATE = re.compile(
    r"^(?:(?:FEE\s+REVERSAL|FEE|REVERSAL|UNSUCCESSFUL|INT(?:ERNATIONAL)?|RECURRING|CARD|PAYMENT|"
    r"PURCHASE|DEBIT\s+ORDER|FROM|TO|AT|WITH|EPOS|POS)\b|[,:\-])\s*"
)
_FEE_PREFIX = re.compile(r"^FEE\b")


@dataclass
class _Row:
    item: FeatureTransaction
    raw: str
    text: str
    merchant_text: str
    row_class: str
    amount: Decimal
    referenced_amount: Decimal | None
    reference: str | None
    canonical_name: str = ""
    merchant_key: str = ""
    display_name: str = ""
    billing: str = "subscription"
    known_service: bool = False

    @property
    def day(self) -> date:
        assert self.item.transaction_date is not None
        return self.item.transaction_date

    @property
    def id(self) -> str:
        return self.item.transaction_id


@dataclass
class _Group:
    merchant_key: str
    canonical_name: str
    display_name: str
    billing: str
    payments: list[_Row] = field(default_factory=list)
    failures: list[_Row] = field(default_factory=list)
    product_key: str = ""

    def centre(self) -> Decimal:
        return Decimal(str(median(row.amount for row in self.payments)))


# ---------------------------------------------------------------- A. normalise


def normalise_description(description: str) -> str:
    """Uppercase, join wrapped lines and collapse whitespace."""
    return " ".join((description or "").upper().split())


def normalise_merchant(description: str) -> str:
    """Strip statement noise and transaction-type boilerplate from a description."""
    text = normalise_description(description)
    text = _FOR_AMOUNT_TAIL.sub(" ", text)
    text = _REFERENCE.sub(" ", text)
    text = _BRANCH.sub(" ", text)
    text = _ESTAMP.sub(" ", text)
    text = _DATES.sub(" ", text)
    text = _PHONE.sub(" ", text)
    text = text.replace("*", " ")
    text = _COUNTRY.sub(" ", text)
    text = _LONG_NUMBER.sub(" ", text)
    text = " ".join(text.split())
    previous = None
    while previous != text:
        previous = text
        text = _LEADING_BOILERPLATE.sub("", text).strip()
    return text.strip(" ,-:")


def _merchant_key_text(merchant_text: str) -> str:
    """Key for merchants outside the alias table: month words dropped."""
    return " ".join(_MONTH_WORDS.sub(" ", merchant_text).split()) or merchant_text


def _referenced_amount(raw: str) -> Decimal | None:
    match = _REFERENCED_AMOUNT.search(raw)
    if not match:
        return None
    try:
        return Decimal(match.group(1).replace(",", ""))
    except Exception:
        return None


def _reference(raw: str) -> str | None:
    match = _REFERENCE.search(raw)
    return match.group(1).upper() if match else None


# ----------------------------------------------------------------- B. classify


def classify_row(item: FeatureTransaction) -> str:
    """Return the row class used by subscription detection."""
    raw = normalise_description(item.description)
    merchant = normalise_merchant(item.description)
    result = item.categorisation
    category = (result.category_name or "").strip().casefold()
    if raw.startswith("FEE: UNSUCCESSFUL") or "INSUFFICIENT FUNDS" in raw or "UNSUCCESSFUL" in raw:
        return "failed_attempt"
    if raw.startswith("FEE REVERSAL"):
        return "fee_reversal"
    if raw.startswith("REVERSAL") or is_purchase_reversal(item):
        return "reversal"
    if _FEE_PREFIX.match(raw) or result.transaction_class == "bank_fee":
        return "fee"
    if any(marker in raw for marker in _INTERNAL_TRANSFER_MARKERS) or result.transaction_class in _INTERNAL_CLASSES:
        return "internal_transfer"
    if item.transaction_type == "credit" or result.transaction_class == "income":
        return "credit"
    if (
        any(marker in raw for marker in _EXCLUDED_TEXT)
        or _EXCLUDED_WORDS.search(raw)
        or result.transaction_class in _EXCLUDED_CLASSES
    ):
        return "excluded_category"
    # Category labels come from categorisation and can be wrong; a service in
    # the alias table is never excluded on its category alone.
    if category in _EXCLUDED_CATEGORIES and resolve_alias(merchant) is None:
        return "excluded_category"
    return "payment"


def _normalise_rows(transactions: Iterable[FeatureTransaction]) -> list[_Row]:
    ordered = sorted(
        (item for item in transactions if item.transaction_date is not None),
        key=lambda item: (item.transaction_date, item.transaction_id),
    )
    rows: list[_Row] = []
    seen: set[tuple] = set()
    for item in ordered:
        if item.is_duplicate:
            continue
        # Import dedupe key; only applied when the running balance is known,
        # otherwise two genuine identical charges on one day would collapse.
        if item.balance is not None:
            key = (item.transaction_date, (item.description or "").strip(), abs(item.amount), item.balance)
            if key in seen:
                continue
            seen.add(key)
        raw = item.description or ""
        rows.append(_Row(
            item=item,
            raw=raw,
            text=normalise_description(raw),
            merchant_text=normalise_merchant(raw),
            row_class=classify_row(item),
            amount=abs(item.amount),
            referenced_amount=_referenced_amount(raw),
            reference=_reference(raw),
        ))
    return rows


# ------------------------------------------------------------- C. canonicalise


def _row_hint(row: _Row) -> bool:
    return any(marker in row.text for marker in _RECURRING_MARKERS) or (
        (row.item.categorisation.category_name or "").strip().casefold() == "subscriptions"
    )


def _canonicalise(rows: list[_Row], resolver: MerchantResolver | None) -> set[str]:
    """Set canonical names in place; return the names the resolver supplied."""
    unknown: set[str] = set()
    for row in rows:
        if row.row_class not in {"payment", "failed_attempt", "reversal"}:
            continue
        alias = resolve_alias(row.merchant_text) or resolve_alias(row.text)
        if alias is not None:
            row.canonical_name = alias.canonical_name
            row.merchant_key = alias.merchant_key
            row.display_name = alias.display_name
            row.billing = alias.billing
            row.known_service = True
        elif row.merchant_text and _row_hint(row):
            # Only strings that already look recurring go to the resolver, so
            # ordinary purchases and person names are never sent anywhere.
            unknown.add(_merchant_key_text(row.merchant_text))
    resolved: dict[str, tuple[str, str]] = {}
    if resolver is not None and unknown:
        try:
            resolved = resolver(sorted(unknown)) or {}
        except Exception:
            resolved = {}
    supplied: set[str] = set()
    for row in rows:
        if row.canonical_name or row.row_class not in {"payment", "failed_attempt", "reversal"}:
            continue
        key_text = _merchant_key_text(row.merchant_text)
        if not key_text:
            continue
        if key_text in resolved:
            canonical, display = resolved[key_text]
            row.canonical_name = canonical
            row.merchant_key = canonical.upper().replace("_", " ")
            row.display_name = display
            supplied.add(canonical)
        else:
            row.canonical_name = key_text.casefold()
            row.merchant_key = key_text
            row.display_name = key_text.title()
    return supplied


# --------------------------------------------------------- reversal matching


def _cancel_reversals(rows: list[_Row]) -> set[str]:
    """A reversal cancels one matching payment; both are excluded."""
    payments = [row for row in rows if row.row_class == "payment" and row.merchant_key]
    cancelled: set[str] = set()
    for reversal in (row for row in rows if row.row_class == "reversal"):
        candidates = [row for row in payments if row.id not in cancelled]
        match = None
        if reversal.reference:
            match = next((row for row in candidates if row.reference == reversal.reference), None)
        if match is None:
            close = [
                row for row in candidates
                if row.merchant_key == reversal.merchant_key
                and abs(row.amount - reversal.amount) <= CENT
                and abs((reversal.day - row.day).days) <= 3
            ]
            close.sort(key=lambda row: (abs((reversal.day - row.day).days), row.day, row.id))
            match = close[0] if close else None
        if match is not None:
            cancelled.update({match.id, reversal.id})
    return cancelled


# ------------------------------------------------------------------ D. group


def _tolerance(centre: Decimal) -> Decimal:
    return Decimal("2") if centre < Decimal("20") else centre * Decimal("0.15")


def _within(amount: Decimal, centre: Decimal) -> bool:
    return abs(amount - centre) <= _tolerance(centre)


def _group_payments(payments: list[_Row]) -> list[_Group]:
    groups: dict[tuple[str, str], list[_Group]] = defaultdict(list)
    for row in payments:
        bucket = groups[(row.merchant_key, row.canonical_name)]
        if row.billing == "usage":
            # Metered usage is one product regardless of amount.
            if not bucket:
                bucket.append(_Group(row.merchant_key, row.canonical_name, row.display_name, "usage"))
            bucket[0].payments.append(row)
            continue
        fits = [(abs(row.amount - group.centre()), index) for index, group in enumerate(bucket) if _within(row.amount, group.centre())]
        if fits:
            bucket[min(fits)[1]].payments.append(row)
        else:
            bucket.append(_Group(row.merchant_key, row.canonical_name, row.display_name, "subscription", [row]))
    result: list[_Group] = []
    for bucket in groups.values():
        for group in bucket:
            kind = "usage" if group.billing == "usage" else "subscription"
            group.product_key = f"{group.merchant_key}:{kind}:{group.payments[0].amount.quantize(CENT)}"
            result.append(group)
    return result


def _attach_failures(groups: list[_Group], failures: list[_Row]) -> None:
    for failure in failures:
        candidates = [
            group for group in groups
            if group.billing != "usage"
            and group.merchant_key == failure.merchant_key
            and group.canonical_name == failure.canonical_name
        ]
        if failure.referenced_amount is not None:
            fits = [
                (abs(failure.referenced_amount - group.centre()), group.product_key, group)
                for group in candidates if _within(failure.referenced_amount, group.centre())
            ]
        else:
            # Without the attempted amount, attach only to the product charged
            # closest in time, and only within roughly one billing cycle.
            fits = []
            for group in candidates:
                distance = min(abs((failure.day - row.day).days) for row in group.payments)
                if distance <= 35:
                    fits.append((Decimal(distance), group.product_key, group))
        if fits:
            min(fits, key=lambda fit: (fit[0], fit[1]))[2].failures.append(failure)


def _leftover_usage(groups: list[_Group]) -> list[_Group]:
    """Fold one-off charges of a merchant into one variable-spend group.

    Clusters with a single payment and no failed attempt are one-offs. When a
    merchant has several of these across months its spend varies too much
    to be a subscription, so it is reported once as variable spend.
    """
    kept: list[_Group] = []
    leftovers: dict[tuple[str, str], list[_Group]] = defaultdict(list)
    for group in groups:
        if group.billing != "usage" and len(group.payments) == 1 and not group.failures:
            leftovers[(group.merchant_key, group.canonical_name)].append(group)
        else:
            kept.append(group)
    for (merchant_key, canonical), singles in leftovers.items():
        rows = sorted((row for group in singles for row in group.payments), key=lambda row: (row.day, row.id))
        months = {(row.day.year, row.day.month) for row in rows}
        if len(rows) >= 2 and len(months) >= 2:
            merged = _Group(merchant_key, canonical, singles[0].display_name, "usage", rows)
            merged.product_key = f"{merchant_key}:usage:variable"
            kept.append(merged)
    return kept


# ------------------------------------------------------------- F. cadence


_MONTH_CADENCES = {1: "monthly", 2: "bimonthly", 3: "quarterly", 6: "biannual", 12: "annual"}


def _month_index(value: date) -> int:
    return value.year * 12 + value.month


def _cadence(dates: list[date]) -> tuple[str, int | None, Decimal | None, bool]:
    """Return (label, months per cycle, median gap in days, regular)."""
    if len(dates) < 2:
        return "irregular", None, None, False
    steps = [_month_index(right) - _month_index(left) for left, right in zip(dates, dates[1:])]
    gaps = [(right - left).days for left, right in zip(dates, dates[1:])]
    gap = Decimal(str(median(gaps)))
    step = median_low(steps)
    if step in _MONTH_CADENCES and sum(value == step for value in steps) * 3 >= len(steps) * 2:
        return _MONTH_CADENCES[step], step, gap, True
    # A late charge can roll into the next calendar month; fall back to gaps.
    if Decimal("26") <= gap <= Decimal("35") and sum(20 <= value <= 45 for value in gaps) * 3 >= len(gaps) * 2:
        return "monthly", 1, gap, True
    for target, label, tolerance in ((7, "weekly", 2), (14, "fortnightly", 3)):
        if abs(gap - target) <= tolerance and sum(abs(value - target) <= tolerance for value in gaps) * 3 >= len(gaps) * 2:
            return label, None, gap, True
    return "irregular", None, gap, False


def _day_in_month(year: int, month: int, day: int) -> date:
    while True:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1


def _add_months(value: date, months: int, day: int) -> date:
    index = _month_index(value) - 1 + months
    return _day_in_month(index // 12, index % 12 + 1, day)


def _expected_day(dates: list[date]) -> int:
    counts: dict[int, int] = defaultdict(int)
    for value in dates:
        counts[value.day] += 1
    return min(counts, key=lambda day: (-counts[day], day))


def _late_payments(payments: list[_Row], failures: list[_Row], expected_day: int) -> list[date]:
    """A payment is late when it lands after its due date and either a failed
    attempt sits between the due date and the payment, or it is over a week late."""
    late: list[date] = []
    for row in payments[1:]:
        due = _day_in_month(row.day.year, row.day.month, expected_day)
        delay = (row.day - due).days
        if delay <= 3:
            continue
        retried = any(due - timedelta(days=3) <= failure.day < row.day for failure in failures)
        if retried or delay > 7:
            late.append(row.day)
    return late


def _window_months(start: date, end: date) -> int:
    return max(1, _month_index(end) - _month_index(start) + 1)


# ------------------------------------------------------------ H. build output


def _fee_amount(row: _Row) -> Decimal:
    if row.referenced_amount is not None and abs(row.amount - row.referenced_amount) <= CENT:
        return ZERO
    return row.amount


def _has_recurring_hint(group: _Group) -> bool:
    for row in group.payments + group.failures:
        if row.known_service or any(marker in row.text for marker in _RECURRING_MARKERS):
            return True
        if (row.item.categorisation.category_name or "").strip().casefold() == "subscriptions":
            return True
    return False


def _build(group: _Group, window_start: date, as_of: date) -> SubscriptionGroup | None:
    payments = sorted(group.payments, key=lambda row: (row.day, row.id))
    failures = sorted(group.failures, key=lambda row: (row.day, row.id))
    if not payments or not _has_recurring_hint(group):
        return None
    if len(payments) == 1 and not failures:
        return None  # one-off
    if group.billing == "usage" and len(payments) < 2:
        return None

    dates = [row.day for row in payments]
    amounts = [row.amount for row in payments]
    current = amounts[-1]
    last_success = dates[-1]
    cadence, step, gap, regular = _cadence(dates)
    fixed = group.billing != "usage" and (regular or len(payments) == 1)

    expected_day = _expected_day(dates) if fixed and step else None
    late_dates = _late_payments(payments, failures, expected_day) if expected_day else []
    if fixed and step and expected_day:
        next_expected = _add_months(last_success, step, expected_day)
    elif fixed and gap:
        next_expected = last_success + timedelta(days=int(gap))
    else:
        next_expected = None

    if fixed and cadence == "monthly":
        monthly = current.quantize(CENT)
    elif fixed and gap and cadence != "irregular":
        monthly = (current * Decimal("30") / gap).quantize(CENT)
    elif not fixed:
        monthly = (sum(amounts, ZERO) / Decimal(_window_months(window_start, as_of))).quantize(CENT)
    else:
        monthly = None  # one payment plus failed retries: no cadence evidence yet

    failures_after = [row for row in failures if row.day > last_success]
    idle = (as_of - last_success).days
    limit = int(gap) + 15 if gap and step and step > 1 else 45
    if not fixed:
        status = "ended" if idle > 75 else "active"
    elif idle > limit:
        recent = any((as_of - row.day).days <= 30 for row in failures_after)
        status = "failed_recently" if recent else "ended"
    elif next_expected and as_of > next_expected and (
        as_of > next_expected + timedelta(days=3)
        or any(row.day >= next_expected - timedelta(days=3) for row in failures_after)
    ):
        # The due date passed without a successful payment, and either the
        # grace period is over or the merchant is already retrying.
        status = "late"
    elif failures_after:
        status = "failed_recently"
    elif late_dates and late_dates[-1] == last_success:
        status = "late"
    else:
        status = "active"

    if not fixed:
        confidence = "medium" if len(payments) >= 3 else "low"
    elif len(payments) >= 3 and regular:
        confidence = "high"
    elif len(payments) >= 2 and regular:
        confidence = "medium"
    else:
        confidence = "low"

    price_changes = [
        {"date": right.day.isoformat(), "from": left.amount, "to": right.amount}
        for left, right in zip(payments, payments[1:])
        if right.amount != left.amount
    ]
    observations = [
        SubscriptionObservation(transaction_id=row.id, transaction_date=row.day, amount=row.amount, outcome="successful")
        for row in payments
    ] + [
        SubscriptionObservation(
            transaction_id=row.id,
            transaction_date=row.day,
            amount=row.referenced_amount or row.amount,
            outcome="failed",
            fee_amount=_fee_amount(row) or None,
            referenced_amount=row.referenced_amount,
        )
        for row in failures
    ]
    matched = sorted(payments + failures, key=lambda row: (row.day, row.id))
    return SubscriptionGroup(
        merchant_name=group.display_name,
        merchant_key=group.merchant_key,
        product_key=group.product_key,
        canonical_name=group.canonical_name,
        classification="fixed" if fixed else "variable",
        cadence=cadence if fixed else "irregular",
        cadence_days=gap,
        status=status,
        expected_day_of_month=expected_day,
        last_successful_charge=last_success,
        next_expected_date=next_expected,
        late_payment_count=len(late_dates),
        late_payment_dates=late_dates,
        failed_payment_attempt_count=len(failures),
        total_failure_fees=sum((_fee_amount(row) for row in failures), ZERO),
        current_amount=current,
        amount_history=amounts,
        price_history=[{"date": row.day.isoformat(), "amount": row.amount} for row in payments],
        price_changes=price_changes,
        estimated_monthly_cost=monthly,
        confidence=confidence,
        successful_payment_count=len(payments),
        matched_transaction_ids=[row.id for row in matched],
        successful_transaction_ids=[row.id for row in payments],
        failed_transaction_ids=[row.id for row in failures],
        observations=observations,
    )


def detect_subscriptions(
    transactions: list[FeatureTransaction],
    *,
    merchant_resolver: MerchantResolver | None = None,
) -> list[SubscriptionGroup]:
    """Build stable subscription candidates from canonical transaction rows."""
    rows = _normalise_rows(transactions)
    if not rows:
        return []
    window_start, as_of = rows[0].day, rows[-1].day
    supplied = _canonicalise(rows, merchant_resolver)
    cancelled = _cancel_reversals(rows)
    payments = [row for row in rows if row.row_class == "payment" and row.merchant_key and row.id not in cancelled]
    failures = [row for row in rows if row.row_class == "failed_attempt" and row.merchant_key]
    groups = _group_payments(payments)
    _attach_failures(groups, failures)
    groups = _leftover_usage(groups)
    results = [item for group in groups if (item := _build(group, window_start, as_of)) is not None]
    if supplied:
        # Record which model and prompt named each externally labelled group.
        provenance = {
            "ai_model": getattr(merchant_resolver, "model", None),
            "ai_prompt_version": getattr(merchant_resolver, "prompt_version", None),
        }
        results = [item.model_copy(update=provenance) if item.canonical_name in supplied else item for item in results]
    return sorted(results, key=lambda item: (item.merchant_key, item.product_key))
