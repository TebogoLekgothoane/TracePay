import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import { cadenceOfDetected, chargesFromDetected, type RecurringCharge } from "./recurring-charges.catalog";

export type UpcomingCharge = {
  charge: RecurringCharge;
  /** ISO date (yyyy-mm-dd) of the next expected charge. */
  date: string;
  daysUntil: number;
};

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parts(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

/** Same day next month or year, kept inside shorter months (31st becomes the 30th or 28th). */
function clamp(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
}

/**
 * The next time this payment is expected. Uses the date TracePay predicted when it is still ahead,
 * otherwise rolls the usual billing day forward by a month (or a year for yearly payments).
 */
function nextDate(subscription: DetectedSubscription, today: Date): Date | null {
  const predicted = parts(subscription.nextExpectedDate);
  if (predicted) {
    const date = new Date(predicted.y, predicted.m, predicted.d);
    if (date >= today) return date;
  }
  const anchor =
    predicted ?? parts(subscription.lastSuccessfulCharge) ?? parts(subscription.lastObservedDate);
  const day = subscription.expectedDayOfMonth ?? anchor?.d;
  if (!day) return null;
  if (cadenceOfDetected(subscription) === "yearly") {
    if (!anchor) return null;
    const thisYear = clamp(today.getFullYear(), anchor.m, day);
    return thisYear >= today ? thisYear : clamp(today.getFullYear() + 1, anchor.m, day);
  }
  const thisMonth = clamp(today.getFullYear(), today.getMonth(), day);
  return thisMonth >= today ? thisMonth : clamp(today.getFullYear(), today.getMonth() + 1, day);
}

/** Detected recurring payments with their next expected charge, soonest first. */
export function listUpcomingCharges(
  detected: readonly DetectedSubscription[],
  now = new Date(),
): UpcomingCharge[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: UpcomingCharge[] = [];
  for (const subscription of detected) {
    const charge = chargesFromDetected([subscription])[0];
    if (!charge) continue;
    const date = nextDate(subscription, today);
    if (!date) continue;
    out.push({
      charge,
      date: iso(date),
      daysUntil: Math.round((date.getTime() - today.getTime()) / 86_400_000),
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.charge.name.localeCompare(b.charge.name),
  );
}

export function daysUntilLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
