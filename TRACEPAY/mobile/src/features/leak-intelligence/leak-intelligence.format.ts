import type { LeakImpactKind } from "./leak-intelligence.types";

const currencyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EVIDENCE_LABELS: Record<string, string> = {
  previous_amount: "Previous monthly baseline",
  current_amount: "Current month",
  change_amount: "Change",
  change_percentage: "Change percentage",
  monthly_average_fee: "Average monthly fees",
  bank_fee_transaction_count: "Fee transactions",
  bank_fee_ratio: "Fee share of spending",
  fee_change_amount: "Fee increase",
  observation_count: "Observations",
  average_interval_days: "Average interval",
  average_amount: "Average payment",
  recurrence_strength: "Recurrence strength",
  category_name: "Category",
  category_transaction_count: "Category transactions",
  cash_withdrawal_count: "Cash withdrawals",
  cash_withdrawal_total: "Cash withdrawal total",
  atm_fee_total: "ATM fee total",
  candidate_amount: "Potential duplicate amount",
  transaction_count_in_group: "Transactions in group",
  date_span_days: "Date span",
  verification_required: "Verification required",
  transaction_amount: "Actual transaction amount",
  merchant_display_name: "Merchant",
  original_description: "Statement description",
  transaction_date: "Transaction date",
  transaction_time: "Transaction time",
  transaction_type: "Transaction type",
  baseline_sample_size: "Baseline sample size",
  category_median_amount: "Baseline median amount",
  difference_from_baseline: "Difference from baseline",
  amount_multiple_of_category_median: "Amount / baseline median",
  outlier_rule: "Outlier rule",
  confidence_basis: "Confidence basis",
  confidence_is_calibrated: "Confidence calibrated",
  transaction_id: "Internal transaction reference",
  first_observed_date: "First observed",
  last_observed_date: "Last observed",
  billing_date_shift_days: "Billing date shift",
  amount_variance: "Amount variance",
  recurring_debit_order_count: "Recurring debit-order collections",
  recurring_debit_order_months: "Recurring debit-order months",
  active_streaming_service_count: "Active streaming services",
  combined_monthly_streaming_spend: "Combined monthly streaming spend",
  overlapping_month_count: "Overlapping billing months",
  coffee_transaction_count: "Coffee transactions",
  coffee_total_amount: "Total coffee spend",
  monthly_coffee_spend: "Average monthly coffee spend",
  convenience_store_transaction_count: "Convenience-store visits",
  convenience_store_total_amount: "Total convenience-store spend",
  monthly_convenience_spend: "Average monthly convenience-store spend",
  discretionary_weekend_total: "Discretionary weekend spend",
  discretionary_weekday_total: "Discretionary weekday spend",
  discretionary_weekend_daily_average: "Discretionary weekend daily average",
  discretionary_weekday_daily_average: "Discretionary weekday daily average",
  active_weekend_count: "Active weekends",
  salary_event_count: "Salary events",
  salary_cycles_with_discretionary_spike: "Pay cycles with post-payday spike",
  post_salary_discretionary_total: "Post-payday discretionary spend",
  post_salary_essential_total: "Post-payday essential obligations",
  post_salary_discretionary_transaction_count: "Post-payday discretionary transactions",
};

const CURRENCY_KEYS = new Set([
  "previous_amount",
  "current_amount",
  "change_amount",
  "monthly_average_fee",
  "fee_change_amount",
  "average_amount",
  "cash_withdrawal_total",
  "atm_fee_total",
  "candidate_amount",
  "transaction_amount",
  "category_median_amount",
  "difference_from_baseline",
  "amount_variance",
  "combined_monthly_streaming_spend",
  "coffee_total_amount",
  "monthly_coffee_spend",
  "convenience_store_total_amount",
  "monthly_convenience_spend",
  "discretionary_weekend_total",
  "discretionary_weekday_total",
  "discretionary_weekend_daily_average",
  "discretionary_weekday_daily_average",
  "post_salary_discretionary_total",
  "post_salary_essential_total",
]);

const PERCENT_KEYS = new Set([
  "change_percentage",
  "bank_fee_ratio",
]);

const SENSITIVE_EVIDENCE_KEYS = /(?:account|card|phone|reference|description|transaction_id|merchant_key|merchant_display_name|subject|token|fingerprint)/i;

const CARD_PURCHASE_BOILERPLATE = /^(?:purchase\s+)?with\s+card\s+at(?:\s+epos(?:\s+at)?)?$/i;
const BANK_BOILERPLATE_LABEL =
  /^(?:purchase\s+)?with\s+card\s+at(?:\s+epos(?:\s+at)?)?$|^(?:recurring\s+payment(?:\s+from)?|money\s+transferred(?:\s+(?:in|out))?(?:\s+(?:for|from))?)(?:\s+\w{1,2})?$/i;

export const DUPLICATE_MATCH_DISCLAIMER =
  "These transactions match on merchant, amount, and date. This is not a confirmed duplicate and not a guaranteed recovery.";

export const RECOGNISED_LEAK_CATEGORIES = [
  "groceries",
  "shopping",
  "transport",
  "fuel",
  "airtime & data",
  "airtime",
  "subscriptions",
  "internal transfer",
  "transfer",
  "dining",
  "food",
  "restaurants",
  "fast food",
  "ride hailing",
  "public transport",
] as const;

export type EvidenceRow = {
  label: string;
  value: string;
};

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrency(value: unknown): string {
  const amount = finiteNumber(value);
  return amount === null ? "Not available" : currencyFormatter.format(amount);
}

export function formatConfidence(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function formatImpactKind(value: LeakImpactKind): string {
  switch (value) {
    case "recurring":
      return "Recurring";
    case "one_time":
      return "One-time";
    default:
      return "Estimated";
  }
}

/** Primary impact row label — one-time findings are not monthly. */
export function formatPrimaryImpactLabel(impactKind: LeakImpactKind): string {
  return impactKind === "one_time" ? "Potential amount" : "Monthly impact";
}

/** Share ratios from the API are fractions (0–1); percentages may also appear in behaviour evidence. */
export function formatPercentValue(value: unknown, key?: string): string {
  const numeric = finiteNumber(value);
  if (numeric === null) {
    return "Not available";
  }
  const asPercent =
    key === "bank_fee_ratio" || (key !== "change_percentage" && numeric >= 0 && numeric <= 1)
      ? numeric * 100
      : numeric;
  return `${asPercent.toFixed(2)}%`;
}

export function formatEvidence(evidence: Record<string, unknown>): EvidenceRow[] {
  return Object.entries(evidence)
    .filter(
      ([key, value]) =>
        key in EVIDENCE_LABELS &&
        !SENSITIVE_EVIDENCE_KEYS.test(key) &&
        value !== null &&
        value !== undefined,
    )
    .map(([key, value]) => ({
      label: EVIDENCE_LABELS[key] ?? key,
      value: formatEvidenceValue(key, value),
    }));
}

function formatEvidenceValue(key: string, value: unknown): string {
  if (CURRENCY_KEYS.has(key)) {
    return formatCurrency(value);
  }
  if (PERCENT_KEYS.has(key)) {
    if (key === "change_percentage") {
      const numeric = finiteNumber(value);
      if (numeric === null) {
        return "Not available";
      }
      return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}%`;
    }
    return formatPercentValue(value, key);
  }
  if (
    key === "average_interval_days" ||
    key === "date_span_days" ||
    key === "billing_date_shift_days"
  ) {
    const numeric = finiteNumber(value);
    return numeric === null ? "Not available" : `${numeric.toFixed(0)} days`;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return "Available";
}

export function isCardPurchaseBoilerplate(value: string): boolean {
  return CARD_PURCHASE_BOILERPLATE.test(value.trim());
}

export function isBankBoilerplateLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return BANK_BOILERPLATE_LABEL.test(trimmed);
}

export function merchantDisplayName(evidence: Record<string, unknown>): string | null {
  const value = evidence.merchant_display_name;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || isCardPurchaseBoilerplate(trimmed) || isBankBoilerplateLabel(trimmed)) {
    return null;
  }
  return trimmed;
}

export function recognisedCategoryKey(category: string | null | undefined): string | null {
  const key = category?.trim().toLowerCase() ?? "";
  return (RECOGNISED_LEAK_CATEGORIES as readonly string[]).includes(key) ? key : null;
}

export function formatDuplicateFinding(leak: {
  evidence: Record<string, unknown>;
  estimated_monthly_impact: number | string;
}): { rows: EvidenceRow[]; disclaimer: string } {
  const { evidence } = leak;
  const rows: EvidenceRow[] = [];
  const merchant = merchantDisplayName(evidence);
  if (merchant) {
    rows.push({ label: "Merchant", value: merchant });
  }
  if (typeof evidence.observed_date === "string" && evidence.observed_date.trim()) {
    rows.push({ label: "Transaction date", value: evidence.observed_date });
  }
  if (
    typeof evidence.transaction_count_in_group === "number" ||
    typeof evidence.transaction_count_in_group === "string"
  ) {
    rows.push({
      label: "Matching transactions",
      value: String(evidence.transaction_count_in_group),
    });
  }
  rows.push({
    label: "Amount per transaction",
    value: formatCurrency(evidence.candidate_amount),
  });
  rows.push({
    label: "Candidate amount",
    value: formatCurrency(leak.estimated_monthly_impact),
  });
  return { rows, disclaimer: DUPLICATE_MATCH_DISCLAIMER };
}

export function formatFindingEvidence(
  leakType: string,
  evidence: Record<string, unknown>,
): EvidenceRow[] {
  const rows = formatEvidence(evidence);
  const merchant = merchantDisplayName(evidence);
  if (
    leakType === "duplicate_payment_leak" ||
    leakType === "duplicate_debit_order_leak" ||
    !merchant
  ) {
    return rows;
  }
  return [{ label: "Merchant", value: merchant }, ...rows];
}

export function formatIrregularFinding(evidence: Record<string, unknown>): EvidenceRow[] {
  const safeKeys = [
    "merchant_display_name",
    "transaction_amount",
    "transaction_date",
    "transaction_time",
    "original_description",
    "category_name",
    "transaction_type",
    "category_transaction_count",
    "baseline_sample_size",
    "category_median_amount",
    "difference_from_baseline",
    "amount_multiple_of_category_median",
    "outlier_rule",
    "confidence_basis",
    "confidence_is_calibrated",
    "verification_required",
  ];
  return safeKeys.flatMap((key) => {
    const value = evidence[key];
    if (value === null || value === undefined || value === "") {
      if (key === "merchant_display_name") return [{ label: "Merchant", value: "Unknown merchant" }];
      if (key === "transaction_time") return [{ label: "Transaction time", value: "Time not available" }];
      return [];
    }
    return [{ label: EVIDENCE_LABELS[key] ?? key, value: formatEvidenceValue(key, value) }];
  });
}
