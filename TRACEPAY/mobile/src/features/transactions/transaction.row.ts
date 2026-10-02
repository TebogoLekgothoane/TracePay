import type {
  TransactionAccount,
  TransactionRow,
  TransactionSource,
  TransactionType,
} from "./transaction.types";

function readSource(value: unknown): TransactionSource {
  if (value === "open_banking" || value === "manual") {
    return value;
  }
  return "statement";
}

function readAccount(value: unknown, fallbackId: string): TransactionAccount | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    return { id: fallbackId, name: "Account", institution: null, accountType: "other" };
  }
  const account = row as {
    id?: unknown;
    name?: unknown;
    institution?: unknown;
    account_type?: unknown;
  };
  if (typeof account.name !== "string" || account.name.length === 0) {
    return { id: fallbackId, name: "Account", institution: null, accountType: "other" };
  }
  return {
    id: typeof account.id === "string" ? account.id : fallbackId,
    name: account.name,
    institution: typeof account.institution === "string" ? account.institution : null,
    accountType: typeof account.account_type === "string" ? account.account_type : "other",
  };
}

export function readTransactionRow(value: unknown): TransactionRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.date !== "string" ||
    typeof row.description !== "string" ||
    typeof row.account_id !== "string" ||
    (row.type !== "debit" && row.type !== "credit")
  ) {
    return null;
  }
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount as number | string,
    type: row.type as TransactionType,
    balance: (row.balance as number | string | null) ?? null,
    currency: typeof row.currency === "string" ? row.currency : null,
    account_id: row.account_id,
    statement_id: typeof row.statement_id === "string" ? row.statement_id : null,
    source: readSource(row.source),
    transaction_class: typeof row.transaction_class === "string" ? row.transaction_class : null,
    is_duplicate: row.is_duplicate === true,
    category_id: typeof row.category_id === "string" ? row.category_id : null,
    category_source: row.category_source === "manual" ? "manual" : "automatic",
    categories: (row.categories as TransactionRow["categories"]) ?? null,
    account: readAccount(row.accounts, row.account_id),
  };
}

export function categoryName(transaction: TransactionRow): string {
  const value = Array.isArray(transaction.categories)
    ? transaction.categories[0]
    : transaction.categories;
  return value?.name ?? "Uncategorised";
}

export function transactionAccountLabel(transaction: TransactionRow): string {
  if (!transaction.account) {
    return "Account";
  }
  return transaction.account.institution?.trim() || transaction.account.name;
}

export function formatTransactionAmount(transaction: TransactionRow): string {
  const currency =
    transaction.currency === "ZAR" || !transaction.currency
      ? "R"
      : `${transaction.currency} `;
  const amount = Math.abs(Number(transaction.amount)).toFixed(2);
  return `${transaction.type === "debit" ? "-" : "+"}${currency}${amount}`;
}
