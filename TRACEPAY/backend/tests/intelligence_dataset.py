"""Load deterministic synthetic intelligence scenarios into canonical transactions.

Rows match the select used by ``build_user_feature_snapshot`` and are converted
with ``feature_transaction_from_row``. Nothing here writes to Supabase.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, get_args

from pydantic import BaseModel, Field, field_validator

from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.behaviour_models import BehaviorType
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_models import LeakDetectionResult, LeakType
from leak_intelligence.models import FeatureTransaction

DATASET_ROOT = Path(__file__).resolve().parent / "fixtures" / "intelligence"
MANIFEST_PATH = DATASET_ROOT / "manifest.json"
SYNTHETIC_USER_ID = "synthetic-intelligence-user"

CaseKind = Literal["positive", "negative", "edge"]
_LEAK_TYPES = set(get_args(LeakType))
_BEHAVIOR_TYPES = set(get_args(BehaviorType))


class ScenarioExpectation(BaseModel):
    """High-level outcome expressed with existing intelligence contracts."""

    detected: bool
    leak_type: str | None = None
    leak_types: list[str] = Field(default_factory=list)
    behavior_type: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)

    @field_validator("leak_type")
    @classmethod
    def _known_leak_type(cls, value: str | None) -> str | None:
        if value is not None and value not in _LEAK_TYPES:
            raise ValueError(f"Unknown leak_type: {value}")
        return value

    @field_validator("leak_types")
    @classmethod
    def _known_leak_types(cls, value: list[str]) -> list[str]:
        unknown = [item for item in value if item not in _LEAK_TYPES]
        if unknown:
            raise ValueError(f"Unknown leak_type: {', '.join(unknown)}")
        return value

    @field_validator("behavior_type")
    @classmethod
    def _known_behavior_type(cls, value: str | None) -> str | None:
        if value is not None and value not in _BEHAVIOR_TYPES:
            raise ValueError(f"Unknown behavior_type: {value}")
        return value

    def target_leak_types(self) -> list[str]:
        if self.leak_types:
            return list(self.leak_types)
        if self.leak_type:
            return [self.leak_type]
        return []


class ScenarioSpec(BaseModel):
    scenario_id: str = Field(min_length=1)
    fi_id: str | None = None
    name: str = Field(min_length=1)
    case_kind: CaseKind
    family: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    transactions_file: str = Field(min_length=1)
    expected: ScenarioExpectation


class DatasetManifest(BaseModel):
    dataset: str
    currency: Literal["ZAR"]
    user_id: str
    scenarios: list[ScenarioSpec]


@dataclass(frozen=True)
class IntelligenceScenario:
    spec: ScenarioSpec
    transactions: tuple[FeatureTransaction, ...]

    @property
    def scenario_id(self) -> str:
        return self.spec.scenario_id

    @property
    def user_id(self) -> str:
        return self.transactions[0].user_id if self.transactions else SYNTHETIC_USER_ID


@dataclass(frozen=True)
class ScenarioEvaluation:
    leak_types: tuple[str, ...]
    behavior_types: tuple[str, ...]
    leaks: LeakDetectionResult


def load_intelligence_scenario(scenario_id: str) -> IntelligenceScenario:
    """Return canonical transactions for one named synthetic scenario."""
    scenario = _scenarios_by_id().get(scenario_id)
    if scenario is None:
        known = ", ".join(sorted(_scenarios_by_id()))
        raise KeyError(f"Unknown intelligence scenario '{scenario_id}'. Known: {known}")
    return scenario


def load_all_intelligence_scenarios() -> tuple[IntelligenceScenario, ...]:
    return tuple(_scenarios_by_id().values())


def evaluate_intelligence_scenario(
    scenario: IntelligenceScenario,
) -> ScenarioEvaluation:
    """Run the existing feature, behaviour, and leak pipeline. Does not modify it."""
    snapshot = build_financial_features(scenario.user_id, list(scenario.transactions))
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    return ScenarioEvaluation(
        leak_types=tuple(item.leak_type for item in leaks.leaks),
        behavior_types=tuple(item.behavior_type for item in behaviours.observations),
        leaks=leaks,
    )


def expectation_mismatch(
    scenario: IntelligenceScenario, evaluation: ScenarioEvaluation
) -> str | None:
    """Return a mismatch description when the pipeline disagrees with the scenario."""
    expected = scenario.spec.expected
    problems: list[str] = []
    for leak_type in expected.target_leak_types():
        present = leak_type in evaluation.leak_types
        if present != expected.detected:
            problems.append(
                f"leak_type {leak_type}: expected detected={expected.detected}, actual={present}"
            )
    if expected.behavior_type:
        present = expected.behavior_type in evaluation.behavior_types
        if present != expected.detected:
            problems.append(
                f"behavior_type {expected.behavior_type}: "
                f"expected detected={expected.detected}, actual={present}"
            )
    if expected.detected and expected.evidence:
        leak_type = expected.leak_type or (
            expected.leak_types[0] if expected.leak_types else None
        )
        match = next(
            (item for item in evaluation.leaks.leaks if item.leak_type == leak_type),
            None,
        )
        if match is None:
            problems.append(f"evidence requested but {leak_type} was not detected")
        else:
            for key, value in expected.evidence.items():
                actual = match.evidence.get(key)
                if isinstance(actual, Decimal):
                    actual = str(actual)
                if actual != value:
                    problems.append(
                        f"evidence.{key}: expected {value!r}, actual {actual!r}"
                    )
    if not problems:
        return None
    actual = (
        f"leaks={list(evaluation.leak_types) or ['none']}; "
        f"behaviours={list(evaluation.behavior_types) or ['none']}"
    )
    return f"{scenario.scenario_id}: {'; '.join(problems)}. Actual {actual}"


def load_intelligence_manifest() -> DatasetManifest:
    """Return the synthetic scenario manifest without exposing transaction rows."""
    _scenarios_by_id()
    if _CACHED_MANIFEST is None:
        raise RuntimeError("Synthetic intelligence manifest was not loaded.")
    return _CACHED_MANIFEST


_CACHED_MANIFEST: DatasetManifest | None = None


@lru_cache(maxsize=1)
def _scenarios_by_id() -> dict[str, IntelligenceScenario]:
    global _CACHED_MANIFEST
    manifest = DatasetManifest.model_validate_json(
        MANIFEST_PATH.read_text(encoding="utf-8")
    )
    _CACHED_MANIFEST = manifest
    if manifest.user_id != SYNTHETIC_USER_ID:
        raise ValueError(
            "Intelligence dataset user id must stay on the synthetic user."
        )
    loaded: dict[str, IntelligenceScenario] = {}
    for spec in manifest.scenarios:
        if spec.scenario_id in loaded:
            raise ValueError(f"Duplicate scenario id: {spec.scenario_id}")
        path = DATASET_ROOT / spec.transactions_file
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or not rows:
            raise ValueError(
                f"{spec.scenario_id} must contain a non-empty transaction list."
            )
        transactions = tuple(
            feature_transaction_from_row(row, expected_user_id=manifest.user_id)
            for row in rows
        )
        loaded[spec.scenario_id] = IntelligenceScenario(
            spec=spec, transactions=transactions
        )
    return loaded
