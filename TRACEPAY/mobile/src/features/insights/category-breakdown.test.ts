import {
  buildCategoryBreakdown,
  formatPercent,
  periodDateRange,
} from "./category-breakdown";
import type { TransactionRow } from "../transactions/transaction.types";

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

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

const OCTOBER = { startKey: "2026-10-01", endKey: "2026-10-31" };

test("totals each category from real rows, largest first", () => {
  const result = buildCategoryBreakdown(
    [
      row({ id: "1", amount: "300", categories: { name: "Groceries" } }),
      row({ id: "2", amount: "200", categories: { name: "Groceries" } }),
      row({ id: "3", amount: "500", categories: { name: "Transport" } }),
      row({ id: "4", amount: "100", categories: { name: "Fuel" } }),
    ],
    "Spending",
    OCTOBER,
  );
  assertEqual(result.total, 1100, "total");
  assertEqual(result.slices[0]?.name, "Groceries", "order uses amount, ties broken by name");
  assertEqual(result.slices[0]?.amount, 500, "groceries");
  assertEqual(result.slices[0]?.count, 2, "count");
  assertEqual(Math.round(result.slices[2]?.percent ?? 0), 9, "share");
});

test("duplicates, own-account transfers and out-of-period rows are excluded", () => {
  const result = buildCategoryBreakdown(
    [
      row({ id: "1", amount: "100" }),
      row({ id: "2", amount: "900", is_duplicate: true }),
      row({ id: "3", amount: "5000", transaction_class: "internal_transfer", categories: { name: "Transfers" } }),
      row({ id: "4", amount: "700", date: "2026-09-30" }),
      row({ id: "5", amount: "700", date: "2026-11-01" }),
    ],
    "Spending",
    OCTOBER,
  );
  assertEqual(result.total, 100, "only the real in-period spend");
});

test("a refund reduces its category and is never income", () => {
  const rows = [
    row({ id: "1", amount: "1500", categories: { name: "Shopping" }, description: "TAKEALOT ORDER" }),
    row({ id: "2", amount: "500", type: "credit", categories: { name: "Shopping" }, description: "TAKEALOT REFUND" }),
    row({ id: "3", amount: "20000", type: "credit", categories: { name: "Salary" }, transaction_class: "income", description: "SALARY" }),
  ];
  const spending = buildCategoryBreakdown(rows, "Spending", OCTOBER);
  assertEqual(spending.total, 1000, "net of the refund");
  const income = buildCategoryBreakdown(rows, "Income", OCTOBER);
  assertEqual(income.total, 20000, "refund is not income");
  assertEqual(income.slices[0]?.name, "Salary", "income category");
});

test("a refund larger than its category's spending cannot make it negative", () => {
  const result = buildCategoryBreakdown(
    [
      row({ id: "1", amount: "100", categories: { name: "Shopping" } }),
      row({ id: "2", amount: "400", type: "credit", categories: { name: "Shopping" }, description: "REFUND" }),
      row({ id: "3", amount: "50", categories: { name: "Groceries" } }),
    ],
    "Spending",
    OCTOBER,
  );
  assertEqual(result.total, 50, "shopping floors at zero");
  assertEqual(result.slices.length, 1, "empty category is dropped");
});

test("uncategorised rows are shown as such, not guessed", () => {
  const result = buildCategoryBreakdown(
    [row({ id: "1", amount: "80", categories: null })],
    "Spending",
    OCTOBER,
  );
  assertEqual(result.slices[0]?.name, "Uncategorised", "label");
});

test("many small categories collapse into Other, keeping the total exact", () => {
  const rows = Array.from({ length: 9 }, (_, index) =>
    row({ id: `c${index}`, amount: String(100 - index), categories: { name: `Cat ${index}` } }),
  );
  const result = buildCategoryBreakdown(rows, "Spending", OCTOBER);
  assertEqual(result.slices.length, 6, "five categories plus Other");
  assertEqual(result.slices[5]?.name, "Other", "other bucket");
  const summed = result.slices.reduce((sum, slice) => sum + slice.amount, 0);
  assertEqual(summed, result.total, "slices add up to the total");
  assertEqual(Math.round(result.slices.reduce((sum, slice) => sum + slice.percent, 0)), 100, "percent adds to 100");
});

test("no matching transactions gives an empty breakdown, not demo numbers", () => {
  const result = buildCategoryBreakdown([], "Spending", OCTOBER);
  assertEqual(result.total, 0, "total");
  assertEqual(result.slices.length, 0, "slices");
});

test("period ranges follow the calendar", () => {
  const reference = new Date(2026, 9, 25);
  const month = periodDateRange("This month", "Last 14 days", reference);
  assertEqual(month.startKey, "2026-10-01", "this month start");
  assertEqual(month.endKey, "2026-10-25", "this month end is the reference day");
  const last = periodDateRange("Last month", "Last 14 days", reference);
  assertEqual(last.startKey, "2026-09-01", "last month start");
  assertEqual(last.endKey, "2026-09-30", "last month end");
  const three = periodDateRange("3 months", "Last 14 days", reference);
  assertEqual(three.startKey, "2026-08-01", "three months start");
  assertEqual(periodDateRange("Custom", "Last 7 days", reference).startKey, "2026-10-19", "7 days");
  assertEqual(periodDateRange("Custom", "Year to date", reference).startKey, "2026-01-01", "ytd");
  const january = periodDateRange("Last month", "Last 14 days", new Date(2026, 0, 15));
  assertEqual(january.startKey, "2025-12-01", "year boundary start");
  assertEqual(january.endKey, "2025-12-31", "year boundary end");
});

test("percent labels never show a misleading 0%", () => {
  assertEqual(formatPercent(0.4), "<1%", "tiny");
  assertEqual(formatPercent(31.4), "31%", "rounded");
});

console.log("category-breakdown tests passed");
