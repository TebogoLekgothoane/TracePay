"""Candidates for free-trial conversion and for unidentified recurring payees.

Both are built only from rows that exist in the data. No trial date, merchant
identity or cause is inferred beyond what a row or its description states.
"""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal
from statistics import median

from .common import ZERO, amount_of, is_purchase_reversal, merchant_group_key
from .models import (
    FeatureTransaction,
    PenaltyFeeCandidate,
    PersonPaymentCandidate,
    TrialConversionCandidate,
    UnidentifiedRecurringCandidate,
)

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


def _regular_cadence(dates: list[date]) -> tuple[str, Decimal] | None:
    """``(cadence name, median gap in days)`` when the dates repeat on a usual cadence.

    Billing dates drift with weekends and holidays, so most gaps must still sit
    near the usual cadence rather than every one matching it exactly.
    """
    gaps = [(later - earlier).days for earlier, later in zip(dates, dates[1:])]
    if not gaps:
        return None
    centre = Decimal(str(median(gaps)))
    match = next(
        ((name, days) for name, days, tolerance in _CADENCES if abs(centre - days) <= tolerance),
        None,
    )
    if match is None:
        return None
    cadence, days = match
    window = max(3, round(days * 0.2))
    near = sum(abs(gap - days) <= window for gap in gaps)
    if near / len(gaps) < 0.8:
        return None
    return cadence, centre


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
        regular = _regular_cadence([row.transaction_date for row in items])
        if regular is None:
            continue
        cadence, centre = regular
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


# ------------------------------------------------------------ penalty fees

_PENALTY_WORDING = re.compile(
    r"\bLATE\s+(?:PAYMENT|PAY|FEE|CHARGE|PENALTY|SETTLEMENT)\b"
    r"|\bPENALT(?:Y|IES)\b"
    r"|\b(?:RECONNECTION|RECONNECT|DISCONNECTION|REINSTATEMENT)\s+(?:FEE|CHARGE)\b"
    r"|\bOVERDUE\s+(?:FEE|CHARGE|INTEREST)\b"
    r"|\bARREARS?\s+(?:FEE|INTEREST|CHARGE)\b",
    re.IGNORECASE,
)
MIN_PENALTY_AMOUNT = Decimal("10")


def penalty_fee_candidates(
    transactions: list[FeatureTransaction],
) -> list[PenaltyFeeCandidate]:
    """Provider-charged penalties, grouped by who charged them.

    Bank-owned charges are left to the bank-fee findings, and a reversal is not a
    charge, so neither is counted here.
    """
    groups: defaultdict[str, list[tuple[FeatureTransaction, str]]] = defaultdict(list)
    merchants: dict[str, bool] = {}
    for item in transactions:
        if item.transaction_date is None or is_purchase_reversal(item):
            continue
        if item.transaction_type not in {"debit", None}:
            continue
        if (item.categorisation.transaction_class or "unknown") not in {"spending", "unknown"}:
            continue
        match = _PENALTY_WORDING.search(item.description or "")
        if match is None or amount_of(item) < MIN_PENALTY_AMOUNT:
            continue
        key = merchant_group_key(item)
        payee = key or unidentified_signature(item) or "UNNAMED PAYEE"
        merchants[payee] = key is not None
        groups[payee].append((item, " ".join(match.group(0).upper().split())))
    candidates: list[PenaltyFeeCandidate] = []
    for payee, rows in sorted(groups.items()):
        rows.sort(key=lambda pair: (pair[0].transaction_date, pair[0].transaction_id))
        candidates.append(
            PenaltyFeeCandidate(
                payee=payee,
                payee_is_merchant=merchants[payee],
                wording=sorted({wording for _, wording in rows}),
                transaction_ids=[item.transaction_id for item, _ in rows],
                dates=[item.transaction_date for item, _ in rows],
                amounts=[amount_of(item) for item, _ in rows],
            )
        )
    return candidates


# ------------------------------------------------------- regular person payments

_RECIPIENT_LEAD = re.compile(
    r"(?:PAYMENT\s+TO|PAY\s+BENEFICIARY|SEND\s*MONEY(?:\s+TO)?|CASH\s+SENT\s+TO|"
    r"TRANSFERRED\s+OUT\s+TO|PAYSHAP(?:\s+PAYMENT)?(?:\s+TO)?|IMMEDIATE\s+PAYMENT|"
    r"EFT(?:\s+PAYMENT)?(?:\s+TO)?|CAPITEC\s+PAY|TRANSFER\s+TO)\s+(?P<rest>.+)",
    re.IGNORECASE,
)
# Words that say which bank or reference, not who was paid.
_RECIPIENT_NOISE = frozenset(
    {
        "CAPITEC", "FNB", "ABSA", "NEDBANK", "STANDARD", "BANK", "TYME", "TYMEBANK", "GOTYME",
        "DISCOVERY", "AFRICAN", "INVESTEC", "MOBILE", "NO", "NUMBER", "ACCOUNT", "ACC", "REF",
        "REFERENCE", "PAYMENT", "FROM", "THE", "AND", "FOR",
    }
)
MIN_PERSON_PAYMENTS = 3
MIN_PERSON_PAYMENT_AMOUNT = Decimal("100")
# Payments to one person rarely match to the rand; they must still sit near the
# usual amount, or they are several unrelated payments to the same person.
PERSON_AMOUNT_BAND = Decimal("0.5")
PERSON_STABLE_SPREAD = Decimal("0.15")


def person_recipient(item: FeatureTransaction) -> tuple[str, str] | None:
    """``(hashed key, masked label)`` for who a transfer went to, or None.

    The key comes from the name words and the last four digits of any number the
    description shows. Neither is kept: only their hash and a masked label.
    """
    match = _RECIPIENT_LEAD.search(re.sub(r"[•*]+", " ", item.description or ""))
    if match is None:
        return None
    rest = match.group("rest").upper()
    digits = re.findall(r"\d{4,}", rest)
    tail = digits[0][-4:] if digits else None
    words = [
        word.strip(".'-")
        for word in re.findall(r"[A-Z][A-Z'.-]*", rest.split(",")[0])
        if word.strip(".'-") and word.strip(".'-") not in _RECIPIENT_NOISE
    ][:3]
    if not words and tail is None:
        return None
    key = f"{' '.join(words)}|{tail or ''}"
    label = (
        f"a recipient ending {tail}"
        if tail
        else f"a recipient ({' '.join(word[0] + '.' for word in words)})"
    )
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12], label


def person_payment_candidates(
    transactions: list[FeatureTransaction],
) -> list[PersonPaymentCandidate]:
    """Recipients paid on a regular cadence, at a similar amount, in at least three payments."""
    groups: defaultdict[str, list[FeatureTransaction]] = defaultdict(list)
    labels: dict[str, str] = {}
    for item in transactions:
        if item.transaction_date is None or item.transaction_type not in {"debit", None}:
            continue
        if item.categorisation.transaction_class != "person_to_person":
            continue
        if (recipient := person_recipient(item)) is None:
            continue
        key, label = recipient
        labels[key] = label
        groups[key].append(item)
    candidates: list[PersonPaymentCandidate] = []
    for key, items in sorted(groups.items()):
        items.sort(key=lambda row: (row.transaction_date, row.transaction_id))
        # One payment per day: a retry or a split payment is not a second cycle.
        dated = list({row.transaction_date: row for row in items}.values())
        if len(dated) < MIN_PERSON_PAYMENTS:
            continue
        amounts = [amount_of(row) for row in dated]
        typical = Decimal(str(median(amounts)))
        if typical < MIN_PERSON_PAYMENT_AMOUNT:
            continue
        if any(abs(amount - typical) > typical * PERSON_AMOUNT_BAND for amount in amounts):
            continue
        regular = _regular_cadence([row.transaction_date for row in dated])
        if regular is None:
            continue
        cadence, centre = regular
        candidates.append(
            PersonPaymentCandidate(
                recipient_key=key,
                recipient_label=labels[key],
                transaction_ids=[row.transaction_id for row in dated],
                dates=[row.transaction_date for row in dated],
                amounts=amounts,
                median_interval_days=centre,
                cadence=cadence,  # type: ignore[arg-type]
                amount_stable=(max(amounts) - min(amounts)) <= typical * PERSON_STABLE_SPREAD,
            )
        )
    return candidates
