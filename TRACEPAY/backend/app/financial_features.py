"""Authenticated retrieval and computation for financial feature snapshots."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.config import settings
from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row
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
_TRANSACTION_SELECT = (
    "id,user_id,date,transaction_time,description,amount,type,is_duplicate,merchant_name,"
    "statement_id,category_confidence,category_rule,transaction_class,"
    "classification_confidence,classification_reason,categories(name)"
)
_TRANSACTION_SELECT_WITHOUT_OPTIONAL_TIME = (
    "id,user_id,date,description,amount,type,is_duplicate,merchant_name,"
    "statement_id,category_confidence,category_rule,transaction_class,"
    "classification_confidence,classification_reason,categories(name)"
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
    return transactions, build_financial_features(
        user_id,
        transactions,
        statement_import_quality=import_quality,
    )


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
        if (
            error.code == 400
            and "transaction_time" in body
            and ("column" in body or "schema cache" in body)
        ):
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
    try:
        return _fetch_transaction_pages(
            project_url,
            publishable_key,
            user_id,
            access_token,
            _TRANSACTION_SELECT,
        )
    except _OptionalTransactionColumnUnavailable:
        logger.warning(
            "feature_optional_column_unavailable column=transaction_time fallback=legacy_select"
        )
        return _fetch_transaction_pages(
            project_url,
            publishable_key,
            user_id,
            access_token,
            _TRANSACTION_SELECT_WITHOUT_OPTIONAL_TIME,
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
