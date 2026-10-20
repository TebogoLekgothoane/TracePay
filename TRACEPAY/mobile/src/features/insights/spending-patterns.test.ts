import { buildSpendingPatterns } from "./spending-patterns";
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
