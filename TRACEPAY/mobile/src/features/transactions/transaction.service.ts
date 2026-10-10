import { listAccounts, requireAuthenticatedUserId } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";
import { TRANSACTION_LIST_ORDER } from "./transaction.merge";
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

async function queryRecentTransactions(
  limit: number,
  accountIds: readonly string[],
): Promise<TransactionRow[]> {
  if (accountIds.length === 0) {
    return [];
  }

  let query = getSupabase()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .eq("is_duplicate", false);

  const [onlyAccountId] = accountIds;
  query =
    accountIds.length === 1 && onlyAccountId
      ? query.eq("account_id", onlyAccountId)
      : query.in("account_id", [...accountIds]);

  // created_at is the import batch time and would cluster same-day rows by bank.
  const [byDate, byId] = TRANSACTION_LIST_ORDER;
  const { data, error } = await query
    .order(byDate.column, { ascending: byDate.ascending })
    .order(byId.column, { ascending: byId.ascending })
    .limit(limit);

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
    return queryRecentTransactions(limit, [accountId]);
  }

  const accounts = await listAccounts();
  return queryRecentTransactions(
    limit,
    accounts.map((account) => account.id),
  );
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
