import {
  formatExpectedSavings,
  formatFindingScope,
  formatImpactAmount,
  formatImpactDetail,
  formatImpactHeading,
  formatImpactValue,
  formatNonAdditiveNotice,
  formatPriority,
  formatRecommendationConfidence,
  formatRecommendedAction,
  isVerificationRequired,
} from "./financial-recommendations.format";
import type {
  FinancialRecommendationResult,
  Recommendation,
} from "./financial-recommendations.types";

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

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    recommendation_id: "a".repeat(32),
    recommendation_type: "monitor_spending_pattern",
    title: "Monitor spending increase",
    explanation: "Spending increased relative to the comparison period.",
    recommended_action: "Monitor whether this pattern continues.",
    priority: "medium",
    recommendation_confidence: 0.74,
    source_reasoning_id: "b".repeat(32),
    source_root_cause_type: "frequency_increase",
    evidence_references: ["months[].total_outflow"],
    finding_scope: "overall_pattern",
    impact_label: "detected_increase",
    potential_recovery_amount: null,
    supported_impact_amount: "485.74",
    expected_savings_amount: null,
    currency: "ZAR",
    ...overrides,
  };
}

test("formats priority and recommendation confidence from the response", () => {
  assert(formatPriority("high") === "High", "high priority");
  assert(formatPriority("medium") === "Medium", "medium priority");
  assert(formatPriority("low") === "Low", "low priority");
  assert(formatRecommendationConfidence(0.74) === "74%", "confidence");
});

test("labels fee activity and recurring amounts separately from savings", () => {
  const fee = recommendation({
    recommendation_type: "review_bank_fees",
    source_root_cause_type: "fee_accumulation",
    finding_scope: "standalone",
    impact_label: "observed_fee_activity",
    supported_impact_amount: "40.00",
  });
  const recurring = recommendation({
    recommendation_type: "review_recurring_payment",
    source_root_cause_type: "recurring_commitment",
    finding_scope: "standalone",
    impact_label: "observed_recurring_payment",
    supported_impact_amount: "149.00",
  });
  assert(formatImpactHeading(fee) === "Detected fee activity", "fee heading");
  assert(formatImpactHeading(recurring) === "Detected recurring amount", "recurring heading");
  assert(formatExpectedSavings(fee.expected_savings_amount) === "Not determined", "fee savings");
  assert(!isVerificationRequired(recurring), "recurring is not a duplicate check");
});

test("labels a detected increase without calling it savings", () => {
  const item = recommendation();
  const value = formatImpactValue(item);
  assert(formatImpactHeading(item) === "Detected increase", "heading");
  assert(value.endsWith(" / month"), "monthly period");
  assert(value.includes("485,74") || value.includes("485.74"), "amount");
  assert(!formatImpactHeading(item).toLowerCase().includes("saving"), "heading savings");
  assert(formatImpactDetail(item) === null, "no one-time detail");
  assert(formatImpactAmount(item) === value.replace(" / month", ""), "amount unchanged");
});

test("shows potential recovery as one-time verification, not guaranteed savings", () => {
  const item = recommendation({
    recommendation_type: "verify_potential_duplicate",
    source_root_cause_type: "potential_duplicate",
    finding_scope: "one_time_recovery_candidate",
    impact_label: "potential_recovery_candidate",
    potential_recovery_amount: "50.00",
    supported_impact_amount: "50.00",
    expected_savings_amount: null,
  });
  assert(isVerificationRequired(item), "verification");
  assert(formatImpactHeading(item) === "Potential recovery", "heading");
  assert(formatImpactDetail(item) === "One-time", "one-time");
  assert(!formatImpactValue(item).includes("/ month"), "recovery is not monthly");
  assert(formatImpactAmount(item).includes("50"), "recovery amount");
  assert(
    formatRecommendedAction(item) ===
      "Compare the transactions and confirm whether the payment was intentional.",
    "duplicate action",
  );
  assert(formatExpectedSavings(item.expected_savings_amount) === "Not determined", "savings");
  const text = `${formatImpactHeading(item)} ${formatExpectedSavings(item.expected_savings_amount)}`;
  assert(!/you will save|guaranteed|fraud/i.test(text), "forbidden language");
});

test("keeps useful actions and drops repeated defensive sentences", () => {
  const recurring = recommendation({
    recommendation_type: "review_recurring_payment",
    recommended_action:
      "Verify whether the recurring payment is still wanted and whether the amount and service are still appropriate. TracePay will not stop or change the payment.",
  });
  const fees = recommendation({
    recommendation_type: "review_bank_fees",
    recommended_action:
      "Review the fee transactions and determine whether lower-cost account or payment options are available. TracePay will not change the account or contact the bank.",
  });
  const overall = recommendation({
    recommended_action:
      "Monitor whether this pattern continues relative to the comparison period. TracePay will not move money or change financial settings.",
  });
  assert(
    formatRecommendedAction(recurring) ===
      "Verify whether the recurring payment is still wanted and whether the amount and service are still appropriate.",
    "recurring action",
  );
  assert(
    formatRecommendedAction(fees) ===
      "Review the fee transactions and determine whether lower-cost account or payment options are available.",
    "fee action",
  );
  assert(
    formatRecommendedAction(overall) ===
      "Monitor whether this pattern continues relative to the comparison period.",
    "overall action",
  );
  assert(!formatRecommendedAction(overall).includes("TracePay will not"), "disclaimer removed");
});

test("leaves null expected savings undetermined", () => {
  assert(formatExpectedSavings(null) === "Not determined", "null savings");
});

test("formats finding scope from the response", () => {
  assert(formatFindingScope("overall_pattern") === "Overall pattern", "overall");
  assert(
    formatFindingScope("contributing_category") === "Contributing category",
    "category",
  );
  assert(
    formatFindingScope("one_time_recovery_candidate") === "One-time recovery candidate",
    "recovery scope",
  );
  assert(formatFindingScope("standalone") === "Standalone", "standalone");
});

test("shows a non-additive notice only when overall and category patterns overlap", () => {
  const result: FinancialRecommendationResult = {
    user_id: "user-a",
    period_start: "2026-07-01",
    period_end: "2026-09-30",
    reasoning_version: "1.0",
    recommendation_version: "1.0",
    recommendation_count: 2,
    recommendations: [
      recommendation(),
      recommendation({
        recommendation_id: "c".repeat(32),
        recommendation_type: "review_high_frequency_spending",
        finding_scope: "contributing_category",
        supported_impact_amount: "180.00",
      }),
    ],
    metadata: {
      automated_actions: "none",
      savings_policy: "only_when_directly_supported",
      amounts_are_additive: false,
      overlap_note: "Do not add their amounts together.",
    },
  };
  assert(
    formatNonAdditiveNotice(result) ===
      "Amounts from overlapping patterns should not be added together.",
    "overlap notice",
  );
  const single = {
    ...result,
    recommendation_count: 1,
    recommendations: [recommendation({ finding_scope: "standalone", impact_label: "observed_fee_activity" as const })],
    metadata: { ...result.metadata, overlap_note: null },
  };
  assert(formatNonAdditiveNotice(single) === null, "standalone has no overlap notice");
});
