import { mergeRecentTransactions, TRANSACTION_LIST_ORDER } from "./transaction.merge";
import { categoryName, readTransactionRow, transactionAccountLabel } from "./transaction.row";
import type { TransactionRow } from "./transaction.types";

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

function linkedRow(input: {
  id: string;
  date: string;
  institution: "KPB" | "Tyne Bank";
  description: string;
  amount: number;
  type: "debit" | "credit";
  category: string;
  occurredAt?: string;
}): TransactionRow {
  const accountId = input.institution === "KPB" ? "acc-kpb" : "acc-tyne";
  const row = readTransactionRow({
    ...fnbRow,
    id: input.id,
    date: input.date,
    description: input.description,
    amount: input.amount,
    type: input.type,
    account_id: accountId,
    occurred_at: input.occurredAt,
    categories: { name: input.category },
    accounts: {
      id: accountId,
      name: input.institution,
      institution: input.institution,
      account_type: "cheque",
    },
  });
  assert(row, `parsed ${input.id}`);
  return row;
}

test("KPB and Tyne Bank transactions interleave by date, newest first", () => {
  const kpbNewest = linkedRow({
    id: "kpb-new",
    date: "2026-03-04",
    institution: "KPB",
    description: "KPB salary",
    amount: 12000,
    type: "credit",
    category: "Income",
  });
  const tyneNext = linkedRow({
    id: "tyne-new",
    date: "2026-03-01",
    institution: "Tyne Bank",
    description: "Tyne groceries",
    amount: -450.5,
    type: "debit",
    category: "Groceries",
  });
  const kpbSameDay = linkedRow({
    id: "kpb-same",
    date: "2026-02-15",
    institution: "KPB",
    description: "KPB fee",
    amount: -15,
    type: "debit",
    category: "Bank fees",
    occurredAt: "2026-02-15T08:00:00.000Z",
  });
  const tyneSameDay = linkedRow({
    id: "tyne-same",
    date: "2026-02-15",
    institution: "Tyne Bank",
    description: "Tyne transfer",
    amount: -200,
    type: "debit",
    category: "Transfers",
    occurredAt: "2026-02-15T18:30:00.000Z",
  });
  const tyneOlder = linkedRow({
    id: "tyne-old",
    date: "2026-02-01",
    institution: "Tyne Bank",
    description: "Tyne airtime",
    amount: -30,
    type: "debit",
    category: "Airtime",
  });
  const kpbOldest = linkedRow({
    id: "kpb-old",
    date: "2026-01-20",
    institution: "KPB",
    description: "KPB debit order",
    amount: -899,
    type: "debit",
    category: "Bills",
  });

  const groupedByBank = [kpbNewest, kpbSameDay, kpbOldest, tyneNext, tyneSameDay, tyneOlder];
  const merged = mergeRecentTransactions(groupedByBank, 10);
  const again = mergeRecentTransactions([...groupedByBank].reverse(), 10);

  assertEqual(
    merged.map((row) => row.id).join(","),
    "kpb-new,tyne-new,tyne-same,kpb-same,tyne-old,kpb-old",
    "newest first across both banks",
  );
  assertEqual(
    again.map((row) => row.id).join(","),
    merged.map((row) => row.id).join(","),
    "same order when the bank groups are reversed",
  );
  assertEqual(
    merged.map((row) => row.account?.institution).join(","),
    "KPB,Tyne Bank,Tyne Bank,KPB,Tyne Bank,KPB",
    "banks interleave instead of staying in two blocks",
  );
  assertEqual(merged[0]?.description, "KPB salary", "description");
  assertEqual(merged[0]?.amount, 12000, "amount");
  assertEqual(merged[0]?.type, "credit", "type");
  assertEqual(categoryName(merged[0]!), "Income", "category");
  assertEqual(merged[0]?.account_id, "acc-kpb", "account");
  assertEqual(merged[2]?.description, "Tyne transfer", "same-day description");
  assertEqual(merged[2]?.account?.institution, "Tyne Bank", "later timestamp first");
  assertEqual(categoryName(merged[2]!), "Transfers", "same-day category");
});

test("the combined query uses the same order as the in-memory sort", () => {
  assertEqual(TRANSACTION_LIST_ORDER.length, 2, "date then id");
  assertEqual(TRANSACTION_LIST_ORDER[0]?.column, "date", "date column");
  assertEqual(TRANSACTION_LIST_ORDER[0]?.ascending, false, "newest date first");
  assertEqual(TRANSACTION_LIST_ORDER[1]?.column, "id", "stable tie-break");
  assertEqual(TRANSACTION_LIST_ORDER[1]?.ascending, true, "id ascending");
});

test("identical dates without a transaction timestamp use a stable id order", () => {
  const kpb = linkedRow({
    id: "tx-2",
    date: "2026-04-01",
    institution: "KPB",
    description: "KPB card",
    amount: -10,
    type: "debit",
    category: "Shopping",
  });
  const tyne = linkedRow({
    id: "tx-1",
    date: "2026-04-01",
    institution: "Tyne Bank",
    description: "Tyne card",
    amount: -12,
    type: "debit",
    category: "Shopping",
  });
  const forward = mergeRecentTransactions([kpb, tyne], 10).map((row) => row.id).join(",");
  const backward = mergeRecentTransactions([tyne, kpb], 10).map((row) => row.id).join(",");
  assertEqual(forward, "tx-1,tx-2", "id ascending when the date matches");
  assertEqual(backward, forward, "order does not follow input or bank");
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
