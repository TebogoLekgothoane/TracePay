"""Development-only runner for named synthetic intelligence scenarios.

The route never reads or writes Supabase transactions. Scenario ids must already
exist in the server-side manifest.
"""

from __future__ import annotations

import logging
import re

from fastapi import Header, HTTPException

from app.auth import require_supabase_user
from app.config import settings
from app.financial_features import public_feature_payload
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions

logger = logging.getLogger("tracepay.synthetic_intelligence")
_SCENARIO_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,80}$")


def synthetic_intelligence_debug_enabled() -> bool:
    """True only for an explicit development process with the debug flag on."""
    return (
        settings.tracepay_env == "development" and settings.synthetic_intelligence_debug
    )


async def require_synthetic_debug_user(
    authorization: str | None = Header(default=None),
) -> str:
    """Reject the route outside development before any authentication lookup."""
    if not synthetic_intelligence_debug_enabled():
        raise HTTPException(status_code=404, detail="Not found.")
    return await require_supabase_user(authorization)


def scenario_catalog() -> dict[str, object]:
    from tests.intelligence_dataset import load_intelligence_manifest

    manifest = load_intelligence_manifest()
    return {
        "dataset": manifest.dataset,
        "currency": manifest.currency,
        "scenarios": [_public_scenario(spec) for spec in manifest.scenarios],
    }


def _public_scenario(spec: object) -> dict[str, object]:
    payload = spec.model_dump(mode="json")  # type: ignore[attr-defined]
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=500,
            detail="Synthetic analysis could not be completed.",
        )
    payload.pop("transactions_file", None)
    return payload


def analyze_scenario(scenario_id: str) -> dict[str, object]:
    """Run one manifest scenario through the existing intelligence engines."""
    from tests.intelligence_dataset import load_intelligence_scenario

    if not _SCENARIO_ID.fullmatch(scenario_id):
        raise HTTPException(status_code=404, detail="Not found.")
    try:
        scenario = load_intelligence_scenario(scenario_id)
    except KeyError:
        raise HTTPException(
            status_code=404, detail="Unknown intelligence scenario."
        ) from None

    transactions = list(scenario.transactions)
    snapshot = build_financial_features(scenario.user_id, transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)
    if recommendations.user_id != scenario.user_id:
        logger.error("synthetic_analysis_user_mismatch scenario_id=%s", scenario_id)
        raise HTTPException(
            status_code=500,
            detail="Synthetic analysis could not be completed.",
        )
    logger.info(
        "synthetic_analysis_completed scenario_id=%s transactions=%s leaks=%s",
        scenario_id,
        snapshot.transaction_count,
        len(leaks.leaks),
    )
    return {
        "scenario": _public_scenario(scenario.spec),
        "features": public_feature_payload(snapshot),
        "behaviour": behaviours.model_dump(mode="json"),
        "leaks": leaks.model_dump(mode="json"),
        "reasoning": reasoning.model_dump(mode="json"),
        "recommendations": recommendations.model_dump(mode="json"),
    }
