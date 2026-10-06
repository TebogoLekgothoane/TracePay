import { formatRootCauseType } from "../financial-reasoning/financial-reasoning.format";
import {
  formatConfidence,
  formatCurrency,
} from "../leak-intelligence/leak-intelligence.format";
import type {
  FinancialRecommendationResult,
  FindingScope,
  Recommendation,
  RecommendationPriority,
} from "./financial-recommendations.types";

export { formatRootCauseType };

const NON_ADDITIVE_NOTICE =
  "Amounts from overlapping patterns should not be added together.";

export const RECOMMENDATION_DISCLAIMER =
  "TracePay recommendations are informational. TracePay does not automatically move money, change financial settings, contact banks, or dispute transactions.";

const DISPLAY_ACTIONS: Partial<Record<Recommendation["recommendation_type"], string>> = {
  verify_potential_duplicate:
    "Compare the transactions and confirm whether the payment was intentional.",
  review_recurring_payment:
    "Verify whether the recurring payment is still wanted and whether the amount and service are still appropriate.",
  review_bank_fees:
    "Review the fee transactions and determine whether lower-cost account or payment options are available.",
};

const DEFENSIVE_ACTION_SENTENCE = /^TracePay (?:will not|is not)\b/i;

export function formatPriority(value: RecommendationPriority): string {
  const labels: Record<RecommendationPriority, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return labels[value];
}

export function formatRecommendationConfidence(value: number): string {
  return formatConfidence(value);
}

export function formatFindingScope(value: FindingScope): string {
  const labels: Record<FindingScope, string> = {
    overall_pattern: "Overall pattern",
    contributing_category: "Contributing category",
    one_time_recovery_candidate: "One-time recovery candidate",
    standalone: "Standalone",
  };
  return labels[value];
}

export function isVerificationRequired(recommendation: Recommendation): boolean {
  return (
    recommendation.recommendation_type === "verify_potential_duplicate" ||
    recommendation.source_root_cause_type === "potential_duplicate" ||
    recommendation.impact_label === "potential_recovery_candidate"
  );
}

export function formatImpactHeading(recommendation: Recommendation): string {
  if (isVerificationRequired(recommendation)) {
    return "Potential recovery";
  }
  switch (recommendation.impact_label) {
    case "detected_increase":
      return "Detected increase";
    case "observed_fee_activity":
      return "Detected fee activity";
    case "observed_recurring_payment":
      return "Detected recurring amount";
    default:
      return "Detected amount";
  }
}

export function formatImpactAmount(recommendation: Recommendation): string {
  const amount = isVerificationRequired(recommendation)
    ? recommendation.potential_recovery_amount
    : recommendation.supported_impact_amount;
  return formatOptionalMoney(amount);
}

export function formatImpactDetail(recommendation: Recommendation): string | null {
  return isVerificationRequired(recommendation) ? "One-time" : null;
}

/** Shows the server amount, with a monthly period only for detected increases. */
export function formatImpactValue(recommendation: Recommendation): string {
  const amount = formatImpactAmount(recommendation);
  if (
    amount === "Not determined" ||
    isVerificationRequired(recommendation) ||
    recommendation.impact_label !== "detected_increase"
  ) {
    return amount;
  }
  return `${amount} / month`;
}

export function formatRecommendedAction(recommendation: Recommendation): string {
  const concise = DISPLAY_ACTIONS[recommendation.recommendation_type];
  if (concise) {
    return concise;
  }
  const sentences = recommendation.recommended_action
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !DEFENSIVE_ACTION_SENTENCE.test(sentence));
  return sentences.join(" ") || recommendation.recommended_action;
}

export function formatExpectedSavings(
  amount: Recommendation["expected_savings_amount"],
): string {
  if (amount === null) {
    return "Not determined";
  }
  return formatOptionalMoney(amount);
}

export function formatNonAdditiveNotice(
  result: FinancialRecommendationResult,
): string | null {
  const scopes = new Set(
    result.recommendations.map((item) => item.finding_scope),
  );
  const overlaps =
    scopes.has("overall_pattern") && scopes.has("contributing_category");
  if (result.metadata.overlap_note || overlaps) {
    return NON_ADDITIVE_NOTICE;
  }
  return null;
}

function formatOptionalMoney(amount: number | string | null): string {
  if (amount === null) {
    return "Not determined";
  }
  const formatted = formatCurrency(amount);
  return formatted === "Not available" ? "Not determined" : formatted;
}
