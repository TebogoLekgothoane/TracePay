"""Authenticated adapter for the optional Anthropic financial analysis."""

from __future__ import annotations

import asyncio

from fastapi import HTTPException

from app.financial_features import _fetch_transaction_rows
from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row
from leak_intelligence.anthropic_analyzer import (
    AnthropicAnalysisError,
    analyze_transactions_with_anthropic,
    anthropic_analysis_available,
)


async def build_user_anthropic_analysis(user_id: str, access_token: str) -> dict[str, object]:
    """Fetch the authenticated user's rows and run the opt-in AI analyzer."""
    if not anthropic_analysis_available():
        return {"available": False, "provider": "anthropic", "leaks": [], "subscriptions": [], "notes": []}
    rows = await asyncio.to_thread(_fetch_transaction_rows, user_id, access_token)
    try:
        transactions = [
            feature_transaction_from_row(row, expected_user_id=user_id)
            for row in rows
        ]
    except FeatureRowValidationError as error:
        raise HTTPException(status_code=422, detail="Stored transaction data could not be analysed safely.") from error
    try:
        result = await asyncio.to_thread(analyze_transactions_with_anthropic, transactions)
    except AnthropicAnalysisError as error:
        raise HTTPException(status_code=503, detail="Anthropic financial analysis is temporarily unavailable.") from error
    return {"available": True, "provider": "anthropic", **result}
