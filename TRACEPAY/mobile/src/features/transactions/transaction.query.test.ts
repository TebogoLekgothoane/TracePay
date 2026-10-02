import { mergeRecentTransactions } from "./transaction.merge";
import { readTransactionRow, transactionAccountLabel } from "./transaction.row";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const fnbRow = {
  id: "tx-1",
  date: "2026-09-15",
  description: "NETFLIX.COM",
  amount: -199,
  type: "debit",
  balance: 4210.5,
  currency: "ZAR",
  account_id: "acc-fnb",
  statement_id: "stmt-sep",
  source: "statement",
  transaction_class: "subscription",
  is_duplicate: false,
  category_id: null,
  category_source: "automatic",
  categories: { name: "Subscriptions" },
  accounts: { id: "acc-fnb", name: "Everyday Cheque", institution: "FNB", account_type: "cheque" },
};

const capitecRow = {
  ...fnbRow,
  id: "tx-2",
  account_id: "acc-capitec",
  statement_id: "stmt-cap",
  accounts: {
    id: "acc-capitec",
    name: "Savings",
    institution: "Capitec",
    account_type: "savings",
  },
};

test("canonical transaction retains user/account/statement identity", () => {
  const row = readTransactionRow(fnbRow);
  assert(row, "parsed");
  assertEqual(row.account_id, "acc-fnb", "account_id");
  assertEqual(row.statement_id, "stmt-sep", "statement_id");
  assertEqual(row.source, "statement", "source");
  assertEqual(row.account?.institution, "FNB", "bank");
  assertEqual(transactionAccountLabel(row), "FNB", "label");
});

test("unified view keeps every account; account view filters to one account", () => {
  const rows = [readTransactionRow(fnbRow), readTransactionRow(capitecRow)].filter(
    (row): row is NonNullable<typeof row> => row !== null,
  );
  const unified = rows.filter((row) => !row.is_duplicate);
  const fnbOnly = unified.filter((row) => row.account_id === "acc-fnb");
  assertEqual(unified.length, 2, "all accounts");
  assertEqual(fnbOnly.length, 1, "fnb only");
  assertEqual(fnbOnly[0]?.account_id, "acc-fnb", "filtered account");
  assert(unified.every((row) => Boolean(row.account)), "bank preserved");
});

test("mergeRecentTransactions sorts by date across accounts", () => {
  const older = readTransactionRow({ ...fnbRow, id: "tx-old", date: "2026-08-01" });
  const newerOther = readTransactionRow({
    ...capitecRow,
    id: "tx-new",
    date: "2026-09-20",
  });
  const mid = readTransactionRow({ ...fnbRow, id: "tx-mid", date: "2026-09-10" });
  assert(older && newerOther && mid, "parsed");
  const merged = mergeRecentTransactions([older, newerOther, mid], 2);
  assertEqual(merged.length, 2, "limit");
  assertEqual(merged[0]?.id, "tx-new", "newest first");
  assertEqual(merged[1]?.id, "tx-mid", "second");
  assert(
    new Set(merged.map((row) => row.account_id)).size === 2,
    "both accounts represented when dates interleave",
  );
});

test("duplicate rows are excluded from the unified totals view", () => {
  const duplicate = readTransactionRow({ ...fnbRow, id: "tx-dup", is_duplicate: true });
  assert(duplicate, "parsed duplicate");
  const visible = [readTransactionRow(fnbRow), duplicate].filter(
    (row): row is NonNullable<typeof row> => row !== null && !row.is_duplicate,
  );
  assertEqual(visible.length, 1, "canonical only");
});

test("open banking source is preserved on the same canonical row shape", () => {
  const row = readTransactionRow({
    ...fnbRow,
    source: "open_banking",
    statement_id: null,
  });
  assert(row, "parsed");
  assertEqual(row.source, "open_banking", "source");
  assertEqual(row.statement_id, null, "no statement");
  assertEqual(row.account_id, "acc-fnb", "account still required");
});

console.log("unified transaction query tests passed");
