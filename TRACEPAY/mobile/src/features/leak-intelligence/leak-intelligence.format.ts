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
  first_observed_date: "First observed",
  last_observed_date: "Last observed",
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
]);

const PERCENT_KEYS = new Set([
  "change_percentage",
  "bank_fee_ratio",
]);

const SENSITIVE_EVIDENCE_KEYS = /(?:account|card|phone|reference|description|transaction_id|merchant_key|subject|token|fingerprint)/i;

const CARD_PURCHASE_BOILERPLATE = /^(?:purchase\s+)?with\s+card\s+at(?:\s+epos(?:\s+at)?)?$/i;

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
  if (key === "average_interval_days" || key === "date_span_days") {
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

export function merchantDisplayName(evidence: Record<string, unknown>): string | null {
  const value = evidence.merchant_display_name;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || isCardPurchaseBoilerplate(trimmed)) {
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
  if (leakType === "duplicate_payment_leak" || !merchant) {
    return rows;
  }
  return [{ label: "Merchant", value: merchant }, ...rows];
}
