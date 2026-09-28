import { requireAuthenticatedUserId } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";
import type { TransactionRow } from "./transaction.types";

const TRANSACTION_SELECT =
  "id,date,description,amount,type,balance,currency,category_id,category_source,categories(name)";

export async function listRecentTransactions(limit = 100): Promise<TransactionRow[]> {
  await requireAuthenticatedUserId();

  const { data, error } = await getSupabase()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error("Could not load your imported transactions.");
  }

  return (data ?? []) as TransactionRow[];
}

export async function getTransactionById(id: string): Promise<TransactionRow | null> {
  await requireAuthenticatedUserId();
  if (!id) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load this transaction.");
  }

  return (data as TransactionRow | null) ?? null;
}

export function categoryName(transaction: TransactionRow): string {
  const value = Array.isArray(transaction.categories)
    ? transaction.categories[0]
    : transaction.categories;
  return value?.name ?? "Uncategorised";
}

export function formatTransactionAmount(transaction: TransactionRow): string {
  const currency =
    transaction.currency === "ZAR" || !transaction.currency
      ? "R"
      : `${transaction.currency} `;
  const amount = Math.abs(Number(transaction.amount)).toFixed(2);
  return `${transaction.type === "debit" ? "-" : "+"}${currency}${amount}`;
}
