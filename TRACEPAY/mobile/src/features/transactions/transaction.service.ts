import { listAccounts, requireAuthenticatedUserId } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";
import { mergeRecentTransactions } from "./transaction.merge";
import { readTransactionRow } from "./transaction.row";
import type { TransactionRow } from "./transaction.types";

export {
  categoryName,
  formatTransactionAmount,
  readTransactionRow,
  transactionAccountLabel,
} from "./transaction.row";

const TRANSACTION_SELECT =
  "id,date,description,amount,type,balance,currency,account_id,statement_id,source,category_id,category_source,transaction_class,is_duplicate,categories(name),accounts(id,name,institution,account_type)";

const DEFAULT_LIMIT = 100;
const MIN_PER_ACCOUNT = 25;

async function queryRecentTransactions(
  limit: number,
  accountId?: string | null,
): Promise<TransactionRow[]> {
  let query = getSupabase()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("is_duplicate", false)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load your imported transactions.");
  }

  return (data ?? [])
    .map((row) => readTransactionRow(row))
    .filter((row): row is TransactionRow => row !== null);
}

export async function listRecentTransactions(
  limit = DEFAULT_LIMIT,
  accountId?: string | null,
): Promise<TransactionRow[]> {
  await requireAuthenticatedUserId();

  if (accountId) {
    return queryRecentTransactions(limit, accountId);
  }

  const accounts = await listAccounts();
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) {
    return [];
  }
  if (accountIds.length === 1) {
    return queryRecentTransactions(limit, accountIds[0]);
  }

  // Pull a fair recent slice from every account, then merge by date so one
  // busy account cannot hide activity on the others.
  const perAccount = Math.max(
    MIN_PER_ACCOUNT,
    Math.ceil(limit / accountIds.length) + MIN_PER_ACCOUNT,
  );
  const batches = await Promise.all(
    accountIds.map((id) => queryRecentTransactions(perAccount, id)),
  );
  return mergeRecentTransactions(batches.flat(), limit);
}

export async function getTransactionById(transactionId: string): Promise<TransactionRow | null> {
  await requireAuthenticatedUserId();
  if (!transactionId) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("id", transactionId)
    .eq("is_duplicate", false)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load this transaction.");
  }

  return readTransactionRow(data);
}
