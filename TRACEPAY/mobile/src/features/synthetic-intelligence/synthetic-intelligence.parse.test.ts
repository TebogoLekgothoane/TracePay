import {
  parseSyntheticScenarioAnalysis,
  parseSyntheticScenarioCatalog,
  scenarioLabel,
  SyntheticIntelligenceParseError,
} from "./synthetic-intelligence.parse";
import { clearSyntheticAnalysis, isSyntheticDebugSource, readSyntheticAnalysis, storeSyntheticAnalysis } from "./synthetic-intelligence.session";
import type { SyntheticScenario } from "./synthetic-intelligence.types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const scenario: SyntheticScenario = {
  scenario_id: "FI-029-fast-food-escalation",
  fi_id: "FI-029",
  name: "Fast food escalation",
  case_kind: "positive",
  family: "behaviour",
  summary: "KFC spend rises across three months.",
  expected: {
    detected: true,
    leak_type: "food_spending_leak",
    leak_types: [],
    behavior_type: null,
  },
};

test("labels catalogue scenarios without hardcoding the list", () => {
  assert(
    scenarioLabel(scenario) === "FI-029 — Fast food escalation",
    "uses the FI id and name",
  );
  assert(
    scenarioLabel({ ...scenario, fi_id: null, name: "DSTV debit order" }) ===
      "DSTV debit order",
    "omits a missing FI id",
  );
});

test("parses a scenario catalog and rejects an empty payload", () => {
  const catalog = parseSyntheticScenarioCatalog({
    dataset: "tracepay-intelligence-v1",
    currency: "ZAR",
    scenarios: [scenario],
  });
  assert(catalog.scenarios.length === 1, "keeps the scenario");
  assert(catalog.scenarios[0]?.scenario_id === scenario.scenario_id, "keeps the id");
  let rejected = false;
  try {
    parseSyntheticScenarioCatalog({ dataset: "x", currency: "USD", scenarios: [] });
  } catch (error) {
    rejected = error instanceof SyntheticIntelligenceParseError;
  }
  assert(rejected, "rejects a non-ZAR catalog");
});

test("parses an analysis response and rejects a missing layer", () => {
  const analysis = parseSyntheticScenarioAnalysis(analysisPayload());
  assert(analysis.features.transaction_count === 3, "reads the feature count");
  assert(analysis.features.merchant_count === 1, "counts merchants");
  assert(analysis.behaviour.observations[0]?.behavior_type === "category_growth", "reads behaviour");
  assert(analysis.leaks.leaks[0]?.leak_type === "food_spending_leak", "reads leaks");
  assert(analysis.reasoning.analyses.length === 1, "reads reasoning");
  assert(analysis.recommendations.recommendation_count === 1, "reads recommendations");

  const broken = analysisPayload();
  delete broken.behaviour;
  let rejected = false;
  try {
    parseSyntheticScenarioAnalysis(broken);
  } catch (error) {
    rejected = error instanceof SyntheticIntelligenceParseError;
  }
  assert(rejected, "rejects an analysis without behaviour");
});

test("stores a synthetic run without treating it as account data", () => {
  clearSyntheticAnalysis();
  assert(readSyntheticAnalysis() === null, "starts empty");
  const analysis = parseSyntheticScenarioAnalysis(analysisPayload());
  storeSyntheticAnalysis(analysis);
  assert(readSyntheticAnalysis()?.scenario.scenario_id === scenario.scenario_id, "stores the run");
  assert(isSyntheticDebugSource("synthetic"), "recognises the debug source");
  assert(isSyntheticDebugSource(["synthetic"]), "recognises a repeated param");
  assert(!isSyntheticDebugSource(undefined), "leaves the normal debug route alone");
  clearSyntheticAnalysis();
});

function analysisPayload(): Record<string, unknown> {
  return {
    scenario,
    features: {
      transaction_count: 3,
      merchants: [{ merchant_name: "KFC" }],
      categories: [{ category_name: "Fast Food" }],
    },
    behaviour: {
      transaction_count: 3,
      observations: [
        {
          behavior_type: "category_growth",
          title: "Fast Food spending increased",
          confidence: 0.8,
        },
      ],
    },
    leaks: {
      user_id: "synthetic-intelligence-user",
      transaction_count: 3,
      period_start: "2026-07-08",
      period_end: "2026-09-30",
      detector_version: "1.0",
      leaks: [
        {
          leak_id: "a".repeat(16),
          fingerprint: "b".repeat(16),
          leak_type: "food_spending_leak",
          title: "Potential convenience food spending escalation",
          description: "Convenience food spending increased.",
          severity: "medium",
          confidence: 0.7,
          status: "active",
          estimated_monthly_impact: "255.00",
          estimated_annual_impact: "3060.00",
          impact_kind: "estimated",
          evidence: { category_name: "Fast Food" },
          supporting_behavior_ids: [],
          supporting_feature_references: [],
          detector_version: "1.0",
          detected_at: "2026-09-30T00:00:00Z",
          period_start: "2026-07-08",
          period_end: "2026-09-30",
        },
      ],
    },
    reasoning: {
      user_id: "synthetic-intelligence-user",
      transaction_count: 3,
      period_start: "2026-07-08",
      period_end: "2026-09-30",
      reasoning_version: "1.0",
      potential_leaks_analyzed: 1,
      analyses: [
        {
          reasoning_id: "c".repeat(16),
          leak_id: "a".repeat(16),
          root_cause_type: "amount_increase",
          title: "Fast food increased",
          explanation: "The category total rose.",
          confidence: 0.7,
          evidence: {},
          supporting_behavior_ids: [],
          supporting_feature_references: [],
          impact_assessment: {
            detected_amount: "255.00",
            detected_annual_amount: "3060.00",
            impact_kind: "estimated",
            potentially_avoidable_amount: null,
            potentially_avoidable_annual_amount: null,
            recoverable_amount: null,
            avoidability_confidence: null,
            currency: "ZAR",
          },
          avoidability: "unknown",
          persistence: "increasing",
          analysis_status: "supported",
          competing_explanations: [],
        },
      ],
    },
    recommendations: {
      user_id: "synthetic-intelligence-user",
      period_start: "2026-07-08",
      period_end: "2026-09-30",
      reasoning_version: "1.0",
      recommendation_version: "1.0",
      recommendation_count: 1,
      recommendations: [
        {
          recommendation_id: "d".repeat(16),
          recommendation_type: "monitor_spending_pattern",
          title: "Review fast food",
          explanation: "Fast food spending increased.",
          recommended_action: "Review the category.",
          priority: "medium",
          recommendation_confidence: 0.7,
          source_reasoning_id: "c".repeat(16),
          source_root_cause_type: "amount_increase",
          evidence_references: [],
          finding_scope: "contributing_category",
          impact_label: "detected_increase",
          potential_recovery_amount: null,
          supported_impact_amount: "255.00",
          expected_savings_amount: null,
          currency: "ZAR",
        },
      ],
      metadata: {
        automated_actions: "none",
        savings_policy: "only_when_directly_supported",
        amounts_are_additive: false,
        overlap_note: null,
      },
    },
  };
}
