"""Authenticated retrieval and computation for financial feature snapshots."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.config import settings
from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row
from leak_intelligence.consolidation import AccountIdentity, TransferReconciliation, consolidate
from leak_intelligence.coverage import (
    AccountRecord,
    StatementCoverage,
    StatementRecord,
    build_coverage,
    statement_record_from_row,
)
from leak_intelligence.engine import build_financial_features
from leak_intelligence.import_quality import StatementImportQuality, parse_import_quality_row
from leak_intelligence.models import FeatureTransaction, FinancialFeatureSnapshot

logger = logging.getLogger("tracepay.financial_features")
PAGE_SIZE = 1_000
MAX_TRANSACTIONS = 10_000
REQUEST_TIMEOUT_SECONDS = 10

_IMPORT_QUALITY_SELECT = (
    "id,balance_reconciliation,rows_detected,rows_rejected,"
    "extraction_confidence,statement_start_date,statement_end_date"
)
_BASE_COLUMNS = (
    "id,user_id,date,description,amount,type,is_duplicate,merchant_name,"
    "statement_id,category_confidence,category_rule,transaction_class,"
    "classification_confidence,classification_reason,categories(name)"
)
_CONSOLIDATION_COLUMNS = (
    "account_id,bank_key,currency,reference,value_date,booking_date,date_confidence,"
    "source_row,dedupe_status,transfer_status,transfer_pair_id,transfer_fee_for,reversal_of,"
    "accounts(last_four_digits)"
)
# Newest schema first. A deployment that has not applied a migration yet falls
# back to the next select, so analysis keeps working (without that provenance).
_TRANSACTION_SELECTS = (
    f"{_BASE_COLUMNS},transaction_time,{_CONSOLIDATION_COLUMNS}",
    f"{_BASE_COLUMNS},transaction_time,account_id",
    f"{_BASE_COLUMNS},transaction_time",
    _BASE_COLUMNS,
)
_STATEMENT_SELECTS = (
    "id,account_id,status,statement_start_date,statement_end_date,period_source,opening_balance,"
    "closing_balance,transaction_count,rows_detected,rows_rejected,extraction_confidence,"
    "balance_reconciliation,opening_closing_reconciliation,reconciliation_difference,"
    "extracted_last4,extraction_warnings,file_name",
    "id,account_id,status,statement_start_date,statement_end_date,opening_balance,"
    "closing_balance,transaction_count,rows_detected,rows_rejected,extraction_confidence,"
    "balance_reconciliation,extracted_last4,file_name",
)
_ACCOUNT_SELECTS = (
    "id,name,institution,bank_key,last_four_digits",
    "id,name,institution,last_four_digits",
)


class _OptionalTransactionColumnUnavailable(RuntimeError):
    """The deployed PostgREST schema predates an optional transaction field."""


async def build_user_feature_snapshot(
    user_id: str, access_token: str
) -> FinancialFeatureSnapshot:
    """Fetch only the authenticated user's canonical rows and derive features."""
    _, snapshot = await build_user_feature_inputs(user_id, access_token)
    return snapshot


async def build_user_feature_inputs(
    user_id: str, access_token: str
) -> tuple[list[FeatureTransaction], FinancialFeatureSnapshot]:
    """Like ``build_user_feature_snapshot`` but also returns the validated rows."""
    inputs = await build_user_consolidated_inputs(user_id, access_token)
    return inputs.transactions, inputs.snapshot


@dataclass(frozen=True)
class ConsolidatedInputs:
    """One user's rows after cross-account consolidation, with what describes them."""

    transactions: list[FeatureTransaction]
    snapshot: FinancialFeatureSnapshot
    coverage: StatementCoverage
    accounts: list[AccountRecord]
    reconciliation: TransferReconciliation


async def build_user_consolidated_inputs(user_id: str, access_token: str) -> ConsolidatedInputs:
    """Fetch the user's rows, consolidate them across accounts, derive features.

    Reads only: transfer decisions are applied in memory here and persisted by
    the explicit reconcile endpoint after an import.
    """
    rows = await asyncio.to_thread(_fetch_transaction_rows, user_id, access_token)
    try:
        transactions = [
            feature_transaction_from_row(row, expected_user_id=user_id)
            for row in rows
        ]
    except FeatureRowValidationError as error:
        logger.warning(
            "feature_input_rejected user_id_prefix=%s error=%s",
            user_id[:8],
            type(error).__name__,
        )
        raise HTTPException(
            status_code=422,
            detail="Stored transaction data could not be analysed safely.",
        ) from error
    statement_ids = sorted(
        {item.statement_id for item in transactions if item.statement_id}
    )
    import_quality = await asyncio.to_thread(
        _fetch_statement_import_quality, user_id, access_token, statement_ids
    )
    accounts, statements = await asyncio.to_thread(
        fetch_accounts_and_statements, user_id, access_token
    )
    coverage = build_coverage(statements, accounts)
    identities = {
        account.account_id: AccountIdentity(account.account_id, account.bank_key, account.last4)
        for account in accounts
    }
    view = consolidate(transactions, identities)
    observation_end = {
        account.account_id: account.last_covered
        for account in coverage.accounts
        if account.last_covered is not None
    }
    snapshot = build_financial_features(
        user_id,
        view.transactions,
        statement_import_quality=import_quality,
        account_observation_end=observation_end,
    )
    return ConsolidatedInputs(
        transactions=view.transactions,
        snapshot=snapshot,
        coverage=coverage,
        accounts=accounts,
        reconciliation=view.reconciliation,
    )


def fetch_accounts_and_statements(
    user_id: str, access_token: str
) -> tuple[list[AccountRecord], list[StatementRecord]]:
    """The user's accounts and statement imports, with per-statement date bounds.

    Failure to read this metadata must not break analysis; the caller then
    simply has no coverage information, which it reports as such.
    """
    try:
        project_url, publishable_key = _supabase_config()
        owner = f"user_id=eq.{quote(user_id, safe='-')}"
        account_rows = _first_working_select(
            project_url, publishable_key, access_token, "accounts", _ACCOUNT_SELECTS, owner
        )
        statement_rows = _first_working_select(
            project_url,
            publishable_key,
            access_token,
            "statement_imports",
            _STATEMENT_SELECTS,
            f"{owner}&status=in.(processed,failed)&order=created_at.asc",
        )
        bounds = _statement_date_bounds(project_url, publishable_key, user_id, access_token)
    except HTTPException:
        logger.warning("statement_metadata_unavailable user_id_prefix=%s", user_id[:8])
        return [], []

    accounts = [
        AccountRecord(
            account_id=row["id"],
            name=row.get("name") if isinstance(row.get("name"), str) else None,
            institution=row.get("institution") if isinstance(row.get("institution"), str) else None,
            bank_key=row.get("bank_key") if isinstance(row.get("bank_key"), str) else None,
            last4=row.get("last_four_digits") if isinstance(row.get("last_four_digits"), str) else None,
        )
        for row in account_rows
        if isinstance(row.get("id"), str)
    ]
    statements: list[StatementRecord] = []
    for row in statement_rows:
        bound = bounds.get(row.get("id"))
        record = statement_record_from_row(
            row,
            first_transaction=bound[0] if bound else None,
            last_transaction=bound[1] if bound else None,
            outside_period=_outside_period(row, bound),
        )
        if record is not None:
            statements.append(record)
    return accounts, statements


def _first_working_select(
    project_url: str,
    publishable_key: str,
    access_token: str,
    table: str,
    selects: tuple[str, ...],
    filters: str,
) -> list[dict[str, Any]]:
    for select in selects:
        try:
            page = _authenticated_get(
                f"{project_url}/rest/v1/{table}?select={quote(select, safe='(),')}&{filters}",
                access_token=access_token,
                publishable_key=publishable_key,
            )
        except _OptionalTransactionColumnUnavailable:
            continue
        if not isinstance(page, list) or not all(isinstance(row, dict) for row in page):
            raise HTTPException(status_code=503, detail="Statement data response is invalid.")
        return page
    raise HTTPException(status_code=503, detail="Statement data is temporarily unavailable.")


def _statement_date_bounds(
    project_url: str, publishable_key: str, user_id: str, access_token: str
) -> dict[str, tuple[date, date, list[date]]]:
    """First and last extracted transaction date per statement, duplicates included.

    A statement whose rows are all overlap duplicates still covers its period.
    Only two columns are read, page by page.
    """
    url = (
        f"{project_url}/rest/v1/transactions?select=statement_id,date"
        f"&user_id=eq.{quote(user_id, safe='-')}&order=statement_id.asc,date.asc,id.asc"
    )
    seen: dict[str, list[date]] = {}
    for start in range(0, MAX_TRANSACTIONS * 2, PAGE_SIZE):
        page = _authenticated_get(
            url,
            access_token=access_token,
            publishable_key=publishable_key,
            range_header=f"{start}-{start + PAGE_SIZE - 1}",
        )
        if not isinstance(page, list):
            break
        for row in page:
            statement_id, day = row.get("statement_id"), row.get("date")
            if isinstance(statement_id, str) and isinstance(day, str):
                try:
                    seen.setdefault(statement_id, []).append(date.fromisoformat(day[:10]))
                except ValueError:
                    continue
        if len(page) < PAGE_SIZE:
            break
    return {statement_id: (min(days), max(days), days) for statement_id, days in seen.items()}


def _outside_period(row: dict[str, Any], bound: tuple[date, date, list[date]] | None) -> int:
    """Transactions dated outside a period the statement itself declared."""
    if bound is None or row.get("period_source") != "declared":
        return 0
    try:
        start = date.fromisoformat(str(row.get("statement_start_date"))[:10])
        end = date.fromisoformat(str(row.get("statement_end_date"))[:10])
    except ValueError:
        return 0
    return sum(1 for day in bound[2] if day < start or day > end)


def public_feature_payload(snapshot: FinancialFeatureSnapshot) -> dict[str, Any]:
    """API view of a snapshot without internal transaction identifiers."""
    payload = snapshot.model_dump(mode="json")
    income = payload.get("income")
    if isinstance(income, dict):
        income.pop("days_since_last_income", None)
    for candidate in payload.get("duplicate_candidates") or []:
        if isinstance(candidate, dict):
            candidate.pop("transaction_ids", None)
    # Keep quality metadata but drop import ids from the public surface.
    for item in payload.get("statement_import_quality") or []:
        if isinstance(item, dict):
            item.pop("import_id", None)
    payload.pop("import_ids_by_month", None)
    return payload


def _supabase_config() -> tuple[str, str]:
    project_url = settings.supabase_url.rstrip("/")
    publishable_key = settings.supabase_publishable_key()
    if not project_url or not publishable_key:
        logger.error("feature_data_unavailable reason=supabase_not_configured")
        raise HTTPException(status_code=503, detail="Financial analysis is not configured.")
    return project_url, publishable_key


def _authenticated_get(
    url: str,
    *,
    access_token: str,
    publishable_key: str,
    range_header: str | None = None,
) -> Any:
    headers = {
        "apikey": publishable_key,
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    if range_header:
        headers["Range"] = range_header
    request = Request(url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = ""
        try:
            body = error.read(4096).decode("utf-8", errors="replace").lower()
        except (OSError, UnicodeError):
            pass
        if error.code == 400 and ("column" in body or "schema cache" in body):
            raise _OptionalTransactionColumnUnavailable from error
        logger.warning(
            "feature_data_fetch_failed error_type=%s upstream_status=%s",
            type(error).__name__,
            error.code,
        )
        raise HTTPException(
            status_code=503,
            detail="Financial data is temporarily unavailable. Please try again.",
        ) from error
    except (URLError, TimeoutError, ValueError) as error:
        logger.warning(
            "feature_data_fetch_failed error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Financial data is temporarily unavailable. Please try again.",
        ) from error


def _fetch_transaction_rows(user_id: str, access_token: str) -> list[dict[str, Any]]:
    project_url, publishable_key = _supabase_config()
    for level, select in enumerate(_TRANSACTION_SELECTS, start=1):
        try:
            return _fetch_transaction_pages(
                project_url, publishable_key, user_id, access_token, select
            )
        except _OptionalTransactionColumnUnavailable:
            logger.warning("feature_optional_columns_unavailable fallback_level=%s", level)
    raise HTTPException(
        status_code=503,
        detail="Financial data is temporarily unavailable. Please try again.",
    )


def _fetch_transaction_pages(
    project_url: str,
    publishable_key: str,
    user_id: str,
    access_token: str,
    select: str,
) -> list[dict[str, Any]]:
    url = (
        f"{project_url}/rest/v1/transactions?select={quote(select, safe='(),')}"
        f"&user_id=eq.{quote(user_id, safe='-')}&is_duplicate=eq.false"
        "&order=date.asc,id.asc"
    )
    rows: list[dict[str, Any]] = []
    for start in range(0, MAX_TRANSACTIONS, PAGE_SIZE):
        page = _authenticated_get(
            url,
            access_token=access_token,
            publishable_key=publishable_key,
            range_header=f"{start}-{start + PAGE_SIZE - 1}",
        )
        if not isinstance(page, list) or not all(isinstance(row, dict) for row in page):
            raise HTTPException(status_code=503, detail="Financial data response is invalid.")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
    raise HTTPException(
        status_code=413,
        detail="Too many transactions to analyse at once. Please choose a shorter period.",
    )


def _fetch_statement_import_quality(
    user_id: str,
    access_token: str,
    statement_ids: list[str],
) -> list[StatementImportQuality]:
    """Load sanitised import quality for statements that contributed transactions."""
    if not statement_ids:
        return []
    project_url, publishable_key = _supabase_config()
    # PostgREST `in` filter; ids are UUIDs from our own rows.
    id_list = ",".join(statement_ids)
    url = (
        f"{project_url}/rest/v1/statement_imports"
        f"?select={quote(_IMPORT_QUALITY_SELECT, safe=',')}"
        f"&user_id=eq.{quote(user_id, safe='-')}"
        f"&id=in.({id_list})"
        f"&status=eq.processed"
    )
    page = _authenticated_get(
        url,
        access_token=access_token,
        publishable_key=publishable_key,
    )
    if not isinstance(page, list) or not all(isinstance(row, dict) for row in page):
        raise HTTPException(status_code=503, detail="Statement quality response is invalid.")
    qualities: list[StatementImportQuality] = []
    for row in page:
        parsed = parse_import_quality_row(row)
        if parsed is not None:
            qualities.append(parsed)
    return qualities
