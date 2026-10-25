"""Statement coverage and cross-account transfer reconciliation for one user.

Reads and writes use the caller's own access token, so Row Level Security and
the database functions' ``auth.uid()`` checks scope everything to that user.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.financial_features import (
    REQUEST_TIMEOUT_SECONDS,
    _fetch_transaction_rows,
    _supabase_config,
    fetch_accounts_and_statements,
)
from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row
from leak_intelligence.consolidation import AccountIdentity, consolidate
from leak_intelligence.coverage import build_coverage

logger = logging.getLogger("tracepay.consolidation")


async def build_user_coverage_payload(user_id: str, access_token: str) -> dict[str, Any]:
    """Which accounts and periods the uploaded statements cover, and what is missing."""
    accounts, statements = await asyncio.to_thread(
        fetch_accounts_and_statements, user_id, access_token
    )
    coverage = build_coverage(statements, accounts)
    payload = coverage.model_dump(mode="json")
    payload["statements"] = [
        {
            "id": record.id,
            "file_name": record.file_name,
            "account_id": record.account_id,
            "status": record.status,
            "start": record.start.isoformat() if record.start else None,
            "end": record.end.isoformat() if record.end else None,
            "period_source": record.period_source,
            "transaction_count": record.transaction_count,
        }
        for record in statements
    ]
    return payload


async def reconcile_user_transfers(user_id: str, access_token: str) -> dict[str, Any]:
    """Decide transfers, candidates and reversals, then persist the decision.

    The decision is a pure function of the stored rows and the database applies
    it idempotently, so running this after every import (or twice in a row)
    leaves the same result.
    """
    rows = await asyncio.to_thread(_fetch_transaction_rows, user_id, access_token)
    try:
        transactions = [feature_transaction_from_row(row, expected_user_id=user_id) for row in rows]
    except FeatureRowValidationError as error:
        raise HTTPException(
            status_code=422, detail="Stored transaction data could not be analysed safely."
        ) from error
    accounts, _ = await asyncio.to_thread(fetch_accounts_and_statements, user_id, access_token)
    identities = {
        account.account_id: AccountIdentity(account.account_id, account.bank_key, account.last4)
        for account in accounts
    }
    reconciliation = consolidate(transactions, identities).reconciliation
    summary: dict[str, Any] = {
        "confirmed_transfers": len(reconciliation.links),
        "candidate_transfers": len(reconciliation.candidates),
        "withdrawn": len(reconciliation.unlink),
        "reversals_linked": len(reconciliation.reversals),
        "persisted": False,
    }
    if not (
        reconciliation.links
        or reconciliation.candidates
        or reconciliation.unlink
        or reconciliation.reversals
    ):
        return summary
    await asyncio.to_thread(
        _rpc, "apply_transfer_links", reconciliation.as_rpc_payload(), access_token
    )
    summary["persisted"] = True
    return summary


def _rpc(function: str, payload: dict[str, Any], access_token: str) -> Any:
    project_url, publishable_key = _supabase_config()
    request = Request(
        f"{project_url}/rest/v1/rpc/{function}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except HTTPError as error:
        logger.warning("rpc_failed function=%s upstream_status=%s", function, error.code)
        raise HTTPException(
            status_code=503, detail="Transfer reconciliation could not be saved. Please try again."
        ) from error
    except (URLError, TimeoutError, ValueError) as error:
        logger.warning("rpc_failed function=%s error_type=%s", function, type(error).__name__)
        raise HTTPException(
            status_code=503, detail="Transfer reconciliation could not be saved. Please try again."
        ) from error
