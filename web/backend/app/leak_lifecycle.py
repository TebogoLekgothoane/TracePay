from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from .models_db import Leak, Transaction

FI_004 = "FI-004"
FI_015 = "FI-015"
FI_027 = "FI-027"
FI_033 = "FI-033"
UNAVAILABLE_RULES = {"FI-017", "FI-047", "FI-050"}


@dataclass(frozen=True)
class Finding:
    fi_code: str
    subject_key: str
    merchant: str | None
    amount_monthly: float
    evidence: dict[str, Any]
    exact_action: str

    @property
    def amount_annual(self) -> float:
        return round(self.amount_monthly * 12, 2)


def _month(value: datetime) -> tuple[int, int]:
    return value.year, value.month


def _months_before(year: int, month: int, count: int) -> list[tuple[int, int]]:
    values: list[tuple[int, int]] = []
    for offset in range(count, 0, -1):
        absolute = year * 12 + (month - 1) - offset
        values.append((absolute // 12, absolute % 12 + 1))
    return values


def _text(tx: dict[str, Any]) -> str:
    return " ".join(
        str(tx.get(key) or "") for key in ("description", "merchant", "category", "counterparty")
    ).lower()


def _meta(tx: dict[str, Any]) -> dict[str, Any]:
    value = tx.get("transaction_data") or {}
    return value if isinstance(value, dict) else {}


def _is_debit(tx: dict[str, Any]) -> bool:
    return tx.get("direction") == "debit"


def _bank(tx: dict[str, Any]) -> str | None:
    value = _meta(tx).get("bank") or _meta(tx).get("provider")
    return str(value).strip() if isinstance(value, str) and value.strip() else None


def _tx_ids(transactions: Iterable[dict[str, Any]]) -> list[str]:
    return [str(tx["transaction_id"]) for tx in transactions]


def _fee_amount(tx: dict[str, Any]) -> float | None:
    value = _meta(tx).get("fee_amount")
    if isinstance(value, (int, float)) and value >= 0:
        return float(value)
    return None


def detect_fi_004(transactions: list[dict[str, Any]]) -> list[Finding]:
    groups: dict[tuple[str, tuple[int, int]], list[dict[str, Any]]] = defaultdict(list)
    for tx in transactions:
        if not _is_debit(tx) or str(tx.get("category") or "").lower() != "atm":
            continue
        timestamp = tx["timestamp"]
        bank = _bank(tx)
        fee = _fee_amount(tx)
        if bank and fee is not None:
            groups[(bank, _month(timestamp))].append(tx)
    findings: list[Finding] = []
    for (bank, (year, month)), withdrawals in groups.items():
        if len(withdrawals) < 4:
            continue
        fees = round(sum(_fee_amount(tx) or 0 for tx in withdrawals), 2)
        if fees <= 0:
            continue
        findings.append(
            Finding(
                fi_code=FI_004,
                subject_key=f"{bank.casefold()}:{year:04d}-{month:02d}",
                merchant=bank,
                amount_monthly=fees,
                evidence={
                    "transaction_ids": _tx_ids(withdrawals),
                    "withdrawal_count": len(withdrawals),
                    "statement_month": f"{year:04d}-{month:02d}",
                    "bank": bank,
                    "fee_amount": fees,
                },
                exact_action=(
                    f"Switch from cash withdrawals to card payments at {bank}. "
                    f"You paid R{fees:.2f} in ATM fees this month across {len(withdrawals)} withdrawals."
                ),
            )
        )
    return findings


def detect_fi_015(transactions: list[dict[str, Any]]) -> list[Finding]:
    by_bank: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for tx in transactions:
        if not _is_debit(tx):
            continue
        bank = _bank(tx)
        if bank and ("banking fee" in _text(tx) or _meta(tx).get("fee_type") == "banking"):
            by_bank[bank].append(tx)
    findings: list[Finding] = []
    for bank, fees in by_bank.items():
        latest = max(tx["timestamp"] for tx in fees)
        latest_month = _month(latest)
        prior = _months_before(*latest_month, 12)
        old_months, new_months = prior[:6], prior[6:]
        sums: dict[tuple[int, int], float] = defaultdict(float)
        ids: dict[tuple[int, int], list[str]] = defaultdict(list)
        for tx in fees:
            key = _month(tx["timestamp"])
            sums[key] += float(tx["amount"])
            ids[key].append(str(tx["transaction_id"]))
        if not all(month in sums for month in old_months + new_months):
            continue
        old_amount = round(sum(sums[month] for month in old_months) / 6, 2)
        new_amount = round(sum(sums[month] for month in new_months) / 6, 2)
        if old_amount <= 0 or new_amount < old_amount * 1.15:
            continue
        increase = round((new_amount / old_amount - 1) * 100, 1)
        findings.append(
            Finding(
                fi_code=FI_015,
                subject_key=bank.casefold(),
                merchant=bank,
                amount_monthly=new_amount,
                evidence={
                    "transaction_ids": [item for month in old_months + new_months for item in ids[month]],
                    "old_amount": old_amount,
                    "new_amount": new_amount,
                    "pct_increase": increase,
                    "bank": bank,
                },
                exact_action=(
                    f"Your {bank} monthly account fee rose {increase:.1f}% over 6 months "
                    f"(R{old_amount:.2f} -> R{new_amount:.2f}). Call {bank} and ask about a lower-fee account tier."
                ),
            )
        )
    return findings


def detect_fi_027(transactions: list[dict[str, Any]]) -> list[Finding]:
    findings: list[Finding] = []
    for tx in transactions:
        if not _is_debit(tx):
            continue
        text = _text(tx)
        if not ("unpaid debit order" in text or "failed debit order" in text):
            continue
        merchant = str(tx.get("merchant") or tx.get("counterparty") or "").strip()
        if not merchant:
            continue
        amount = round(float(tx["amount"]), 2)
        date = tx["timestamp"].date().isoformat()
        findings.append(
            Finding(
                fi_code=FI_027,
                subject_key=merchant.casefold(),
                merchant=merchant,
                amount_monthly=amount,
                evidence={
                    "transaction_ids": [str(tx["transaction_id"])],
                    "fee_date": date,
                    "fee_amount": amount,
                    "merchant": merchant,
                },
                exact_action=(
                    f"Call your bank and ask them to reverse the R{amount:.2f} unpaid debit order fee from {date} "
                    f"— check your account has cover before the next {merchant} debit date."
                ),
            )
        )
    return findings


def detect_fi_033(transactions: list[dict[str, Any]]) -> list[Finding]:
    salaries = [
        tx
        for tx in transactions
        if tx.get("direction") == "credit"
        and (str(tx.get("category") or "").lower() == "salary" or _meta(tx).get("is_salary") is True)
    ]
    discretionary = {"dining", "entertainment", "online", "other"}
    findings: list[Finding] = []
    for salary in salaries:
        start = salary["timestamp"]
        end = start + timedelta(days=4)
        after = [
            tx for tx in transactions
            if _is_debit(tx)
            and str(tx.get("category") or "").lower() in discretionary
            and start < tx["timestamp"] <= end
        ]
        baseline_start = start - timedelta(days=28)
        before = [
            tx for tx in transactions
            if _is_debit(tx)
            and str(tx.get("category") or "").lower() in discretionary
            and baseline_start <= tx["timestamp"] < start
        ]
        if not before:
            continue
        spend = round(sum(float(tx["amount"]) for tx in after), 2)
        baseline = round(sum(float(tx["amount"]) for tx in before) / 7, 2)
        threshold = round(baseline * 1.5, 2)
        if baseline <= 0 or spend <= threshold:
            continue
        merchant = str(salary.get("merchant") or salary.get("counterparty") or "salary").strip()
        ratio = round(spend / baseline, 2)
        findings.append(
            Finding(
                fi_code=FI_033,
                subject_key=f"{merchant.casefold()}:{start.date().isoformat()}",
                merchant=merchant,
                amount_monthly=round(max(0, spend - baseline * 4 / 7), 2),
                evidence={
                    "transaction_ids": [str(salary["transaction_id"]), *_tx_ids(after)],
                    "salary_transaction_id": str(salary["transaction_id"]),
                    "spike_ratio": ratio,
                    "threshold_ratio": 1.5,
                    "post_payday_spend": spend,
                    "baseline": baseline,
                },
                exact_action=(
                    f"Keep discretionary spending below R{threshold:.2f} in the four days after your {merchant} deposit; "
                    f"this payday it was R{spend:.2f}, {ratio:.2f}x your baseline."
                ),
            )
        )
    return findings


DETECTORS: tuple[Callable[[list[dict[str, Any]]], list[Finding]], ...] = (
    detect_fi_004,
    detect_fi_015,
    detect_fi_027,
    detect_fi_033,
)


def _as_dict(transaction: Transaction) -> dict[str, Any]:
    return {
        "transaction_id": transaction.transaction_id,
        "timestamp": transaction.timestamp,
        "amount": abs(float(transaction.amount)),
        "description": transaction.description,
        "merchant": transaction.merchant,
        "category": transaction.category,
        "counterparty": transaction.counterparty,
        "direction": transaction.direction,
        "channel": transaction.channel,
        "transaction_data": transaction.transaction_data or {},
    }


def _resolution(
    leak: Leak,
    findings: dict[tuple[str, str], Finding],
    transactions: list[dict[str, Any]],
    now: datetime,
) -> tuple[str, dict[str, Any] | None]:
    matched = findings.get((leak.fi_code, leak.subject_key))
    if matched is not None:
        return "active", {"condition_still_true": True, "transaction_ids": matched.evidence["transaction_ids"]}
    if leak.fi_code == FI_004:
        bank, detected_month = leak.subject_key.rsplit(":", 1)
        detected_year, detected_month_number = map(int, detected_month.split("-"))
        next_month_absolute = detected_year * 12 + detected_month_number
        next_year, next_month = divmod(next_month_absolute, 12)
        next_month += 1
        if (now.year, now.month) <= (next_year, next_month):
            return "monitoring", {"condition_still_true": False, "awaiting_cycles": 1}
        withdrawals = [
            tx for tx in transactions
            if _is_debit(tx)
            and str(tx.get("category") or "").lower() == "atm"
            and (_bank(tx) or "").casefold() == bank
            and _month(tx["timestamp"]) == (next_year, next_month)
        ]
        if len(withdrawals) < 4:
            return "resolved", {
                "condition_still_true": False,
                "transaction_ids": _tx_ids(withdrawals),
                "statement_month": f"{next_year:04d}-{next_month:02d}",
                "withdrawal_count": len(withdrawals),
            }
        return "active", {"condition_still_true": True, "transaction_ids": _tx_ids(withdrawals)}
    if leak.fi_code == FI_027:
        detected_at = leak.detected_at
        elapsed_months = (now.year - detected_at.year) * 12 + now.month - detected_at.month
        if elapsed_months < 2:
            return "monitoring", {"condition_still_true": False, "awaiting_cycles": 2 - elapsed_months}
        merchant = (leak.merchant or "").casefold()
        later_fees = [
            tx for tx in transactions
            if tx["timestamp"] > detected_at
            and (_merchant := str(tx.get("merchant") or tx.get("counterparty") or "").casefold()) == merchant
            and ("unpaid debit order" in _text(tx) or "failed debit order" in _text(tx))
        ]
        if not later_fees:
            return "resolved", {
                "condition_still_true": False,
                "absence": "no failed debit order fees for two cycles",
            }
        return "active", {"condition_still_true": True, "transaction_ids": _tx_ids(later_fees)}
    if leak.fi_code == FI_033:
        detected_salary_id = str((leak.evidence or {}).get("salary_transaction_id") or "")
        salary_positions = [
            index
            for index, tx in enumerate(transactions)
            if str(tx["transaction_id"]) == detected_salary_id
        ]
        if not salary_positions:
            return "monitoring", {"condition_still_true": False, "awaiting_paydays": 2}
        later_salaries = [
            tx
            for tx in transactions[salary_positions[0] + 1:]
            if tx.get("direction") == "credit"
            and (str(tx.get("category") or "").lower() == "salary" or _meta(tx).get("is_salary") is True)
        ]
        if len(later_salaries) < 2:
            return "monitoring", {
                "condition_still_true": False,
                "awaiting_paydays": 2 - len(later_salaries),
            }
        spiked_salary_ids = {
            str(finding.evidence.get("salary_transaction_id"))
            for finding in findings.values()
            if finding.fi_code == FI_033
        }
        checked_salaries = later_salaries[:2]
        if not any(str(tx["transaction_id"]) in spiked_salary_ids for tx in checked_salaries):
            return "resolved", {
                "condition_still_true": False,
                "transaction_ids": _tx_ids(checked_salaries),
                "paydays_below_threshold": 2,
            }
        return "active", {"condition_still_true": True, "transaction_ids": _tx_ids(checked_salaries)}
    if leak.fi_code == FI_015:
        fee_transactions = [
            tx
            for tx in transactions
            if _is_debit(tx)
            and (_bank(tx) or "").casefold() == (leak.merchant or "").casefold()
            and ("banking fee" in _text(tx) or _meta(tx).get("fee_type") == "banking")
        ]
        if len({_month(tx["timestamp"]) for tx in fee_transactions}) < 12:
            return "monitoring", {"condition_still_true": False, "awaiting_months": 12}
        return "resolved", {"condition_still_true": False, "trend": "flat_or_negative"}
    return "monitoring", {"condition_still_true": False}


def run_leak_lifecycle(db: Session, user_id: UUID, checked_at: datetime | None = None) -> list[Leak]:
    checked_at = checked_at or datetime.now(timezone.utc)
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.timestamp.asc())
        .all()
    )
    tx_dicts = [_as_dict(transaction) for transaction in transactions]
    findings = [finding for detector in DETECTORS for finding in detector(tx_dicts)]
    by_key = {(finding.fi_code, finding.subject_key): finding for finding in findings}
    existing = db.query(Leak).filter(Leak.user_id == user_id).all()
    for leak in existing:
        if leak.status == "resolved":
            continue
        next_status, resolution_evidence = _resolution(leak, by_key, tx_dicts, checked_at)
        leak.resolution_checked_at = checked_at
        leak.resolution_evidence = resolution_evidence
        if next_status == "resolved":
            leak.status = "resolved"
            leak.resolved_at = checked_at
            amount = float(leak.amount_monthly)
            merchant = leak.merchant or "debit order"
            leak.exact_action = (
                f"Your {merchant} debit order didn't appear this cycle — resolved. "
                f"You're keeping ~R{amount:.2f}/month."
            )
        else:
            leak.status = next_status
    existing_by_key = {(leak.fi_code, leak.subject_key): leak for leak in existing}
    for finding in findings:
        leak = existing_by_key.get((finding.fi_code, finding.subject_key))
        if leak is None:
            db.add(
                Leak(
                    user_id=user_id,
                    fi_code=finding.fi_code,
                    subject_key=finding.subject_key,
                    status="active",
                    detection_rule=finding.fi_code,
                    resolution_rule=finding.fi_code,
                    resolution_checked_at=checked_at,
                    evidence=finding.evidence,
                    merchant=finding.merchant,
                    amount_monthly=finding.amount_monthly,
                    amount_annual=finding.amount_annual,
                    exact_action=finding.exact_action,
                )
            )
        else:
            leak.status = "active"
            leak.resolved_at = None
            leak.evidence = finding.evidence
            leak.merchant = finding.merchant
            leak.amount_monthly = finding.amount_monthly
            leak.amount_annual = finding.amount_annual
            leak.exact_action = finding.exact_action
    db.flush()
    return (
        db.query(Leak)
        .filter(Leak.user_id == user_id)
        .order_by(Leak.detected_at.desc())
        .all()
    )
