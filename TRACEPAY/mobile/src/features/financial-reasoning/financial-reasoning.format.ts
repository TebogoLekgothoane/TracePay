import {
  formatConfidence,
  formatCurrency,
  formatImpactKind,
  formatPercentValue,
  type EvidenceRow,
} from "../leak-intelligence/leak-intelligence.format";
import type {
  Avoidability,
  FinancialReasoning,
  Persistence,
  RootCauseType,
} from "./financial-reasoning.types";
import type { LeakImpactKind } from "../leak-intelligence/leak-intelligence.types";

export {
  formatConfidence,
  formatCurrency,
  formatImpactKind,
};

const EVIDENCE_LABELS: Record<string, string> = {
  previous_total: "Previous monthly amount",
  current_total: "Current month",
  absolute_change: "Change",
  percentage_change: "Change percentage",
  previous_transaction_count: "Previous transaction count",
  current_transaction_count: "Current transaction count",
  previous_average_transaction_amount: "Previous average amount",
  current_average_transaction_amount: "Current average amount",
  transaction_count_change_percentage: "Transaction count change",
  average_amount_change_percentage: "Average amount change",
  frequency_contribution_share: "Frequency contribution share",
  amount_contribution_share: "Amount contribution share",
  category: "Category",
  observation_count: "Observations",
  average_interval_days: "Average interval",
  average_payment: "Average payment",
  recurrence_strength: "Recurrence strength",
  first_observed_date: "First observed",
  last_observed_date: "Last observed",
  duration_days: "Duration (days)",
  fee_transaction_count: "Fee transactions",
  fee_total: "Fee total",
  average_fee: "Average fee",
  monthly_average_fee: "Average monthly fees",
  potential_duplicate_amount: "Potential duplicate amount",
  matching_transaction_count: "Matching transactions",
  date_span_days: "Date span",
  verification_required: "Verification required",
  merchant_amount_change_percentage: "Merchant amount change",
  merchant_frequency_stable: "Merchant frequency stable",
};

const CURRENCY_KEYS = new Set([
  "previous_total",
  "current_total",
  "absolute_change",
  "average_fee",
  "fee_total",
  "monthly_average_fee",
  "average_payment",
  "potential_duplicate_amount",
  "merchant_previous_average_amount",
  "merchant_latest_amount",
  "previous_average_transaction_amount",
  "current_average_transaction_amount",
]);

const PERCENT_KEYS = new Set([
  "percentage_change",
  "transaction_count_change_percentage",
  "average_amount_change_percentage",
  "frequency_contribution_share",
  "amount_contribution_share",
  "merchant_amount_change_percentage",
  "contributing_merchant_share",
]);

const SENSITIVE_EVIDENCE_KEYS =
  /(?:account|card|phone|reference|description|transaction_id|merchant_key|subject|token|fingerprint|identified_fee_subtypes)/i;

export function formatRootCauseType(value: RootCauseType): string {
  const labels: Record<RootCauseType, string> = {
    frequency_increase: "Frequency increase",
    amount_increase: "Amount increase",
    price_increase: "Average transaction value increase",
    recurring_commitment: "Recurring commitment",
    fee_accumulation: "Fee accumulation",
    potential_duplicate: "Potential duplicate payment",
    behavioural_concentration: "Behavioural concentration",
    merchant_concentration: "Merchant concentration",
    category_growth: "Category growth",
    transaction_pattern: "Combined transaction pattern",
    insufficient_evidence: "Insufficient evidence",
    unknown: "Unknown",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function formatPersistence(value: Persistence): string {
  const labels: Record<Persistence, string> = {
    new: "New",
    temporary: "Temporary",
    persistent: "Persistent",
    increasing: "Increasing",
    declining: "Declining",
    insufficient_history: "Insufficient history",
  };
  return labels[value];
}

export function formatAvoidabilitySummary(value: Avoidability): string {
  switch (value) {
    case "high":
      return "Potentially avoidable";
    case "medium":
      return "Potentially reducible";
    case "low":
      return "Low evidence of avoidability";
    default:
      return "Avoidability not determined";
  }
}

export function formatAvoidableAmount(
  amount: number | string | null | undefined,
): string {
  if (amount === null || amount === undefined) {
    return "Not determined";
  }
  const formatted = formatCurrency(amount);
  return formatted === "Not available" ? "Not determined" : formatted;
}

export function formatReasoningEvidence(
  evidence: Record<string, unknown>,
): EvidenceRow[] {
  return Object.entries(evidence)
    .filter(
      ([key, value]) =>
        key in EVIDENCE_LABELS &&
        !SENSITIVE_EVIDENCE_KEYS.test(key) &&
        value !== null &&
        value !== undefined &&
        typeof value !== "object",
    )
    .map(([key, value]) => ({
      label: EVIDENCE_LABELS[key] ?? key,
      value: formatReasoningEvidenceValue(key, value),
    }));
}

function formatReasoningEvidenceValue(key: string, value: unknown): string {
  if (CURRENCY_KEYS.has(key)) {
    return formatCurrency(value);
  }
  if (PERCENT_KEYS.has(key)) {
    if (
      key === "frequency_contribution_share" ||
      key === "amount_contribution_share" ||
      key === "contributing_merchant_share"
    ) {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(numeric)) {
        return "Not available";
      }
      return `${(numeric * 100).toFixed(1)}%`;
    }
    if (key === "percentage_change") {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(numeric)) {
        return "Not available";
      }
      return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
    }
    return formatPercentValue(value, key);
  }
  if (key === "average_interval_days" || key === "date_span_days") {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(numeric) ? `${Math.round(numeric)} days` : "Not available";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return "Available";
}

export function isVerificationRequired(analysis: FinancialReasoning): boolean {
  return (
    analysis.analysis_status === "verification_required" ||
    analysis.root_cause_type === "potential_duplicate" ||
    analysis.evidence.verification_required === true
  );
}

export function detectedImpactPeriodLabel(impactKind: LeakImpactKind): string {
  return impactKind === "one_time" ? "one time" : "month";
}

const SPENDING_ESCALATION_ROOT_CAUSES = new Set<RootCauseType>([
  "frequency_increase",
  "amount_increase",
  "price_increase",
  "transaction_pattern",
  "category_growth",
]);

/** Spending escalation analyses describe baseline-relative increases, not confirmed loss. */
export function isSpendingEscalationAnalysis(analysis: FinancialReasoning): boolean {
  return SPENDING_ESCALATION_ROOT_CAUSES.has(analysis.root_cause_type);
}

export function formatDetectedAmountHeading(analysis: FinancialReasoning): string {
  return isSpendingEscalationAnalysis(analysis)
    ? "Detected increase"
    : "Detected impact";
}

export function formatMonthlyAmountMetricLabel(analysis: FinancialReasoning): string {
  return isSpendingEscalationAnalysis(analysis)
    ? "Monthly increase"
    : "Monthly impact";
}

export function formatAnnualAmountMetricLabel(persistence: Persistence): string {
  if (persistence === "temporary") {
    return "Annualised if this pattern continues";
  }
  return "Annual impact";
}
