import { formatCurrency } from "../leak-intelligence/leak-intelligence.format";
import type {
  DetectedSubscription,
  SubscriptionRecurrenceStrength,
} from "./subscriptions.types";

export function formatSubscriptionSource(source: DetectedSubscription["source"]): string {
  switch (source) {
    case "subscription_category":
      return "Subscription";
    case "recurring_debit_order":
      return "Debit order";
    case "streaming_overlap":
      return "Streaming";
    default:
      return "Recurring";
  }
}

export function formatRecurrenceStrength(
  strength: SubscriptionRecurrenceStrength,
): string {
  switch (strength) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unclear";
  }
}

export function formatIntervalDays(days: number | null): string {
  if (days === null) {
    return "Not available";
  }
  const rounded = Math.round(days);
  if (rounded === 1) {
    return "Every day";
  }
  if (rounded >= 28 && rounded <= 33) {
    return "About monthly";
  }
  if (rounded >= 7 && rounded <= 8) {
    return "About weekly";
  }
  return `About every ${rounded} days`;
}

export function formatObservedRange(
  first: string | null,
  last: string | null,
): string {
  if (first && last) {
    return `${first} → ${last}`;
  }
  if (last) {
    return `Last seen ${last}`;
  }
  if (first) {
    return `First seen ${first}`;
  }
  return "Dates not available";
}

export function formatMonthlyEstimate(amount: number | null): string {
  return amount === null ? "Not available" : formatCurrency(amount);
}

export function formatSubscriptionsSummary(
  count: number,
  monthlyTotal: number,
): string {
  if (count === 0) {
    return "No recurring subscriptions detected yet.";
  }
  const noun = count === 1 ? "subscription" : "subscriptions";
  return `${count} ${noun} · ~${formatCurrency(monthlyTotal)} / month`;
}
