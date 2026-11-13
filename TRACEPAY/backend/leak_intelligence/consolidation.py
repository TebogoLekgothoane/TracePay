"""Cross-account consolidation: chronology, internal transfers, reversals, totals.

Everything here is pure and deterministic. Rows are never altered; the result
describes decisions (which debit and credit are one transfer, which credit
reverses which debit) that the caller persists or applies in memory.

Internal-transfer rules
-----------------------
A debit on one account and a credit on a *different* account are one transfer
only when the evidence supports it. Equal amounts alone never do.

Hard requirements (a pair that fails any of these is never proposed):
  * opposite directions, different accounts, both accounts known
  * identical amount to the cent and identical currency (missing currency is ZAR)
  * credit dated no more than 1 day before and no more than 3 days after the
    debit (inter-bank settlement and weekends)
  * neither row is an overlap duplicate or already part of a confirmed pair

Evidence (additive score, capped at 1.0):
  0.35  base: the hard requirements hold
  0.10 / 0.07 / 0.04 / 0.02  credit dated 0 / 1 / 2 / 3 days after the debit
  0.05  credit dated one day before the debit
  0.30  a reference token of 6+ characters appears on both rows
  0.15  a description names the other account's bank
  0.25  a description carries the other account's last four digits
        (per side, at most 0.30; across both sides, at most 0.45)
  0.15  either description uses own-account transfer wording
 -0.25  either description reads like a purchase, salary, interest or debit order

Decision:
  score >= 0.75 and no rival within 0.10 on either row  -> confirmed
  score >= 0.45                                         -> candidate (kept, not claimed)
  otherwise                                             -> no relationship recorded

A confirmed transfer's principal is excluded from income and spending. A
separate payment/transfer fee charged on the paying account on the same or
next day stays in spending and is linked to the transfer as a potential leak.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import date
from decimal import Decimal
from typing import Iterable, Mapping, Sequence

from .common import amount_of, is_purchase_reversal, merchant_group_key
from .models import FeatureTransaction

CREDIT_MAX_LAG_DAYS = 3
CREDIT_MAX_LEAD_DAYS = 1
CONFIRM_THRESHOLD = Decimal("0.75")
CANDIDATE_THRESHOLD = Decimal("0.45")
AMBIGUITY_MARGIN = Decimal("0.10")
REVERSAL_MAX_DAYS = 60
FEE_MAX_ABSOLUTE = Decimal("250")
FEE_MAX_FRACTION = Decimal("0.05")

_BANK_TOKENS: dict[str, tuple[str, ...]] = {
    "capitec": ("CAPITEC",),
    "standard bank": ("STANDARD BANK", "STDBANK", "STD BANK"),
    "tymebank": ("TYMEBANK", "TYME BANK", "TYME", "GOTYME", "GO TYME"),
    "fnb": ("FNB", "FIRST NATIONAL"),
    "absa": ("ABSA",),
    "nedbank": ("NEDBANK",),
    "discovery bank": ("DISCOVERY",),
    "african bank": ("AFRICAN BANK",),
    "investec": ("INVESTEC",),
}
_TRANSFER_WORDING = re.compile(
    r"\b(TRANSFER|TFR|OWN ACCOUNT|INTER ?ACCOUNT|INTERNAL|SAVINGS|IB PAYMENT TO|IB TRANSFER|MOVE MONEY)\b"
)
_NOT_A_TRANSFER = re.compile(
    r"\b(SALARY|PAYROLL|WAGES|INTEREST|DEBIT ORDER|CARD PURCHASE|POS PURCHASE|PURCHASE|"
    r"REFUND|REVERSAL|DIVIDEND|CASHBACK)\b"
)
_TRANSFER_FEE = re.compile(
    r"\b(IMMEDIATE PAYMENT|PAYMENT|TRANSFER|IB|EFT|RTC|INTER ?ACCOUNT|INSTANT)\b.*\b(FEE|CHARGE)\b|"
    r"\b(FEE|CHARGE)\b.*\b(IMMEDIATE PAYMENT|PAYMENT|TRANSFER|IB|EFT|RTC|INSTANT)\b"
)
_GENERIC_TOKENS = frozenset(
    {
        "PAYMENT", "TRANSFER", "IMMEDIATE", "CAPITEC", "STANDARD", "TYMEBANK", "ACCOUNT",
        "CREDIT", "DEBIT", "ABSA", "NEDBANK", "DISCOVERY", "INTERNET", "BANKING", "ONLINE",
        "SAVINGS", "CHEQUE", "CURRENT", "FROM", "TOWARDS", "REFERENCE", "BENEFICIARY",
    }
)
_AMOUNT_TEXT = re.compile(r"\d[\d ,]*[.,]\d{2}")
_DIGIT_RUN = re.compile(r"\d+")
_TOKEN = re.compile(r"[A-Z0-9]{6,}")


@dataclass(frozen=True)
class AccountIdentity:
    """What the matcher may know about an account. Never a full account number."""

    account_id: str
    bank_key: str | None = None
    last4: str | None = None


@dataclass(frozen=True)
class TransferLink:
    debit_id: str
    credit_id: str
    confidence: float
    evidence: dict
    fee_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class TransferCandidate:
    ids: tuple[str, str]
    confidence: float
    evidence: dict


@dataclass(frozen=True)
class TransferReconciliation:
    links: list[TransferLink] = field(default_factory=list)
    candidates: list[TransferCandidate] = field(default_factory=list)
    unlink: list[str] = field(default_factory=list)
    reversals: list[tuple[str, str]] = field(default_factory=list)

    def as_rpc_payload(self) -> dict:
        """Arguments for the apply_transfer_links database function."""
        return {
            "p_links": [
                {
                    "debit_id": link.debit_id,
                    "credit_id": link.credit_id,
                    "confidence": link.confidence,
                    "evidence": link.evidence,
                    "fee_ids": list(link.fee_ids),
                }
                for link in self.links
            ],
            "p_candidates": [
                {"ids": list(item.ids), "confidence": item.confidence, "evidence": item.evidence}
                for item in self.candidates
            ],
            "p_unlink": self.unlink,
            "p_reversals": [
                {"reversal_id": reversal, "original_id": original}
                for reversal, original in self.reversals
            ],
        }


# --------------------------------------------------------------------------- order


def chronological_key(item: FeatureTransaction) -> tuple:
    """Total order by actual transaction date.

    Same-day rows fall back to the timestamp when the statement supplied one,
    then to account and statement row, then id. The same-day order is
    deterministic, not a claim about what happened first within the day; a
    statement that lists newest-first yields a reversed row order.
    """
    return (
        item.transaction_date is None,
        item.transaction_date or date.max,
        item.transaction_time is None,
        item.transaction_time.isoformat() if item.transaction_time else "",
        item.account_id or "",
        item.source_row if item.source_row is not None else 10**9,
        item.transaction_id,
    )


def order_chronologically(transactions: Iterable[FeatureTransaction]) -> list[FeatureTransaction]:
    """Sort by normalised transaction date. Extraction order is never trusted."""
    return sorted(transactions, key=chronological_key)


# ----------------------------------------------------------------- shared helpers


def _currency(item: FeatureTransaction) -> str:
    return (item.currency or "ZAR").upper()


def _signed_direction(item: FeatureTransaction) -> str | None:
    if item.transaction_type in {"debit", "credit"}:
        return item.transaction_type
    if item.amount < 0:
        return "debit"
    if item.amount > 0:
        return "credit"
    return None


def _text(item: FeatureTransaction) -> str:
    return " ".join(f"{item.description or ''} {item.reference or ''}".upper().split())


def _bank_mentioned(text: str, identity: AccountIdentity | None) -> bool:
    if identity is None or identity.bank_key is None:
        return False
    tokens = _BANK_TOKENS.get(identity.bank_key, (identity.bank_key.upper(),))
    return any(re.search(rf"(?<![A-Z]){re.escape(token)}(?![A-Z])", text) for token in tokens)


def _last4_mentioned(text: str, identity: AccountIdentity | None) -> bool:
    if identity is None or not identity.last4:
        return False
    scrubbed = _AMOUNT_TEXT.sub(" ", text)
    return any(
        run.endswith(identity.last4) and len(run) <= 11 for run in _DIGIT_RUN.findall(scrubbed)
    )


def _reference_tokens(item: FeatureTransaction) -> set[str]:
    return {token for token in _TOKEN.findall(_text(item)) if token not in _GENERIC_TOKENS}


def _shared_reference(debit: FeatureTransaction, credit: FeatureTransaction) -> str | None:
    shared = _reference_tokens(debit) & _reference_tokens(credit)
    # A token made only of digits needs enough length to be a reference, not an amount.
    shared = {token for token in shared if not token.isdigit() or len(token) >= 8}
    return min(shared) if shared else None


def _closeness(lag: int) -> Decimal:
    return {
        -1: Decimal("0.05"),
        0: Decimal("0.10"),
        1: Decimal("0.07"),
        2: Decimal("0.04"),
        3: Decimal("0.02"),
    }.get(lag, Decimal("0"))


def _score_pair(
    debit: FeatureTransaction,
    credit: FeatureTransaction,
    accounts: Mapping[str, AccountIdentity],
) -> tuple[Decimal, dict]:
    lag = (credit.transaction_date - debit.transaction_date).days  # type: ignore[operator]
    score = Decimal("0.35") + _closeness(lag)
    evidence: dict = {
        "amount": str(amount_of(debit)),
        "currency": _currency(debit),
        "days_apart": lag,
        "rules": ["equal_amount", "opposite_direction", "different_accounts", "settlement_window"],
    }
    reference = _shared_reference(debit, credit)
    if reference:
        score += Decimal("0.30")
        evidence["shared_reference"] = f"{reference[:2]}…{reference[-2:]}"
        evidence["rules"].append("shared_reference")

    debit_text, credit_text = _text(debit), _text(credit)
    debit_account = accounts.get(debit.account_id or "")
    credit_account = accounts.get(credit.account_id or "")
    mention_total = Decimal("0")
    for text, counterparty, side in (
        (debit_text, credit_account, "debit"),
        (credit_text, debit_account, "credit"),
    ):
        side_score = Decimal("0")
        if _bank_mentioned(text, counterparty):
            side_score += Decimal("0.15")
            evidence["rules"].append(f"{side}_names_other_bank")
        if _last4_mentioned(text, counterparty):
            side_score += Decimal("0.25")
            evidence["rules"].append(f"{side}_names_other_account")
        mention_total += min(side_score, Decimal("0.30"))
    score += min(mention_total, Decimal("0.45"))

    if _TRANSFER_WORDING.search(debit_text) or _TRANSFER_WORDING.search(credit_text):
        score += Decimal("0.15")
        evidence["rules"].append("transfer_wording")
    if _NOT_A_TRANSFER.search(debit_text) or _NOT_A_TRANSFER.search(credit_text):
        score -= Decimal("0.25")
        evidence["rules"].append("purchase_or_income_wording")

    score = max(Decimal("0"), min(Decimal("1"), score))
    evidence["score"] = float(score)
    return score, evidence


# ------------------------------------------------------------------- transfers


def reconcile_transfers(
    transactions: Sequence[FeatureTransaction],
    accounts: Mapping[str, AccountIdentity],
) -> TransferReconciliation:
    """Decide transfers, candidates, withdrawals and reversals for these rows."""
    live = [
        item
        for item in transactions
        if not item.is_duplicate
        and item.transaction_date is not None
        and item.account_id is not None
    ]
    confirmed_ids = {item.transaction_id for item in live if item.transfer_status == "confirmed"}

    debits = [
        item for item in live
        if _signed_direction(item) == "debit" and item.transaction_id not in confirmed_ids
    ]
    credits_by_amount: dict[tuple[Decimal, str], list[FeatureTransaction]] = defaultdict(list)
    for item in live:
        if _signed_direction(item) == "credit" and item.transaction_id not in confirmed_ids:
            credits_by_amount[(amount_of(item), _currency(item))].append(item)

    scored: list[tuple[Decimal, FeatureTransaction, FeatureTransaction, dict]] = []
    for debit in debits:
        for credit in credits_by_amount.get((amount_of(debit), _currency(debit)), ()):
            if credit.account_id == debit.account_id:
                continue
            lag = (credit.transaction_date - debit.transaction_date).days  # type: ignore[operator]
            if lag < -CREDIT_MAX_LEAD_DAYS or lag > CREDIT_MAX_LAG_DAYS:
                continue
            score, evidence = _score_pair(debit, credit, accounts)
            scored.append((score, debit, credit, evidence))

    best_by_row: dict[str, list[Decimal]] = defaultdict(list)
    for score, debit, credit, _ in scored:
        best_by_row[debit.transaction_id].append(score)
        best_by_row[credit.transaction_id].append(score)
    for scores in best_by_row.values():
        scores.sort(reverse=True)

    def has_rival(row_id: str, score: Decimal) -> bool:
        """Another possible partner for this row scores within the margin."""
        others = list(best_by_row[row_id])
        others.remove(score)
        return bool(others) and max(others) >= score - AMBIGUITY_MARGIN

    links: list[TransferLink] = []
    candidates: list[TransferCandidate] = []
    used: set[str] = set()
    for score, debit, credit, evidence in sorted(
        scored,
        key=lambda row: (-row[0], row[1].transaction_id, row[2].transaction_id),
    ):
        ids = (debit.transaction_id, credit.transaction_id)
        if ids[0] in used or ids[1] in used:
            continue
        ambiguous = has_rival(ids[0], score) or has_rival(ids[1], score)
        if score >= CONFIRM_THRESHOLD and not ambiguous:
            used.update(ids)
            links.append(
                TransferLink(
                    debit_id=ids[0],
                    credit_id=ids[1],
                    confidence=float(score),
                    evidence=evidence,
                )
            )
        elif score >= CANDIDATE_THRESHOLD:
            used.update(ids)
            reason = "ambiguous_between_several_matches" if ambiguous else "insufficient_evidence"
            candidates.append(
                TransferCandidate(
                    ids=ids, confidence=float(score), evidence={**evidence, "reason": reason}
                )
            )

    claimed_fees: set[str] = set(confirmed_ids)
    with_fees: list[TransferLink] = []
    for link in links:
        fee_ids = _transfer_fee_ids(link, live, claimed_fees)
        claimed_fees.update(fee_ids)
        with_fees.append(
            TransferLink(link.debit_id, link.credit_id, link.confidence, link.evidence, tuple(fee_ids))
        )
    links = with_fees

    decided_ids = {link.debit_id for link in links} | {link.credit_id for link in links}
    candidate_ids = {row_id for item in candidates for row_id in item.ids}
    unlink = sorted(
        item.transaction_id
        for item in live
        if item.transaction_id not in decided_ids
        and item.transfer_status == "candidate"
        and item.transaction_id not in candidate_ids
        and not (item.transfer_pair_id and _TRANSFER_WORDING.search(_text(item)))
    )

    return TransferReconciliation(
        links=links,
        candidates=candidates,
        unlink=unlink,
        reversals=link_reversals(live),
    )


def _transfer_fee_ids(
    link: TransferLink,
    live: Sequence[FeatureTransaction],
    taken: set[str],
) -> list[str]:
    by_id = {item.transaction_id: item for item in live}
    debit = by_id[link.debit_id]
    principal = amount_of(debit)
    limit = min(FEE_MAX_ABSOLUTE, principal * FEE_MAX_FRACTION)
    fees: list[str] = []
    for item in live:
        if item.transaction_id in taken or item.transaction_id in {link.debit_id, link.credit_id}:
            continue
        if item.account_id != debit.account_id or _signed_direction(item) != "debit":
            continue
        if item.transfer_fee_for not in (None, link.debit_id):
            continue
        days = (item.transaction_date - debit.transaction_date).days  # type: ignore[operator]
        if days < 0 or days > 1:
            continue
        is_fee = item.categorisation.transaction_class == "bank_fee" or bool(
            _TRANSFER_FEE.search(_text(item))
        )
        if is_fee and bool(_TRANSFER_FEE.search(_text(item))) and amount_of(item) <= limit:
            fees.append(item.transaction_id)
    return sorted(fees)


# ------------------------------------------------------------------- reversals


def link_reversals(live: Sequence[FeatureTransaction]) -> list[tuple[str, str]]:
    """Pair each refund/reversal credit with the debit it undoes.

    Required: same account, same merchant (resolved key, not free text), the
    debit dated on or before the credit and within ``REVERSAL_MAX_DAYS``, and
    the credit not larger than what is left of the debit. The most recent
    eligible debit wins. A credit that fails any test stays unlinked.
    """
    remaining: dict[str, Decimal] = {}
    debits_by_key: dict[tuple[str, str], list[FeatureTransaction]] = defaultdict(list)
    for item in live:
        if _signed_direction(item) != "debit" or item.transaction_date is None:
            continue
        key = merchant_group_key(item)
        if key is None or item.account_id is None:
            continue
        remaining[item.transaction_id] = amount_of(item)
        debits_by_key[(item.account_id, key)].append(item)

    pairs: list[tuple[str, str]] = []
    reversals = sorted(
        (
            item for item in live
            if _signed_direction(item) == "credit"
            and item.reversal_of is None
            and item.transaction_date is not None
            and is_purchase_reversal(item)
        ),
        key=chronological_key,
    )
    for credit in reversals:
        key = merchant_group_key(credit)
        if key is None or credit.account_id is None:
            continue
        eligible = [
            debit
            for debit in debits_by_key.get((credit.account_id, key), ())
            if 0 <= (credit.transaction_date - debit.transaction_date).days <= REVERSAL_MAX_DAYS  # type: ignore[operator]
            and remaining[debit.transaction_id] >= amount_of(credit)
        ]
        if not eligible:
            continue
        original = max(eligible, key=chronological_key)
        remaining[original.transaction_id] -= amount_of(credit)
        pairs.append((credit.transaction_id, original.transaction_id))
    return pairs


# --------------------------------------------------------------------- totals


@dataclass
class AccountTotals:
    income: Decimal = Decimal("0")
    spending: Decimal = Decimal("0")
    refunds: Decimal = Decimal("0")
    transfers_out: Decimal = Decimal("0")
    transfers_in: Decimal = Decimal("0")
    transaction_count: int = 0


@dataclass
class ConsolidatedTotals:
    """One currency's consolidated figures. Rows with a different currency are
    never summed together."""

    currency: str
    income: Decimal = Decimal("0")
    spending: Decimal = Decimal("0")
    refunds: Decimal = Decimal("0")
    net_spending: Decimal = Decimal("0")
    confirmed_transfer_volume: Decimal = Decimal("0")
    unconfirmed_transfer_volume: Decimal = Decimal("0")
    bank_fees: Decimal = Decimal("0")
    transaction_count: int = 0
    excluded_duplicate_count: int = 0
    possible_duplicate_count: int = 0
    by_account: dict[str, AccountTotals] = field(default_factory=dict)


def _is_confirmed_transfer(item: FeatureTransaction) -> bool:
    return item.transfer_status == "confirmed" or (
        item.categorisation.transaction_class == "internal_transfer"
        and item.transfer_status != "candidate"
    )


def consolidated_totals(
    transactions: Iterable[FeatureTransaction],
) -> dict[str, ConsolidatedTotals]:
    """Income, spending, refunds and transfer volume across all accounts.

    * overlap duplicates are excluded (counted separately)
    * possible duplicates stay in, and are counted so the caller can say so
    * a confirmed transfer's principal is in neither income nor spending
    * a candidate transfer stays in income/spending and its volume is reported
      as unconfirmed rather than claimed as settled
    * refunds/reversals offset spending and are never income
    """
    result: dict[str, ConsolidatedTotals] = {}
    for item in transactions:
        currency = _currency(item)
        totals = result.setdefault(currency, ConsolidatedTotals(currency=currency))
        if item.is_duplicate:
            totals.excluded_duplicate_count += 1
            continue
        direction = _signed_direction(item)
        if direction is None:
            continue
        amount = amount_of(item)
        account = totals.by_account.setdefault(item.account_id or "unassigned", AccountTotals())
        account.transaction_count += 1
        totals.transaction_count += 1
        if item.dedupe_status == "possible_duplicate":
            totals.possible_duplicate_count += 1

        if _is_confirmed_transfer(item):
            totals.confirmed_transfer_volume += amount if direction == "debit" else Decimal("0")
            if direction == "debit":
                account.transfers_out += amount
            else:
                account.transfers_in += amount
            continue

        if direction == "credit":
            if item.reversal_of is not None or is_purchase_reversal(item):
                totals.refunds += amount
                account.refunds += amount
            else:
                totals.income += amount
                account.income += amount
        else:
            totals.spending += amount
            account.spending += amount
            if item.categorisation.transaction_class == "bank_fee":
                totals.bank_fees += amount
            if item.transfer_status == "candidate":
                totals.unconfirmed_transfer_volume += amount
    for totals in result.values():
        totals.net_spending = totals.spending - totals.refunds
    return result


# ------------------------------------------------------------ in-memory application


def _pair_id(first: str, second: str) -> str:
    digest = hashlib.md5((min(first, second) + max(first, second)).encode("utf-8")).hexdigest()
    return str(uuid.UUID(digest))


def apply_reconciliation(
    transactions: Sequence[FeatureTransaction],
    reconciliation: TransferReconciliation,
) -> list[FeatureTransaction]:
    """Return the rows as the reconciliation decided, without touching storage.

    Analysis reads must be right even before the decision is persisted, and
    applying the same decision twice yields the same rows.
    """
    updates: dict[str, dict] = {}

    def update(row_id: str, **fields) -> None:
        updates.setdefault(row_id, {}).update(fields)

    by_id = {item.transaction_id: item for item in transactions}
    for row_id in reconciliation.unlink:
        item = by_id.get(row_id)
        if item is None:
            continue
        fields: dict = {"transfer_status": "none", "transfer_pair_id": None}
        if item.transfer_pair_id and item.categorisation.transaction_class == "internal_transfer":
            fields["_class"] = "unknown"
        update(row_id, **fields)
    for item in reconciliation.candidates:
        for row_id in item.ids:
            update(row_id, transfer_status="candidate")
    for link in reconciliation.links:
        pair = _pair_id(link.debit_id, link.credit_id)
        for row_id in (link.debit_id, link.credit_id):
            update(row_id, transfer_status="confirmed", transfer_pair_id=pair, _class="internal_transfer")
        for fee_id in link.fee_ids:
            update(fee_id, transfer_fee_for=link.debit_id)
    for reversal_id, original_id in reconciliation.reversals:
        update(reversal_id, reversal_of=original_id)

    result: list[FeatureTransaction] = []
    for item in transactions:
        fields = dict(updates.get(item.transaction_id, {}))
        if not fields:
            result.append(item)
            continue
        new_class = fields.pop("_class", None)
        if new_class is not None:
            fields["categorisation"] = item.categorisation.model_copy(
                update={"transaction_class": new_class}
            )
        result.append(replace(item, **fields))
    return result


@dataclass(frozen=True)
class ConsolidatedView:
    transactions: list[FeatureTransaction]
    reconciliation: TransferReconciliation
    totals: dict[str, ConsolidatedTotals]


def consolidate(
    transactions: Sequence[FeatureTransaction],
    accounts: Mapping[str, AccountIdentity],
) -> ConsolidatedView:
    """Order chronologically, decide transfers and reversals, and total the result."""
    ordered = order_chronologically(transactions)
    reconciliation = reconcile_transfers(ordered, accounts)
    applied = apply_reconciliation(ordered, reconciliation)
    return ConsolidatedView(applied, reconciliation, consolidated_totals(applied))
