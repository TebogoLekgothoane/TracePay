import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import { resolveLogoDomainFromMerchantLabel } from "../transactions/merchant-logos";
import { formatRandAmount } from "../../utils/currency";

export type RecurringChargeKind = "subscription" | "debit" | "obligation" | "custom";
export type RecurringChargeCadence = "monthly" | "yearly";
export type RecurringChargeStatus = "Active" | "Inactive";

export type RecurringCharge = {
  id: string;
  name: string;
  kind: RecurringChargeKind;
  category: string;
  billing: string;
  billingDate: string;
  amount: string;
  status: RecurringChargeStatus;
  brandId?: string;
  logoDomain?: string;
  mark: string;
  /** Where tapping the row should go. */
  href?: string;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** A charge repeating about once a year (allowing for a few days either way). */
const YEARLY_INTERVAL_DAYS = 330;
/** Shorter than this (weekly, fortnightly) cannot be placed on a one-day-a-month calendar. */
const MIN_MONTHLY_INTERVAL_DAYS = 20;

export function detectedChargeId(subscription: DetectedSubscription): string {
  return `${subscription.merchantKey}:${subscription.productKey ?? ""}`;
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

/** Day and month (0-11) from an ISO date string, without any time-zone shift. */
function dayAndMonth(iso: string | null | undefined): { day: number; month: number } | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { day, month };
}

export function amountOfDetected(subscription: DetectedSubscription): number {
  const value =
    subscription.currentAmount ??
    subscription.typicalAmount ??
    subscription.latestAmount ??
    subscription.averageAmount;
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

export function cadenceOfDetected(
  subscription: DetectedSubscription,
): RecurringChargeCadence | null {
  const interval = subscription.medianIntervalDays ?? subscription.averageIntervalDays;
  if (interval === null || interval === undefined) return "monthly";
  if (interval >= YEARLY_INTERVAL_DAYS) return "yearly";
  return interval >= MIN_MONTHLY_INTERVAL_DAYS ? "monthly" : null;
}

/**
 * Turn what TracePay detected in the user's statements into calendar rows. Only regular payments
 * that have not ended are kept, and only ones that repeat monthly or yearly, since those are the
 * only ones a monthly calendar can place. Nothing is invented.
 */
export function chargesFromDetected(
  subscriptions: readonly DetectedSubscription[],
): RecurringCharge[] {
  const out: RecurringCharge[] = [];
  for (const subscription of subscriptions) {
    if (subscription.status === "ended") continue;
    if (subscription.recurrenceStrength !== "high" && subscription.recurrenceStrength !== "medium") {
      continue;
    }
    const amount = amountOfDetected(subscription);
    const cadence = cadenceOfDetected(subscription);
    if (amount <= 0 || cadence === null) continue;

    const anchor =
      dayAndMonth(subscription.nextExpectedDate) ??
      dayAndMonth(subscription.lastSuccessfulCharge) ??
      dayAndMonth(subscription.lastObservedDate);
    const day = subscription.expectedDayOfMonth ?? anchor?.day ?? null;
    if (!day || day < 1 || day > 31) continue;

    const billingDate =
      cadence === "yearly"
        ? `${ordinal(day)} of ${MONTH_NAMES[anchor?.month ?? 0]}`
        : `${ordinal(day)} of each month`;
    const id = detectedChargeId(subscription);
    out.push({
      id,
      name: subscription.displayName,
      kind: subscription.source === "recurring_debit_order" ? "debit" : "subscription",
      category: subscription.category?.trim() || "Recurring",
      billing: cadence === "yearly" ? "Billed yearly" : "Billed monthly",
      billingDate,
      amount: formatRandAmount(amount),
      status: "Active",
      logoDomain: resolveLogoDomainFromMerchantLabel(subscription.displayName) ?? undefined,
      mark: (subscription.displayName.trim()[0] ?? "?").toUpperCase(),
      href: `/leak/subscription/${encodeURIComponent(id)}`,
    });
  }
  return out;
}

/** Every recurring charge for the billing calendar: detected ones plus any the user added. */
export function listRecurringCharges(
  detected: readonly DetectedSubscription[],
  extras: readonly RecurringCharge[] = [],
): RecurringCharge[] {
  return [...chargesFromDetected(detected), ...extras];
}

export function cadenceOfCharge(item: RecurringCharge): RecurringChargeCadence {
  return item.billing.toLowerCase().includes("year") ? "yearly" : "monthly";
}

export function kindLabel(kind: RecurringChargeKind): string {
  if (kind === "subscription") return "Subscription";
  if (kind === "debit") return "Debit order";
  if (kind === "custom") return "Added";
  return "Recurring";
}
