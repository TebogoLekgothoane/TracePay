"""Candidates for free-trial conversion and for unidentified recurring payees.

Both are built only from rows that exist in the data. No trial date, merchant
identity or cause is inferred beyond what a row or its description states.
"""

from __future__ import annotations

import re
from collections import defaultdict
from decimal import Decimal
from statistics import median

from .common import ZERO, amount_of, is_purchase_reversal, merchant_group_key
from .models import FeatureTransaction, TrialConversionCandidate, UnidentifiedRecurringCandidate

# Mirrors engine.HIGH_CONFIDENCE (engine imports this module, so it cannot be imported here).
_HIGH_CONFIDENCE = 0.85

# --------------------------------------------------------------- free-trial conversion

_TRIAL_WORDING = re.compile(
    r"\bFREE\s+TRIAL\b|\bTRIAL\b|\bINTRO(?:DUCTORY)?\s+OFFER\b|\bFREE\s+MONTH\b|\b1\s*(?:MONTH|MTH)\s+FREE\b",
    re.IGNORECASE,
)
# Largest amount still read as a trial record (a card-verification hold or a
# token charge). Anything above it is a paid charge.
TRIAL_MAX_AMOUNT = Decimal("5")
TRIAL_MAX_DAYS_TO_FIRST_PAID = 62


def _is_trial_record(item: FeatureTransaction) -> bool:
    return amount_of(item) == ZERO or bool(_TRIAL_WORDING.search(item.description or ""))


def trial_conversion_candidates(
    transactions: list[FeatureTransaction],
) -> list[TrialConversionCandidate]:
    """Merchants whose first paid charge follows a recorded trial.

    A candidate needs a trial record that exists in the data: a zero-value row or
    trial wording on a near-zero row. Paid charges before the trial mean the
    customer was already paying, so that is a returning customer, not a conversion.
    """
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if item.transaction_date is None or is_purchase_reversal(item):
            continue
        if item.transaction_type not in {"debit", None}:
            continue
        if (item.categorisation.transaction_class or "unknown") not in {"spending", "unknown"}:
            continue
        if (key := merchant_group_key(item)) is not None:
            groups[key].append(item)
    candidates: list[TrialConversionCandidate] = []
    for merchant, items in sorted(groups.items()):
        items.sort(key=lambda row: (row.transaction_date, row.transaction_id))
        trials = [
            row for row in items if amount_of(row) <= TRIAL_MAX_AMOUNT and _is_trial_record(row)
        ]
        paid = [row for row in items if amount_of(row) > TRIAL_MAX_AMOUNT]
        if not trials or not paid:
            continue
        first_trial = trials[0].transaction_date
        last_trial = trials[-1].transaction_date
        if any(row.transaction_date < first_trial for row in paid):
            continue
        after = [row for row in paid if row.transaction_date >= last_trial]
        if not after:
            continue
        gap = (after[0].transaction_date - last_trial).days
        if gap > TRIAL_MAX_DAYS_TO_FIRST_PAID:
            continue
        amounts = [amount_of(row) for row in after]
        typical = Decimal(str(median(amounts)))
        subscription_votes = sum(
            (row.categorisation.category_name or "").strip() == "Subscriptions" for row in after
        )
        candidates.append(
            TrialConversionCandidate(
                merchant_name=merchant,
                trial_evidence=(
                    "zero_value_record"
                    if any(amount_of(row) == ZERO for row in trials)
                    else "trial_wording"
                ),
                trial_dates=[row.transaction_date for row in trials],
                trial_transaction_ids=[row.transaction_id for row in trials],
                paid_dates=[row.transaction_date for row in after],
                paid_amounts=amounts,
                paid_transaction_ids=[row.transaction_id for row in after],
                days_from_trial_to_first_paid=gap,
                amount_stable=all(
                    abs(amount - typical) <= max(Decimal("1"), typical * Decimal("0.05"))
                    for amount in amounts
                ),
                subscription_category=subscription_votes * 2 >= len(after),
            )
        )
    return candidates


# ------------------------------------------------- unidentified recurring payees

# Words that say how a payment was made, not who was paid.
_BOILERPLATE = frozenset(
    {
        "POS", "PURCHASE", "CARD", "PAYMENT", "PAYMENTS", "DEBIT", "ORDER", "ONLINE",
        "FEE", "FEES", "THE", "AND", "FOR", "REF", "REFERENCE", "TXN", "TRN", "AUTH",
        "CREDIT", "DEPOSIT", "BANK", "ACC", "ACCOUNT", "ZA", "RSA", "PTY", "LTD", "CPT",
        "JHB", "DURBAN", "PRETORIA", "SANDTON", "MONTHLY", "SUBSCRIPTION",
    }
)
# A description carrying any of these is a movement of money, not a payee.
_NON_PAYEE = frozenset(
    {"TRANSFER", "PAYSHAP", "EFT", "SAVINGS", "CASH", "ATM", "WITHDRAWAL", "SALARY", "REFUND", "REVERSAL"}
)
# Prefix of the internal group name used for a payee that is not a recognised merchant.
UNIDENTIFIED_GROUP_PREFIX = "unidentified:"
MIN_UNIDENTIFIED_PAYMENTS = 3
MIN_UNIDENTIFIED_AMOUNT = Decimal("20")
UNIDENTIFIED_AMOUNT_SPREAD = Decimal("0.15")
_CADENCES: tuple[tuple[str, int, int], ...] = (
    ("weekly", 7, 2),
    ("fortnightly", 14, 3),
    ("monthly", 30, 5),
    ("bimonthly", 60, 6),
    ("quarterly", 91, 8),
)
_UNKNOWN_CATEGORIES = frozenset({"", "other", "uncategorised", "uncategorized", "unknown"})


def unidentified_signature(item: FeatureTransaction) -> str | None:
    """A stable name for a payee the engine could not identify, or None.

    Only the distinctive words of the description are kept, so a reference number
    or card suffix does not split one payee into many. A description with no
    distinctive word identifies nothing and is never grouped.
    """
    if merchant_group_key(item) is not None or is_purchase_reversal(item):
        return None
    if item.transaction_type not in {"debit", None}:
        return None
    if (item.categorisation.transaction_class or "unknown") not in {"spending", "unknown"}:
        return None
    if (item.categorisation.category_name or "").strip().casefold() not in _UNKNOWN_CATEGORIES:
        return None
    words = re.findall(r"[A-Z]{3,}", re.sub(r"[•*]+\d*", " ", (item.description or "").upper()))
    if any(word in _NON_PAYEE for word in words):
        return None
    distinctive = [word for word in words if word not in _BOILERPLATE]
    return " ".join(distinctive[:4]) or None


def unidentified_recurring_candidates(
    transactions: list[FeatureTransaction],
) -> list[UnidentifiedRecurringCandidate]:
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    for item in transactions:
        if item.transaction_date is None:
            continue
        if (signature := unidentified_signature(item)) is not None:
            groups[signature].append(item)
    candidates: list[UnidentifiedRecurringCandidate] = []
    for signature, items in sorted(groups.items()):
        items.sort(key=lambda row: (row.transaction_date, row.transaction_id))
        if len({row.transaction_date for row in items}) < MIN_UNIDENTIFIED_PAYMENTS:
            continue
        amounts = [amount_of(row) for row in items]
        typical = Decimal(str(median(amounts)))
        if typical < MIN_UNIDENTIFIED_AMOUNT:
            continue
        if (max(amounts) - min(amounts)) > typical * UNIDENTIFIED_AMOUNT_SPREAD:
            continue
        gaps = [
            (later.transaction_date - earlier.transaction_date).days
            for earlier, later in zip(items, items[1:])
        ]
        centre = Decimal(str(median(gaps)))
        match = next(
            (
                (name, days)
                for name, days, tolerance in _CADENCES
                if abs(centre - days) <= tolerance
            ),
            None,
        )
        if match is None:
            continue
        cadence, days = match
        # Billing dates drift with weekends and holidays; most gaps must still
        # sit near the usual cadence.
        window = max(3, round(days * 0.2))
        near = sum(abs(gap - days) <= window for gap in gaps)
        if near / len(gaps) < 0.8:
            continue
        candidates.append(
            UnidentifiedRecurringCandidate(
                description_signature=signature,
                transaction_ids=[row.transaction_id for row in items],
                dates=[row.transaction_date for row in items],
                amounts=amounts,
                median_interval_days=centre,
                cadence=cadence,  # type: ignore[arg-type]
                high_confidence_transaction_count=sum(
                    row.categorisation.classification_confidence >= _HIGH_CONFIDENCE
                    for row in items
                ),
            )
        )
    return candidates
