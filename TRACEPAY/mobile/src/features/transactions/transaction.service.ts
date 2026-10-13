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
  "id,date,description,amount,type,balance,currency,account_id,statement_id,source,category_id,category_source,transaction_class,is_duplicate,merchant_name,categories(name),accounts(id,name,institution,account_type)";

/** Initial page + each subsequent scroll page (banking-app style windowing). */
export const TRANSACTION_PAGE_SIZE = 300;

export type TransactionPage = {
  rows: TransactionRow[];
  hasMore: boolean;
};

async function queryRecentTransactionsPage(
  accountIds: readonly string[],
  limit: number,
  offset: number,
): Promise<TransactionPage> {
  if (accountIds.length === 0) {
    return { rows: [], hasMore: false };
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
  const from = Math.max(0, offset);
  const to = from + Math.max(1, limit) - 1;
  const { data, error } = await query
    .order(byDate.column, { ascending: byDate.ascending })
    .order(byId.column, { ascending: byId.ascending })
    .range(from, to);

  if (error) {
    throw new Error("Could not load your imported transactions.");
  }

  const rows = (data ?? [])
    .map((row) => readTransactionRow(row))
    .filter((row): row is TransactionRow => row !== null);

  return {
    rows,
    hasMore: rows.length === limit,
  };
}

export async function listRecentTransactionsPage(options: {
  limit?: number;
  offset?: number;
  accountId?: string | null;
}): Promise<TransactionPage> {
  await requireAuthenticatedUserId();
  const limit = options.limit ?? TRANSACTION_PAGE_SIZE;
  const offset = options.offset ?? 0;

  if (options.accountId) {
    return queryRecentTransactionsPage([options.accountId], limit, offset);
  }

  const accounts = await listAccounts();
  return queryRecentTransactionsPage(
    accounts.map((account) => account.id),
    limit,
    offset,
  );
}

export async function listRecentTransactions(
  limit = TRANSACTION_PAGE_SIZE,
  accountId?: string | null,
): Promise<TransactionRow[]> {
  const page = await listRecentTransactionsPage({ limit, offset: 0, accountId });
  return page.rows;
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
