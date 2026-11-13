import { parseFinancialRecommendationResult } from "../financial-recommendations/financial-recommendations.parse";
import { parseFinancialReasoningResult } from "../financial-reasoning/financial-reasoning.parse";
import { parseLeakDetectionResult } from "../leak-intelligence/leak-intelligence.parse";
import type {
  ScenarioCaseKind,
  ScenarioExpectation,
  SyntheticBehaviourResult,
  SyntheticFeatureSummary,
  SyntheticScenario,
  SyntheticScenarioAnalysis,
  SyntheticScenarioCatalog,
} from "./synthetic-intelligence.types";

export class SyntheticIntelligenceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticIntelligenceParseError";
  }
}

const CASE_KINDS = new Set<ScenarioCaseKind>(["positive", "negative", "edge"]);

export function scenarioLabel(scenario: SyntheticScenario): string {
  return scenario.fi_id ? `${scenario.fi_id} — ${scenario.name}` : scenario.name;
}

export function parseSyntheticScenarioCatalog(
  payload: unknown,
): SyntheticScenarioCatalog {
  if (!isRecord(payload) || !Array.isArray(payload.scenarios)) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid response.",
    );
  }
  if (typeof payload.dataset !== "string" || payload.currency !== "ZAR") {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid response.",
    );
  }
  return {
    dataset: payload.dataset,
    currency: "ZAR",
    scenarios: payload.scenarios.map(parseScenario),
  };
}

export function parseSyntheticScenarioAnalysis(
  payload: unknown,
): SyntheticScenarioAnalysis {
  if (!isRecord(payload)) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic analysis returned an invalid response.",
    );
  }
  try {
    return {
      scenario: parseScenario(payload.scenario),
      features: parseFeatures(payload.features),
      behaviour: parseBehaviour(payload.behaviour),
      leaks: parseLeakDetectionResult(payload.leaks),
      reasoning: parseFinancialReasoningResult(payload.reasoning),
      recommendations: parseFinancialRecommendationResult(payload.recommendations),
    };
  } catch (error) {
    if (error instanceof SyntheticIntelligenceParseError) {
      throw error;
    }
    throw new SyntheticIntelligenceParseError(
      error instanceof Error
        ? error.message
        : "Synthetic analysis returned an invalid response.",
    );
  }
}

function parseScenario(value: unknown): SyntheticScenario {
  if (!isRecord(value) || !isCaseKind(value.case_kind)) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid scenario.",
    );
  }
  const scenarioId = value.scenario_id;
  const name = value.name;
  const family = value.family;
  const summary = value.summary;
  if (
    typeof scenarioId !== "string" ||
    !scenarioId ||
    typeof name !== "string" ||
    !name ||
    typeof family !== "string" ||
    !family ||
    typeof summary !== "string" ||
    !summary ||
    (value.fi_id !== null && typeof value.fi_id !== "string")
  ) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid scenario.",
    );
  }
  return {
    scenario_id: scenarioId,
    fi_id: value.fi_id,
    name,
    case_kind: value.case_kind,
    family,
    summary,
    expected: parseExpectation(value.expected),
  };
}

function parseExpectation(value: unknown): ScenarioExpectation {
  if (!isRecord(value) || typeof value.detected !== "boolean") {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid scenario.",
    );
  }
  if (
    !isNullableString(value.leak_type) ||
    !isNullableString(value.behavior_type) ||
    !isStringArray(value.leak_types)
  ) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic scenarios returned an invalid scenario.",
    );
  }
  return {
    detected: value.detected,
    leak_type: value.leak_type,
    leak_types: value.leak_types,
    behavior_type: value.behavior_type,
  };
}

function parseFeatures(value: unknown): SyntheticFeatureSummary {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.transaction_count) ||
    !Array.isArray(value.merchants) ||
    !Array.isArray(value.categories)
  ) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic analysis returned invalid financial features.",
    );
  }
  return {
    transaction_count: value.transaction_count,
    merchant_count: value.merchants.length,
    category_count: value.categories.length,
  };
}

function parseBehaviour(value: unknown): SyntheticBehaviourResult {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.transaction_count) ||
    !Array.isArray(value.observations)
  ) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic analysis returned invalid behaviour results.",
    );
  }
  return {
    transaction_count: value.transaction_count,
    observations: value.observations.map(parseObservation),
  };
}

function parseObservation(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.behavior_type !== "string" ||
    typeof value.title !== "string" ||
    !isFiniteNumber(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new SyntheticIntelligenceParseError(
      "Synthetic analysis returned invalid behaviour results.",
    );
  }
  return {
    behavior_type: value.behavior_type,
    title: value.title,
    confidence: value.confidence,
  };
}

function isCaseKind(value: unknown): value is ScenarioCaseKind {
  return typeof value === "string" && CASE_KINDS.has(value as ScenarioCaseKind);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
