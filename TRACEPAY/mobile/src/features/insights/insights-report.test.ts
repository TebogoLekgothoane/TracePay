import { periodDateRange } from "./category-breakdown";
import {
  buildInsightsReport,
  comparisonCopy,
  formatChange,
  formatPeakDay,
  previousPeriodRange,
} from "./insights-report";
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

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

// 25 Oct 2026, "This month" = 1–25 Oct; the 25 days before are 6–30 Sep.
const range = periodDateRange("This month", "Last 14 days", new Date(2026, 9, 25));

test("the comparison period is the equal-length period just before", () => {
  const previous = previousPeriodRange(range);
  assertEqual(previous.days, 25, "length");
  assertEqual(previous.startKey, "2026-09-06", "start");
  assertEqual(previous.endKey, "2026-09-30", "end");
  const crossYear = previousPeriodRange({ startKey: "2026-01-01", endKey: "2026-01-10" });
  assertEqual(crossYear.startKey, "2025-12-22", "crosses the year");
});

test("totals, daily average and highest day come from the rows", () => {
  const report = buildInsightsReport(
    [
      row("2026-10-03", "100"),
      row("2026-10-03", "50"),
      row("2026-10-12", "400"),
      row("2026-10-20", "250"),
      row("2026-09-10", "300"),
      row("2026-09-20", "100", { is_duplicate: true }),
      row("2026-10-05", "9000", { transaction_class: "internal_transfer" }),
    ],
    "Spending",
    range,
    "By week",
  );
  assertEqual(report.total, 800, "total");
  assertEqual(report.previousTotal, 300, "previous total");
  assertEqual(Math.round(report.changePercent ?? 0), 167, "change");
  assertEqual(report.dailyAverage, 32, "800 over 25 days");
  assertEqual(report.peakDay?.dateKey, "2026-10-12", "peak day");
  assertEqual(report.peakDay?.amount, 400, "peak amount");
  assertEqual(formatPeakDay(report.peakDay, (value) => `R${value}`), "12 Oct • R400", "peak label");
});

test("with nothing earlier there is no invented comparison", () => {
  const report = buildInsightsReport([row("2026-10-03", "100")], "Spending", range, "By week");
  assertEqual(report.changePercent, null, "no percent");
  assertEqual(formatChange(report), "No earlier period to compare", "label");
});

test("a rise and a fall are labelled with the right arrow and span", () => {
  const up = buildInsightsReport([row("2026-10-03", "200"), row("2026-09-10", "100")], "Spending", range, "By week");
  assertEqual(formatChange(up), "↑ 100% vs the previous 25 days", "up");
  const down = buildInsightsReport([row("2026-10-03", "50"), row("2026-09-10", "100")], "Spending", range, "By week");
  assertEqual(formatChange(down), "↓ 50% vs the previous 25 days", "down");
  assertEqual(comparisonCopy(up), "These 25 days vs the 25 days before", "copy");
});

test("income excludes refunds and spending nets them off", () => {
  const rows = [
    row("2026-10-02", "20000", { type: "credit", transaction_class: "income", description: "SALARY" }),
    row("2026-10-04", "1000"),
    row("2026-10-06", "300", { type: "credit", description: "SHOP REFUND" }),
  ];
  assertEqual(buildInsightsReport(rows, "Income", range, "By week").total, 20000, "income");
  assertEqual(buildInsightsReport(rows, "Spending", range, "By week").total, 700, "net spending");
});

test("weekly trend buckets pair each week with the same week one period earlier", () => {
  const report = buildInsightsReport(
    [row("2026-10-02", "100"), row("2026-10-09", "200"), row("2026-09-08", "40")],
    "Spending",
    range,
    "By week",
  );
  assertEqual(report.trend.length, 4, "1–7, 8–14, 15–21, 22–25 Oct");
  assertEqual(report.trend[0]?.label, "1 Oct", "label");
  assertEqual(report.trend[0]?.current, 100, "week 1");
  assertEqual(report.trend[1]?.current, 200, "week 2");
  // 8 Sep is 25 days before 3 Oct, which falls in week 1.
  assertEqual(report.trend[0]?.previous, 40, "week 1 previous");
});

test("monthly and daily grains cover the right days", () => {
  const monthly = buildInsightsReport(
    [row("2026-08-20", "10"), row("2026-09-10", "20"), row("2026-10-10", "30")],
    "Spending",
    periodDateRange("3 months", "Last 14 days", new Date(2026, 9, 25)),
    "By month",
  );
  assertEqual(monthly.trend.map((point) => point.label).join(","), "Aug,Sep,Oct", "months");
  assertEqual(monthly.trend.map((point) => point.current).join(","), "10,20,30", "month totals");
  const daily = buildInsightsReport([row("2026-10-25", "70")], "Spending", range, "By day");
  assertEqual(daily.trend.length, 14, "last 14 days");
  assertEqual(daily.trend[13]?.current, 70, "newest day last");
});

test("an empty period gives zeros, not demo numbers", () => {
  const report = buildInsightsReport([], "Spending", range, "By week");
  assertEqual(report.total, 0, "total");
  assertEqual(report.peakDay, null, "no peak");
  assertEqual(report.sparkline.every((value) => value === 0), true, "flat sparkline");
});

test("long periods are summed into a bounded sparkline", () => {
  const report = buildInsightsReport(
    [row("2026-03-01", "10")],
    "Spending",
    periodDateRange("Custom", "Year to date", new Date(2026, 9, 25)),
    "By month",
  );
  assertEqual(report.sparkline.length <= 30, true, "at most 30 points");
  assertEqual(report.sparkline.reduce((sum, value) => sum + value, 0), 10, "nothing lost");
});

console.log("insights-report tests passed");
