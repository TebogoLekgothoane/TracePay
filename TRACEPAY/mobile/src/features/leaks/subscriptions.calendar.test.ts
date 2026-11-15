import assert from "node:assert/strict";

import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import { chargesFromDetected, listRecurringCharges } from "./recurring-charges.catalog";
import { daysUntilLabel, listUpcomingCharges } from "./recurring-upcoming";
import { buildRecurringDetail, findDetectedById } from "./recurring-detail";
import { buildSubscriptionCalendarMonth, shiftCalendarMonth } from "./subscriptions.calendar";

function sub(over: Partial<DetectedSubscription> & { merchantKey: string }): DetectedSubscription {
  return {
    displayName: over.merchantKey,
    category: null,
    observationCount: 6,
    averageAmount: 100,
    typicalAmount: 100,
    latestAmount: 100,
    observedAmounts: [100],
    failedPaymentAttemptCount: 0,
    failedPaymentAttemptAmounts: [],
    averageIntervalDays: 30,
    medianIntervalDays: 30,
    recurrenceStrength: "high",
    firstObservedDate: "2026-05-15",
    lastObservedDate: "2026-10-15",
    monthlyEstimate: 100,
    debitOrderCount: 0,
    transactionCount: 6,
    source: "subscription_category",
    status: "active",
    expectedDayOfMonth: 15,
    lastSuccessfulCharge: "2026-10-15",
    nextExpectedDate: "2026-11-15",
    ...over,
  };
}

const gym = sub({ merchantKey: "gym", displayName: "Virgin Active", amount: undefined } as never);
const netflix = sub({
  merchantKey: "netflix",
  displayName: "Netflix",
  currentAmount: 159,
  expectedDayOfMonth: 8,
  nextExpectedDate: "2026-11-08",
  category: "Entertainment",
  observations: [
    { transactionId: "1", date: "2026-08-08", amount: 159, outcome: "successful", feeAmount: null, referencedAmount: null },
    { transactionId: "2", date: "2026-09-08", amount: 159, outcome: "failed", feeAmount: null, referencedAmount: null },
    { transactionId: "3", date: "2026-10-08", amount: 159, outcome: "successful", feeAmount: null, referencedAmount: null },
  ],
});
const adobe = sub({
  merchantKey: "adobe",
  displayName: "Adobe",
  medianIntervalDays: 365,
  averageIntervalDays: 365,
  expectedDayOfMonth: 3,
  nextExpectedDate: "2027-01-03",
  currentAmount: 519,
});
const ended = sub({ merchantKey: "old", status: "ended" });
const weak = sub({ merchantKey: "weak", recurrenceStrength: "low" });
const weekly = sub({ merchantKey: "weekly", medianIntervalDays: 7, averageIntervalDays: 7 });
const detected = [gym, netflix, adobe, ended, weak, weekly];

// Only regular, current, monthly or yearly payments reach the calendar. No invented charges.
{
  const charges = chargesFromDetected(detected);
  assert.deepEqual(
    charges.map((c) => c.name).sort(),
    ["Adobe", "Netflix", "Virgin Active"],
    "ended, weak and weekly payments are left out",
  );
  assert.equal(chargesFromDetected([]).length, 0);
  const adobeCharge = charges.find((c) => c.name === "Adobe")!;
  assert.equal(adobeCharge.billing, "Billed yearly");
  assert.equal(adobeCharge.billingDate, "3rd of January");
}

{
  const month = buildSubscriptionCalendarMonth(
    2026,
    10,
    new Date(2026, 10, 15),
    listRecurringCharges(detected),
  );
  assert.equal(month.monthLabel, "November");
  assert.equal(month.days.length % 7, 0, "grid fills complete weeks");
  const on = (date: number) =>
    month.days.find((d) => !d.isMuted && d.date === date)!.charges.map((c) => c.name);
  assert.deepEqual(on(8), ["Netflix"], "Netflix sits on its real billing day");
  assert.deepEqual(on(15), ["Virgin Active"]);
  assert.ok(!month.days.some((d) => d.charges.some((c) => c.name === "Adobe")), "yearly charge only in its month");
  assert.equal(month.monthlyTotal, 100 + 159);
  assert.equal(month.chargesCount, 3);
}

{
  const empty = buildSubscriptionCalendarMonth(2026, 10, new Date(2026, 10, 15), []);
  assert.equal(empty.monthlyTotal, 0);
  assert.ok(empty.days.every((d) => d.charges.length === 0), "no recurring payments, empty calendar");
}

{
  const january = buildSubscriptionCalendarMonth(2027, 0, new Date(2026, 10, 15), listRecurringCharges(detected));
  assert.deepEqual(
    january.days.find((d) => !d.isMuted && d.date === 3)!.charges.map((c) => c.name),
    ["Adobe"],
  );
}

// The detail screen reads the same detected payment: real amount, dates and history.
{
  const found = findDetectedById(detected, encodeURIComponent("netflix:"));
  assert.ok(found);
  const detail = buildRecurringDetail(found);
  assert.equal(parseRandAmount(detail.amount), 159, "shows the real charge, however the device prints decimals");
  assert.equal(detail.cancelActionId, "cancel-netflix");
  assert.deepEqual(detail.history, [
    { label: "Aug", amount: 159 },
    { label: "Oct", amount: 159 },
  ], "only successful charges, labelled by month");
  assert.equal(findDetectedById(detected, "nope:"), null);
  assert.equal(buildRecurringDetail(gym).cancelActionId, "cancel", "no own guide, so the general one");
}

{
  assert.deepEqual(shiftCalendarMonth(2026, 11, 1), { year: 2027, month: 0 });
}

// Rand text must survive a format and parse round trip, whichever way the device prints decimals.
{
  assert.equal(parseRandAmount("R159.00"), 159);
  assert.equal(parseRandAmount("R100,00"), 100);
  assert.equal(parseRandAmount("R1,599.50"), 1599.5);
  assert.equal(parseRandAmount("R1 599,50"), 1599.5);
  assert.equal(parseRandAmount("R8,500"), 8500);
  assert.equal(parseRandAmount(formatRandAmount(2150.75)), 2150.75);
}

// Upcoming: the predicted date when still ahead, otherwise the usual day rolled forward.
{
  const now = new Date(2026, 10, 15);
  const stale = sub({ merchantKey: "stale", displayName: "Stale", expectedDayOfMonth: 3, nextExpectedDate: "2026-11-03" });
  const yearly = sub({ merchantKey: "yr", displayName: "Yearly", medianIntervalDays: 365, averageIntervalDays: 365, expectedDayOfMonth: 3, nextExpectedDate: "2026-01-03", lastSuccessfulCharge: "2026-01-03" });
  const upcoming = listUpcomingCharges([netflix, stale, yearly, ended, weekly], now);
  assert.deepEqual(upcoming.map((u) => u.charge.name), ["Stale", "Netflix", "Yearly"].sort((a, b) => {
    const order: Record<string, string> = { Stale: "2026-12-03", Netflix: "2026-12-08", Yearly: "2027-01-03" };
    return order[a]!.localeCompare(order[b]!);
  }));
  assert.equal(upcoming[0].date, "2026-12-03", "a date already past rolls to next month");
  assert.equal(upcoming[0].daysUntil, 18);
  assert.equal(upcoming[2].date, "2027-01-03", "yearly rolls to next year");
  assert.equal(daysUntilLabel(0), "Today");
  assert.equal(daysUntilLabel(1), "Tomorrow");
  assert.equal(daysUntilLabel(5), "In 5 days");
}

console.log("subscriptions.calendar.test.ts: ok");
