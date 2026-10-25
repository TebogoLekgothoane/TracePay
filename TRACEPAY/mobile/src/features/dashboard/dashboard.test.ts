import {
  buildSpendingRhythm,
  formatAxisAmount,
  niceAxisMax,
  rhythmStartKey,
} from "./spending-rhythm";
import { formatUpcomingDate, selectUpcomingPayments } from "./upcoming-payments";
import type { DetectedSubscription } from "../subscriptions-debug/subscriptions.types";
import type { TransactionRow } from "../transactions/transaction.types";

function row(date: string, amount: string, overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: `${date}-${amount}-${Math.random()}`,
    date,
    description: "Payment",
    amount,
    type: "debit",
    balance: null,
    currency: "ZAR",
    account_id: "account",
    statement_id: null,
    source: "statement",
    transaction_class: "spending",
    is_duplicate: false,
    category_id: null,
    category_source: "automatic",
    merchantName: null,
    categories: { name: "Groceries" },
    account: null,
    occurredAt: null,
    ...overrides,
  };
}

function sub(overrides: Partial<DetectedSubscription>): DetectedSubscription {
  return {
    merchantKey: "netflix",
    displayName: "Netflix",
    category: "Subscriptions",
    observationCount: 6,
    averageAmount: 199,
    typicalAmount: 199,
    latestAmount: 199,
    observedAmounts: [199],
    failedPaymentAttemptCount: 0,
    failedPaymentAttemptAmounts: [],
    averageIntervalDays: 30,
    medianIntervalDays: 30,
    recurrenceStrength: "high",
    firstObservedDate: "2026-04-01",
    lastObservedDate: "2026-09-01",
    monthlyEstimate: 199,
    debitOrderCount: 6,
    transactionCount: 6,
    source: "subscription_category",
    status: "active",
    nextExpectedDate: "2026-10-30",
    ...overrides,
  };
}

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

const REFERENCE = new Date(2026, 9, 15); // 15 Oct 2026

test("rhythm has one point per month, each beside the same month a span earlier", () => {
  const rhythm = buildSpendingRhythm(
    [
      row("2026-10-03", "300"),
      row("2026-09-10", "500"),
      row("2026-04-20", "100"), // 6 months before October
      row("2025-10-05", "70"), // 12 months before
    ],
    "6 months",
    REFERENCE,
  );
  assertEqual(rhythm.points.length, 6, "six months");
  assertEqual(rhythm.points.map((point) => point.label).join(","), "May,Jun,Jul,Aug,Sep,Oct", "labels");
  assertEqual(rhythm.points[5]?.current, 300, "October");
  assertEqual(rhythm.points[4]?.current, 500, "September");
  assertEqual(rhythm.points[5]?.previous, 100, "October compares with April");
  assertEqual(rhythm.points[0]?.previous, 0, "no earlier data is zero, not invented");
});

test("12 months reaches back across the year boundary", () => {
  const rhythm = buildSpendingRhythm([row("2025-12-12", "40")], "12 months", new Date(2026, 1, 10));
  assertEqual(rhythm.points[0]?.label, "Mar", "first month");
  assertEqual(rhythm.points[11]?.label, "Feb", "last month");
  assertEqual(rhythm.points.find((point) => point.monthKey === "2025-12")?.current, 40, "December 2025");
});

test("duplicates, own-account transfers and income never count; refunds net off", () => {
  const rhythm = buildSpendingRhythm(
    [
      row("2026-10-03", "300"),
      row("2026-10-03", "900", { is_duplicate: true }),
      row("2026-10-04", "5000", { transaction_class: "internal_transfer" }),
      row("2026-10-05", "20000", { type: "credit", transaction_class: "income", description: "SALARY" }),
      row("2026-10-06", "100", { type: "credit", description: "SHOP REFUND" }),
    ],
    "3 months",
    REFERENCE,
  );
  assertEqual(rhythm.points[2]?.current, 200, "300 minus the 100 refund");
});

test("month-to-date compares the same days of last month", () => {
  const rhythm = buildSpendingRhythm(
    [
      row("2026-10-02", "100"),
      row("2026-10-14", "200"),
      row("2026-09-05", "250"),
      row("2026-09-15", "10"),
      row("2026-09-20", "9999"), // after day 15: must not count
    ],
    "6 months",
    REFERENCE,
  );
  assertEqual(rhythm.comparison.monthToDate, 300, "this month so far");
  assertEqual(rhythm.comparison.previousMonthToDate, 260, "same days last month");
  assertEqual(rhythm.comparison.difference, 40, "difference");
  assertEqual(Math.round(rhythm.comparison.changePercent ?? 0), 15, "percent");
});

test("no earlier month means no percentage", () => {
  const rhythm = buildSpendingRhythm([row("2026-10-02", "100")], "6 months", REFERENCE);
  assertEqual(rhythm.comparison.changePercent, null, "null");
});

test("the loaded window covers the span plus the span before", () => {
  assertEqual(rhythmStartKey("6 months", REFERENCE), "2025-11-01", "6 + 6 months back");
  assertEqual(rhythmStartKey("3 months", REFERENCE), "2026-05-01", "3 + 3 months back");
});

test("the axis rounds up to clean numbers", () => {
  assertEqual(niceAxisMax(0), 1000, "empty");
  assertEqual(niceAxisMax(5860), 10000, "5860 -> 10K");
  assertEqual(niceAxisMax(1900), 2000, "1900 -> 2K");
  assertEqual(niceAxisMax(2300), 2500, "2300 -> 2.5K");
  assertEqual(formatAxisAmount(2500), "R2.5K", "label");
  assertEqual(formatAxisAmount(10000), "R10K", "label");
  assertEqual(formatAxisAmount(0), "R0", "zero");
});

test("only future, active, regular subscriptions are listed, soonest first", () => {
  const now = new Date(2026, 9, 15);
  const upcoming = selectUpcomingPayments(
    [
      sub({ merchantKey: "later", displayName: "Later", nextExpectedDate: "2026-11-20" }),
      sub({ merchantKey: "soon", displayName: "Soon", nextExpectedDate: "2026-10-16", currentAmount: 69 }),
      sub({ merchantKey: "past", displayName: "Past", nextExpectedDate: "2026-10-10" }),
      sub({ merchantKey: "ended", displayName: "Ended", status: "ended", nextExpectedDate: "2026-10-20" }),
      sub({ merchantKey: "weak", displayName: "Weak", recurrenceStrength: "low", nextExpectedDate: "2026-10-20" }),
      sub({ merchantKey: "none", displayName: "None", nextExpectedDate: null }),
      sub({ merchantKey: "far", displayName: "Far", nextExpectedDate: "2027-03-01" }),
      sub({ merchantKey: "free", displayName: "Free", typicalAmount: null, averageAmount: null, currentAmount: null, nextExpectedDate: "2026-10-18" }),
    ],
    now,
  );
  assertEqual(upcoming.map((item) => item.name).join(","), "Soon,Later", "order and filtering");
  assertEqual(upcoming[0]?.amount, 69, "current amount wins");
  assertEqual(formatUpcomingDate("2026-10-16"), "16 Oct 2026", "date label");
});

test("today counts as upcoming and nothing detected gives an empty list", () => {
  const now = new Date(2026, 9, 15);
  assertEqual(selectUpcomingPayments([sub({ nextExpectedDate: "2026-10-15" })], now).length, 1, "today");
  assertEqual(selectUpcomingPayments([], now).length, 0, "empty");
});

console.log("dashboard tests passed");
