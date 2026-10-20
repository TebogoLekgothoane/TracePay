import {
  isBankBoilerplateLabel,
  isCardPurchaseBoilerplate,
} from "../leak-intelligence/leak-intelligence.format";
import {
  isAppStoreBillingAggregator,
  isImplausiblyFrequentInterval,
  matchesPlausibleRecurringInterval,
} from "./subscriptions.recurrence";
import type { LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import type {
  DetectedSubscription,
  SubscriptionRecurrenceStrength,
  SubscriptionsDebugResult,
} from "./subscriptions.types";

export class SubscriptionsDebugApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SubscriptionsDebugApiError";
    this.status = status;
  }
}

const STREAMING_KEYS =
  /(?:netflix|showmax|dstv|disney|prime video|spotify|apple music|youtube premium|chatgpt|openai chatgpt)/i;
const SAAS_SUBSCRIPTION_KEYS = /(?:chatgpt|openai chatgpt)/i;

export function parseFinancialFeaturesSubscriptions(
  payload: unknown,
): SubscriptionsDebugResult {
  if (!isRecord(payload)) {
    throw new SubscriptionsDebugApiError(
      "Financial features returned an invalid response.",
    );
  }

  const merchants = Array.isArray(payload.merchants) ? payload.merchants : [];
  const backendSubscriptions = Array.isArray(payload.subscriptions)
    ? payload.subscriptions
        .map(subscriptionFromBackendSubscription)
        .filter((item): item is DetectedSubscription => item !== null)
    : [];
  const subscriptions = (Array.isArray(payload.subscriptions)
    ? backendSubscriptions
    : merchants.flatMap((merchant) => {
        const item = subscriptionFromMerchant(merchant);
        return item ? [item] : [];
      }))
    .sort(compareSubscriptions);

  return {
    transactionCount: finiteInt(payload.transaction_count) ?? 0,
    periodStart: optionalDate(payload.date_start),
    periodEnd: optionalDate(payload.date_end),
    subscriptions,
    monthlyTotal: sumMonthly(subscriptions),
  };
}

function subscriptionFromBackendSubscription(
  value: unknown,
): DetectedSubscription | null {
  if (!isRecord(value)) {
    return null;
  }
  const merchantKey = stringValue(value.merchant_key) ?? stringValue(value.merchant_name);
  const displayName = stringValue(value.merchant_name);
  if (!merchantKey || !displayName) {
    return null;
  }
  const amounts = numberArray(value.amount_history);
  const observations = Array.isArray(value.observations) ? value.observations : [];
  const dates = observations
    .map((item) => (isRecord(item) ? optionalDate(item.transaction_date) : null))
    .filter((item): item is string => item !== null)
    .sort();
  const cadence = stringValue(value.cadence);
  const confidence = stringValue(value.confidence);
  const cadenceDays = finiteNumber(value.cadence_days);
  const parsedObservations = observations
    .filter(isRecord)
    .map((item) => ({
      transactionId: stringValue(item.transaction_id) ?? "",
      date: optionalDate(item.transaction_date),
      amount: finiteNumber(item.amount) ?? 0,
      outcome: (stringValue(item.outcome) ?? "successful") as "successful" | "failed" | "fee" | "reversal",
      feeAmount: finiteNumber(item.fee_amount),
      referencedAmount: finiteNumber(item.referenced_amount),
    }));
  return {
    merchantKey,
    productKey: stringValue(value.product_key) ?? merchantKey,
    displayName,
    category: "Subscriptions",
    observationCount: finiteInt(value.successful_transaction_ids instanceof Array
      ? value.successful_transaction_ids.length
      : 0) ?? 0,
    averageAmount: amounts.length > 0 ? amounts.reduce((sum, item) => sum + item, 0) / amounts.length : finiteNumber(value.current_amount),
    typicalAmount: finiteNumber(value.current_amount),
    latestAmount: finiteNumber(value.current_amount),
    observedAmounts: amounts,
    failedPaymentAttemptCount: value.failed_transaction_ids instanceof Array ? value.failed_transaction_ids.length : 0,
    failedPaymentAttemptAmounts: [],
    status: (stringValue(value.status) ?? "active") as DetectedSubscription["status"],
    currentAmount: finiteNumber(value.current_amount),
    amountHistory: amounts,
    expectedDayOfMonth: finiteInt(value.expected_day_of_month),
    lastSuccessfulCharge: optionalDate(value.last_successful_charge),
    nextExpectedDate: optionalDate(value.next_expected_date),
    totalFailureFees: finiteNumber(value.total_failure_fees) ?? 0,
    observations: parsedObservations,
    averageIntervalDays: cadenceDays,
    medianIntervalDays: cadenceDays,
    recurrenceStrength: confidence === "high" ? "high" : confidence === "medium" ? "medium" : "low",
    firstObservedDate: dates[0] ?? null,
    lastObservedDate: dates[dates.length - 1] ?? null,
    monthlyEstimate: finiteNumber(value.estimated_monthly_cost),
    debitOrderCount: 0,
    transactionCount: observations.length,
    source: "subscription_category",
  };
}

/** Fallback when only leak detections are available (e.g. synthetic debug). */
export function subscriptionsFromLeakDetections(
  result: LeakDetectionResult,
): SubscriptionsDebugResult {
  const subscriptions = result.leaks
    .flatMap((leak) => {
      const item = subscriptionFromLeak(leak.leak_type, leak.evidence, leak.title);
      return item ? [item] : [];
    })
    .sort(compareSubscriptions);

  return {
    transactionCount: result.transaction_count,
    periodStart: result.period_start,
    periodEnd: result.period_end,
    subscriptions,
    monthlyTotal: sumMonthly(subscriptions),
  };
}

function subscriptionFromMerchant(value: unknown): DetectedSubscription | null {
  if (!isRecord(value)) {
    return null;
  }

  const merchantKey =
    typeof value.merchant_name === "string" ? value.merchant_name.trim() : "";
  if (!merchantKey || !isReliableMerchantName(merchantKey)) {
    return null;
  }

  const categories = categoryCounts(value.merchant_category_transaction_count);
  const transactionCount = finiteInt(value.merchant_transaction_count) ?? 0;
  const subscriptionTx = categories.Subscriptions ?? 0;
  const debitOrderCount = finiteInt(value.debit_order_transaction_count) ?? 0;
  const merchantRecurrence = isRecord(value.recurrence) ? value.recurrence : {};
  const recurrence = isRecord(value.subscription_recurrence)
    ? value.subscription_recurrence
    : merchantRecurrence;
  const strength = recurrenceStrength(recurrence.recurrence_strength);
  const observationCount = finiteInt(recurrence.observation_count) ?? 0;
  const averageAmount = finiteNumber(recurrence.typical_amount)
    ?? finiteNumber(recurrence.average_amount)
    ?? finiteNumber(value.merchant_average_amount);
  const latestAmount = finiteNumber(recurrence.latest_amount) ?? averageAmount;
  const averageIntervalDays = finiteNumber(recurrence.median_interval_days)
    ?? finiteNumber(recurrence.average_interval_days);
  const dominantCategory = dominantCategoryName(categories);

  const isSubscriptionCategory =
    subscriptionTx >= 2 &&
    transactionCount > 0 &&
    subscriptionTx * 2 >= transactionCount;

  const isStreamingLike =
    STREAMING_KEYS.test(merchantKey) &&
    observationCount >= 2 &&
    (strength === "medium" || strength === "high" || strength === "low");

  const isSaasSubscription =
    SAAS_SUBSCRIPTION_KEYS.test(merchantKey) &&
    subscriptionTx >= 2 &&
    observationCount >= 2 &&
    matchesPlausibleRecurringInterval(averageIntervalDays) &&
    (strength === "medium" || strength === "high");

  const isDebitOrderSubscription =
    !isSubscriptionCategory &&
    debitOrderCount >= 2 &&
    transactionCount > 0 &&
    debitOrderCount * 2 >= transactionCount &&
    observationCount >= 3 &&
    (strength === "medium" || strength === "high");

  if (
    !isSubscriptionCategory &&
    !isStreamingLike &&
    !isSaasSubscription &&
    !isDebitOrderSubscription
  ) {
    return null;
  }

  if (observationCount < 2) {
    return null;
  }

  if (
    !matchesPlausibleRecurringInterval(averageIntervalDays) ||
    isImplausiblyFrequentInterval(averageIntervalDays)
  ) {
    return null;
  }

  // Aggregator labels can combine several app subscriptions, so only keep a
  // clearly monthly cadence. This still allows a two-observation monthly
  // subscription to appear while rejecting frequent Apple/Google charges.
  if (isAppStoreBillingAggregator(merchantKey)) {
    if (
      observationCount < 2 ||
      averageIntervalDays === null ||
      averageIntervalDays < 26 ||
      averageIntervalDays > 35
    ) {
      return null;
    }
  }

  // Two monthly, subscription-categorised observations are enough for this
  // debug inventory to show a service. The backend leak detector remains
  // stricter before creating a user-facing finding, but the debug page should
  // not hide a valid subscription simply because recurrence confidence is not
  // yet high.
  if (isSubscriptionCategory && strength === "none" && observationCount < 2) {
    return null;
  }

  const source: DetectedSubscription["source"] = isSubscriptionCategory
    ? "subscription_category"
    : isSaasSubscription
      ? "subscription_category"
    : isStreamingLike
      ? "streaming_overlap"
      : "recurring_debit_order";

  return {
    merchantKey,
    productKey: merchantKey,
    displayName: titleCaseMerchant(merchantKey),
    category: dominantCategory,
    observationCount,
    averageAmount,
    typicalAmount: finiteNumber(recurrence.typical_amount) ?? averageAmount,
    latestAmount,
    observedAmounts: numberArray(recurrence.observed_amounts),
    failedPaymentAttemptCount: finiteInt(value.failed_payment_attempt_count) ?? 0,
    failedPaymentAttemptAmounts: numberArray(value.failed_payment_attempt_amounts),
    averageIntervalDays,
    medianIntervalDays: finiteNumber(recurrence.median_interval_days),
    recurrenceStrength: strength,
    firstObservedDate: optionalDate(value.merchant_first_transaction_date),
    lastObservedDate: optionalDate(value.merchant_last_transaction_date),
    monthlyEstimate: monthlyFromInterval(averageAmount, averageIntervalDays),
    debitOrderCount,
    transactionCount,
    source,
  };
}

function subscriptionFromLeak(
  leakType: string,
  evidence: Record<string, unknown>,
  title: string,
): DetectedSubscription | null {
  const focus =
    typeof evidence.finding_focus === "string" ? evidence.finding_focus : "";
  const isSubscription =
    leakType === "subscription_leak" ||
    leakType === "duplicate_streaming_leak" ||
    focus === "subscription_review" ||
    focus === "duplicate_streaming_services";
  if (!isSubscription) {
    return null;
  }

  const merchantKey =
    typeof evidence.merchant_key === "string"
      ? evidence.merchant_key.trim()
      : typeof evidence.merchant_display_name === "string"
        ? evidence.merchant_display_name.trim()
        : "";
  const displayName = merchantKey
    ? titleCaseMerchant(merchantKey)
    : title.replace(/\s+subscription.*$/i, "").trim() || "Unidentified subscription";

  const averageAmount =
    finiteNumber(evidence.typical_amount) ??
    finiteNumber(evidence.average_amount) ??
    finiteNumber(evidence.average_payment) ??
    finiteNumber(evidence.combined_monthly_streaming_spend);
  const latestAmount = finiteNumber(evidence.latest_amount) ?? averageAmount;
  const averageIntervalDays = finiteNumber(evidence.median_interval_days)
    ?? finiteNumber(evidence.average_interval_days);

  return {
    merchantKey: merchantKey || displayName,
    productKey: merchantKey || displayName,
    displayName,
    category: "Subscriptions",
    observationCount: finiteInt(evidence.observation_count) ?? 0,
    averageAmount,
    typicalAmount: finiteNumber(evidence.typical_amount) ?? averageAmount,
    latestAmount,
    observedAmounts: numberArray(evidence.observed_amounts),
    failedPaymentAttemptCount: finiteInt(evidence.failed_payment_attempt_count) ?? 0,
    failedPaymentAttemptAmounts: numberArray(evidence.failed_payment_attempt_amounts),
    averageIntervalDays,
    medianIntervalDays: finiteNumber(evidence.median_interval_days),
    recurrenceStrength: recurrenceStrength(evidence.recurrence_strength),
    firstObservedDate: optionalDate(evidence.first_observed_date),
    lastObservedDate: optionalDate(evidence.last_observed_date),
    monthlyEstimate: monthlyFromInterval(averageAmount, averageIntervalDays),
    debitOrderCount: 0,
    transactionCount: finiteInt(evidence.observation_count) ?? 0,
    source:
      leakType === "duplicate_streaming_leak" ||
      focus === "duplicate_streaming_services"
        ? "streaming_overlap"
        : "subscription_category",
  };
}

function monthlyFromInterval(
  averageAmount: number | null,
  averageIntervalDays: number | null,
): number | null {
  if (averageAmount === null || averageAmount < 0) {
    return null;
  }
  if (
    averageIntervalDays === null ||
    averageIntervalDays <= 0 ||
    !matchesPlausibleRecurringInterval(averageIntervalDays)
  ) {
    return null;
  }
  // Convert observed cadence to an approximate monthly outlay.
  return (averageAmount * 30.4375) / averageIntervalDays;
}

function sumMonthly(items: DetectedSubscription[]): number {
  return items.reduce((total, item) => total + (item.monthlyEstimate ?? 0), 0);
}

function compareSubscriptions(a: DetectedSubscription, b: DetectedSubscription): number {
  const amountDelta = (b.monthlyEstimate ?? 0) - (a.monthlyEstimate ?? 0);
  if (amountDelta !== 0) {
    return amountDelta;
  }
  return a.displayName.localeCompare(b.displayName);
}

function categoryCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const count = finiteInt(raw);
    if (count !== null && count > 0) {
      counts[key] = count;
    }
  }
  return counts;
}

function dominantCategoryName(counts: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function recurrenceStrength(value: unknown): SubscriptionRecurrenceStrength {
  if (
    value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  ) {
    return value;
  }
  return "none";
}

function isReliableMerchantName(value: string): boolean {
  if (isCardPurchaseBoilerplate(value) || isBankBoilerplateLabel(value)) {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return false;
  }
  return /[A-Za-z]/.test(value);
}

function titleCaseMerchant(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function optionalDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteInt(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => finiteNumber(item))
    .filter((item): item is number => item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
