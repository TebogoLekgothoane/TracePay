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
from leak_intelligence.models import FinancialFeatureSnapshot

logger = logging.getLogger("tracepay.financial_features")
PAGE_SIZE = 1_000
MAX_TRANSACTIONS = 10_000
REQUEST_TIMEOUT_SECONDS = 10


async def build_user_feature_snapshot(
    user_id: str, access_token: str
) -> FinancialFeatureSnapshot:
    """Fetch only the authenticated user's canonical rows and derive features."""
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
    return build_financial_features(user_id, transactions)


def public_feature_payload(snapshot: FinancialFeatureSnapshot) -> dict[str, Any]:
    """API view of a snapshot without internal transaction identifiers."""
    payload = snapshot.model_dump(mode="json")
    income = payload.get("income")
    if isinstance(income, dict):
        income.pop("days_since_last_income", None)
    for candidate in payload.get("duplicate_candidates") or []:
        if isinstance(candidate, dict):
            candidate.pop("transaction_ids", None)
    return payload


def _fetch_transaction_rows(user_id: str, access_token: str) -> list[dict[str, Any]]:
    project_url = settings.supabase_url.rstrip("/")
    publishable_key = settings.supabase_publishable_key()
    if not project_url or not publishable_key:
        logger.error("feature_data_unavailable reason=supabase_not_configured")
        raise HTTPException(status_code=503, detail="Financial analysis is not configured.")

    select = (
        "id,user_id,date,description,amount,type,is_duplicate,merchant_name,"
        "category_confidence,category_rule,transaction_class,"
        "classification_confidence,classification_reason,categories(name)"
    )
    url = (
        f"{project_url}/rest/v1/transactions?select={quote(select, safe='(),')}"
        f"&user_id=eq.{quote(user_id, safe='-')}&is_duplicate=eq.false"
        "&order=date.asc,id.asc"
    )
    rows: list[dict[str, Any]] = []
    for start in range(0, MAX_TRANSACTIONS, PAGE_SIZE):
        request = Request(
            url,
            headers={
                "apikey": publishable_key,
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "Range": f"{start}-{start + PAGE_SIZE - 1}",
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                page = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            logger.warning(
                "feature_data_fetch_failed user_id_prefix=%s error_type=%s",
                user_id[:8],
                type(error).__name__,
            )
            raise HTTPException(
                status_code=503,
                detail="Financial data is temporarily unavailable. Please try again.",
            ) from error
        if not isinstance(page, list) or not all(isinstance(row, dict) for row in page):
            raise HTTPException(status_code=503, detail="Financial data response is invalid.")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
    raise HTTPException(
        status_code=413,
        detail="Too many transactions to analyse at once. Please choose a shorter period.",
    )
