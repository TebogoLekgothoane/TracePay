import type { FinancialReasoningResult } from "../financial-reasoning/financial-reasoning.types";
import type { FinancialRecommendationResult } from "../financial-recommendations/financial-recommendations.types";
import type { LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";

export type ScenarioCaseKind = "positive" | "negative" | "edge";

export type ScenarioExpectation = {
  detected: boolean;
  leak_type: string | null;
  leak_types: string[];
  behavior_type: string | null;
};

export type SyntheticScenario = {
  scenario_id: string;
  fi_id: string | null;
  name: string;
  case_kind: ScenarioCaseKind;
  family: string;
  summary: string;
  expected: ScenarioExpectation;
};

export type SyntheticScenarioCatalog = {
  dataset: string;
  currency: "ZAR";
  scenarios: SyntheticScenario[];
};

export type SyntheticBehaviourObservation = {
  behavior_type: string;
  title: string;
  confidence: number;
};

export type SyntheticBehaviourResult = {
  transaction_count: number;
  observations: SyntheticBehaviourObservation[];
};

export type SyntheticFeatureSummary = {
  transaction_count: number;
  merchant_count: number;
  category_count: number;
};

export type SyntheticScenarioAnalysis = {
  scenario: SyntheticScenario;
  features: SyntheticFeatureSummary;
  behaviour: SyntheticBehaviourResult;
  leaks: LeakDetectionResult;
  reasoning: FinancialReasoningResult;
  recommendations: FinancialRecommendationResult;
};
