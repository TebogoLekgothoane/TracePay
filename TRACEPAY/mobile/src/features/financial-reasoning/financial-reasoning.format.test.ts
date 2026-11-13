import {
  formatAnnualAmountMetricLabel,
  formatAvoidabilitySummary,
  formatAvoidableAmount,
  formatDetectedAmountHeading,
  formatMonthlyAmountMetricLabel,
  formatPersistence,
  formatReasoningEvidence,
  formatRootCauseType,
  isSpendingEscalationAnalysis,
  isVerificationRequired,
} from "./financial-reasoning.format";
import type { FinancialReasoning } from "./financial-reasoning.types";

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

const sampleAnalysis: FinancialReasoning = {
  reasoning_id: "abc123",
  leak_id: "leak123",
  root_cause_type: "potential_duplicate",
  title: "Potential duplicate payment requires verification",
  explanation: "Candidate only.",
  confidence: 0.78,
  evidence: {
    potential_duplicate_amount: "28.51",
    matching_transaction_count: 2,
    verification_required: true,
    merchant_key: "SHOULD NOT SHOW",
  },
  supporting_behavior_ids: ["dup:1"],
  supporting_feature_references: ["duplicate_candidates"],
  impact_assessment: {
    detected_amount: "28.51",
    detected_annual_amount: null,
    impact_kind: "one_time",
    potentially_avoidable_amount: null,
    potentially_avoidable_annual_amount: null,
    recoverable_amount: "28.51",
    avoidability_confidence: 0.72,
    currency: "ZAR",
  },
  avoidability: "high",
  persistence: "new",
  analysis_status: "verification_required",
  competing_explanations: [],
};

test("formats labels from API enums", () => {
  assert(
    formatRootCauseType("frequency_increase") === "Frequency increase",
    "root cause",
  );
  assert(formatPersistence("increasing") === "Increasing", "persistence");
  assert(
    formatAvoidabilitySummary("medium") === "Potentially reducible",
    "avoidability",
  );
  assert(formatAvoidableAmount(null) === "Not determined", "null avoidable");
});

test("redacts sensitive evidence keys", () => {
  const rows = formatReasoningEvidence(sampleAnalysis.evidence);
  assert(rows.every((row) => !row.label.includes("merchant")), "no merchant");
  assert(
    rows.some((row) => row.label === "Potential duplicate amount"),
    "keeps safe amount",
  );
});

test("detects verification-required analyses", () => {
  assert(isVerificationRequired(sampleAnalysis), "verification flag");
});

test("uses detected increase labels for spending escalation analyses", () => {
  const escalation = {
    ...sampleAnalysis,
    root_cause_type: "frequency_increase" as const,
    analysis_status: "supported" as const,
  };
  assert(isSpendingEscalationAnalysis(escalation), "escalation flag");
  assert(
    formatDetectedAmountHeading(escalation) === "Detected increase",
    "heading",
  );
  assert(
    formatMonthlyAmountMetricLabel(escalation) === "Monthly increase",
    "monthly label",
  );
  assert(
    formatDetectedAmountHeading(sampleAnalysis) === "Detected impact",
    "duplicate uses impact heading",
  );
});

test("qualifies annual amounts for temporary persistence", () => {
  assert(
    formatAnnualAmountMetricLabel("temporary") ===
      "Annualised if this pattern continues",
    "temporary annual label",
  );
  assert(formatAnnualAmountMetricLabel("increasing") === "Annual impact", "default annual");
});

test("formats reasoning escalation evidence rows", () => {
  const rows = formatReasoningEvidence({
    previous_total: "489.22",
    current_total: "974.95",
    absolute_change: "485.73",
    percentage_change: "99.29",
    current_transaction_count: 16,
    merchant_key: "hidden",
  });
  assert(rows.some((row) => row.label === "Previous monthly amount"), "baseline");
  assert(rows.every((row) => !row.value.includes("hidden")), "no raw merchant");
});
