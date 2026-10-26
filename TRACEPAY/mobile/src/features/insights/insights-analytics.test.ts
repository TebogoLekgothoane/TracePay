import assert from "node:assert/strict";

import type { TransactionRow } from "../transactions/transaction.types";
import {
  buildCashFlow,
  buildCategoryMovement,
  buildHighlights,
  buildSpendingDrivers,
  buildLargestPayments,
  buildSpendingCalendar,
  buildSpendingPace,
  buildTopMerchants,
  buildWeekdayAverages,
} from "./insights-analytics";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "tx",
    date: "2026-10-10",
    description: "Payment",
    amount: "100",
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

// Period: 1–10 Oct 2026. Previous equal period: 21–30 Sep 2026.
const range = { startKey: "2026-10-01", endKey: "2026-10-10" };

const rows = [
  row({ id: "a", date: "2026-10-02", amount: "300", merchantName: "Checkers" }),
  row({ id: "b", date: "2026-10-04", amount: "200", merchantName: "Checkers" }),
  row({ id: "c", date: "2026-10-09", amount: "550", categories: { name: "Transport" }, description: "Uber trip" }),
  row({ id: "pay", date: "2026-10-01", amount: "5000", type: "credit", description: "Salary", categories: { name: "Income" } }),
  row({ id: "dup", date: "2026-10-03", amount: "999", is_duplicate: true }),
  row({ id: "own", date: "2026-10-03", amount: "700", transaction_class: "internal_transfer" }),
  row({ id: "p1", date: "2026-09-25", amount: "400" }),
  row({ id: "p2", date: "2026-09-28", amount: "600", categories: { name: "Transport" } }),
];

const flow = buildCashFlow(rows, range);
assert.equal(flow.spending, 1050, "duplicates and own transfers are not spending");
assert.equal(flow.income, 5000);
assert.equal(flow.net, 3950);
assert.equal(Math.round(flow.savingsRate ?? -1), 79);
assert.equal(flow.previousNet, -1000);
assert.equal(buildCashFlow([], range).savingsRate, null, "no income, no savings rate");

const pace = buildSpendingPace(rows, range);
assert.equal(pace.current.length, 10);
assert.equal(pace.current[0], 0);
assert.equal(pace.current[1], 300);
assert.equal(pace.current[9], 1050);
assert.equal(pace.previous[9], 1000);
// 1050 over 10 days, 31 days in October.
assert.equal(Math.round(pace.projected ?? 0), 3255);
const wholeMonth = buildSpendingPace(rows, { startKey: "2026-10-01", endKey: "2026-10-31" });
assert.equal(wholeMonth.projected, null, "no projection once the month is over");

const categories = buildCategoryMovement(rows, range);
assert.equal(categories[0].name, "Transport");
assert.equal(categories[0].amount, 550);
assert.equal(Math.round(categories[0].changePercent ?? 0), -8);
assert.equal(categories.find((entry) => entry.name === "Groceries")?.changePercent, 25);

const merchants = buildTopMerchants(rows, range);
assert.deepEqual(
  merchants.map((entry) => [entry.name, entry.amount, entry.count]),
  [
    ["Uber trip", 550, 1],
    ["Checkers", 500, 2],
  ],
);

const calendar = buildSpendingCalendar(rows, range);
assert.equal(calendar.length, 10);
assert.equal(calendar[1].amount, 300);
assert.equal(calendar[0].weekday, 3, "1 Oct 2026 is a Thursday");

const weekdays = buildWeekdayAverages(rows, range);
assert.equal(weekdays.length, 7);
assert.equal(weekdays.reduce((sum, day) => sum + day.average * 1, 0) > 0, true);

const largest = buildLargestPayments(rows, range, 2);
assert.equal(largest[0].amount, 550);
assert.equal(largest.length, 2);

const drivers = buildSpendingDrivers(rows, range);
assert.equal(drivers[0].name, "Groceries", "biggest rand move first");
assert.equal(drivers[0].delta, 100);
assert.equal(drivers.find((d) => d.name === "Transport")?.delta, -50);

const money = (value: number) => `R${Math.round(value)}`;
const lines = buildHighlights({
  total: flow.spending,
  pace,
  weekdays,
  merchants,
  largest: buildLargestPayments(rows, range),
  cashFlow: flow,
  money,
  dateLabel: (key) => key,
});
const ids = lines.map((line) => line.id);
assert.ok(ids.includes("projection"), "mid-month projection is mentioned");
assert.ok(!ids.includes("overspent"), "income exceeds spending");
assert.ok(lines.every((line) => line.strong.length > 0));
const overspent = buildHighlights({
  total: 2000,
  pace: wholeMonth,
  weekdays,
  merchants: [],
  largest: [],
  cashFlow: { income: 1500, spending: 2000, net: -500, savingsRate: -33, previousNet: null },
  money,
  dateLabel: (key) => key,
});
assert.equal(overspent[0].id, "overspent");
assert.equal(overspent[0].strong, "R500");

console.log("insights-analytics.test passed");
