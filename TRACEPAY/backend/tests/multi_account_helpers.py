"""Builders for realistic multi-account scenarios, shaped like stored rows.

Rows are plain dicts in the shape the API reads from ``transactions`` and go
through the production adapter, so tests exercise the same path as real data.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.consolidation import AccountIdentity, ConsolidatedView, consolidate
from leak_intelligence.coverage import AccountRecord, StatementCoverage, StatementRecord, build_coverage
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_context import enrich_leaks
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_evidence import attach_supporting_transactions
from leak_intelligence.leak_models import LeakDetectionResult
from leak_intelligence.models import FeatureTransaction

USER = "user-a"
CAPITEC = "acc-capitec"
STANDARD = "acc-standard"
TYME = "acc-tyme"

ACCOUNT_RECORDS = [
    AccountRecord(account_id=CAPITEC, institution="Capitec", bank_key="capitec", last4="1111"),
    AccountRecord(account_id=STANDARD, institution="Standard Bank", bank_key="standard bank", last4="2222"),
    AccountRecord(account_id=TYME, institution="TymeBank", bank_key="tymebank", last4="3333"),
]
IDENTITIES = {
    record.account_id: AccountIdentity(record.account_id, record.bank_key, record.last4)
    for record in ACCOUNT_RECORDS
}

_counter = 0


def row(
    when: str,
    description: str,
    amount: str | float,
    *,
    account: str = CAPITEC,
    merchant: str | None = None,
    category: str | None = None,
    klass: str | None = None,
    rule: str | None = None,
    statement: str | None = None,
    row_id: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """A stored-row dict. ``amount`` is signed: debits negative."""
    global _counter
    _counter += 1
    value = Decimal(str(amount))
    direction = "debit" if value < 0 else "credit"
    if klass is None:
        klass = "income" if direction == "credit" else "spending"
    return {
        "id": row_id or f"tx-{_counter:05d}",
        "user_id": USER,
        "account_id": account,
        "statement_id": statement or f"stmt-{account}",
        "date": when,
        "description": description,
        "amount": str(value),
        "type": direction,
        "is_duplicate": False,
        "merchant_name": merchant,
        "category_confidence": 0.95,
        "category_rule": rule,
        "transaction_class": klass,
        "classification_confidence": 0.95,
        "classification_reason": "test",
        "categories": {"name": category} if category else None,
        "accounts": {"last_four_digits": IDENTITIES[account].last4} if account in IDENTITIES else None,
        **extra,
    }


def transactions(rows: list[dict[str, Any]]) -> list[FeatureTransaction]:
    return [feature_transaction_from_row(item, expected_user_id=USER) for item in rows]


def analyse(
    rows_or_transactions: list[Any],
    *,
    coverage: StatementCoverage | None = None,
    reconcile: bool = True,
) -> tuple[LeakDetectionResult, ConsolidatedView, list[FeatureTransaction]]:
    items = (
        transactions(rows_or_transactions)
        if rows_or_transactions and isinstance(rows_or_transactions[0], dict)
        else list(rows_or_transactions)
    )
    view = consolidate(items, IDENTITIES if reconcile else {})
    observation_end = {
        account.account_id: account.last_covered
        for account in (coverage.accounts if coverage else [])
        if account.last_covered is not None
    }
    snapshot = build_financial_features(USER, view.transactions, account_observation_end=observation_end)
    leaks = attach_supporting_transactions(detect_leaks(snapshot, analyze_behaviour(snapshot)), view.transactions)
    enriched = enrich_leaks(leaks, view.transactions, coverage=coverage, accounts=ACCOUNT_RECORDS)
    return enriched, view, view.transactions


def statement(
    statement_id: str,
    account: str,
    start: str | None,
    end: str | None,
    *,
    opening: float | None = None,
    closing: float | None = None,
    **extra: Any,
) -> StatementRecord:
    return StatementRecord(
        id=statement_id,
        account_id=account,
        status=extra.pop("status", "processed"),
        start=date.fromisoformat(start) if start else None,
        end=date.fromisoformat(end) if end else None,
        period_source=extra.pop("period_source", "declared"),
        opening_balance=Decimal(str(opening)) if opening is not None else None,
        closing_balance=Decimal(str(closing)) if closing is not None else None,
        **extra,
    )


def coverage_of(*records: StatementRecord) -> StatementCoverage:
    return build_coverage(list(records), ACCOUNT_RECORDS)
