/**
 * Upcoming payments from subscriptions TracePay has actually detected.
 * A payment is listed only when its next expected date is today or later and
 * the subscription has not ended. Nothing is invented: with no recurring
 * history there is simply nothing to list.
 */

import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";

export type UpcomingPayment = {
  id: string;
  name: string;
  /** ISO date the next charge is expected. */
  date: string;
  amount: number;
  /** "high" or "medium": how regular the past charges were. */
  confidence: "high" | "medium";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_UPCOMING = 6;
const MAX_DAYS_AHEAD = 45;

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function selectUpcomingPayments(
  subscriptions: readonly DetectedSubscription[],
  now = new Date(),
): UpcomingPayment[] {
  const today = todayKey(now);
  const horizon = addDaysKey(today, MAX_DAYS_AHEAD);
  const upcoming: UpcomingPayment[] = [];
  for (const subscription of subscriptions) {
    const date = subscription.nextExpectedDate?.slice(0, 10) ?? null;
    if (!date || date < today || date > horizon) continue;
    if (subscription.status === "ended") continue;
    if (subscription.recurrenceStrength !== "high" && subscription.recurrenceStrength !== "medium") {
      continue;
    }
    const amount =
      subscription.currentAmount ?? subscription.typicalAmount ?? subscription.averageAmount;
    if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) continue;
    upcoming.push({
      id: `${subscription.merchantKey}:${subscription.productKey ?? ""}`,
      name: subscription.displayName,
      date,
      amount,
      confidence: subscription.recurrenceStrength,
    });
  }
  return upcoming
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, MAX_UPCOMING);
}

export function formatUpcomingDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
