import {
  buildSpendingPatterns,
  resolveSpendingReference,
  SPENDING_WINDOW_DAYS,
} from "./spending-patterns";
import type { TransactionRow } from "../transactions/transaction.types";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "tx",
    date: "2026-10-20",
    description: "Payment",
    amount: "20",
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
    merchantName: "Merchant",
    categories: { name: "Shopping" },
    account: null,
    occurredAt: null,
    ...overrides,
  };
}

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

test("aggregates only real spending categories for today", () => {
  const result = buildSpendingPatterns(
    [
      row({ id: "takeaway", amount: "300", categories: { name: "Fast Food" } }),
      row({ id: "income", amount: "5000", type: "credit", categories: { name: "Salary" } }),
      row({ id: "duplicate", amount: "900", is_duplicate: true }),
      row({ id: "refund", amount: "100", description: "Refund from shop" }),
    ],
    new Date(2026, 9, 20),
  );
  if (result.todayTotal !== 300) throw new Error("today total");
  if (result.todayCategories[0]?.name !== "Fast Food") throw new Error("category");
  if (result.todayCount !== 1) throw new Error("count");
});

test("detects frequent small purchases without inventing a baseline", () => {
  const transactions = Array.from({ length: 5 }, (_, index) =>
    row({ id: `small-${index}`, amount: "20", date: "2026-10-18" }),
  );
  const result = buildSpendingPatterns(transactions, new Date(2026, 9, 20));
  if (result.recentSmallPurchaseCount !== 5) throw new Error("small count");
  if (result.recentSmallPurchaseTotal !== 100) throw new Error("small total");
  if (result.hasBaseline) throw new Error("baseline should be unavailable");
});

test("recent data is analysed as of today", () => {
  const now = new Date(2026, 9, 25, 14, 0);
  for (const latest of ["2026-10-25", "2026-10-22", "2026-10-18"]) {
    const reference = resolveSpendingReference(latest, now);
    if (!reference?.isCurrent) throw new Error(`${latest} should be current`);
    if (reference.referenceDate !== now) throw new Error("reference should be now");
  }
});

test("old data is analysed as of its newest day and not called today", () => {
  const now = new Date(2026, 9, 25);
  const reference = resolveSpendingReference("2026-09-30", now);
  if (!reference || reference.isCurrent) throw new Error("should not be current");
  const day = reference.referenceDate;
  if (day.getFullYear() !== 2026 || day.getMonth() !== 8 || day.getDate() !== 30) {
    throw new Error("reference should be the newest transaction day");
  }
});

test("no transactions or a bad date gives no reference", () => {
  if (resolveSpendingReference(null) !== null) throw new Error("null");
  if (resolveSpendingReference("not a date") !== null) throw new Error("bad date");
});

test("patterns for older data are computed from that day, not from today", () => {
  const reference = resolveSpendingReference("2026-09-30", new Date(2026, 9, 25));
  if (!reference) throw new Error("expected a reference");
  const result = buildSpendingPatterns(
    [
      row({ id: "a", amount: "400", date: "2026-09-30", categories: { name: "Groceries" } }),
      row({ id: "b", amount: "90", date: "2026-10-20" }),
    ],
    reference.referenceDate,
  );
  if (result.todayTotal !== 400) throw new Error("should use the newest statement day");
});

test("the loaded window covers the recent week and the 30-day baseline", () => {
  if (SPENDING_WINDOW_DAYS < 37) throw new Error("window too short for the baseline");
});
