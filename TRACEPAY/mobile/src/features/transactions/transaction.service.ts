import { listAccounts, requireAuthenticatedUserId } from "../accounts/account.service";
import { getSupabase } from "../../lib/supabase";
import { TRANSACTION_LIST_ORDER } from "./transaction.merge";
import {
  localDateKey,
  resolveSpendingReference,
  shiftDate,
  SPENDING_WINDOW_DAYS,
} from "../insights/spending-patterns";
import {
  periodDateRange,
  type PeriodRange,
} from "../insights/category-breakdown";
import { rhythmStartKey, type RhythmSpan } from "../dashboard/spending-rhythm";
import { previousPeriodRange } from "../insights/insights-report";
import type { CustomRange, Period } from "../insights/period";
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

export type SpendingPatternData = {
  rows: TransactionRow[];
  /** Day the patterns are for; null when there are no transactions at all. */
  referenceDate: Date | null;
  /** False when the newest transaction is old, so the day is not "today". */
  isCurrent: boolean;
  latestTransactionDate: string | null;
};

const SPENDING_PAGE_SIZE = 1000;
const SPENDING_MAX_PAGES = 10;

/** Every non-duplicate transaction between two dates (inclusive), all accounts, paged. */
async function fetchTransactionWindow(
  startKey: string,
  endKey: string,
): Promise<{ rows: TransactionRow[]; truncated: boolean }> {
  const rows: TransactionRow[] = [];
  let truncated = false;
  for (let page = 0; page < SPENDING_MAX_PAGES; page += 1) {
    const from = page * SPENDING_PAGE_SIZE;
    const { data, error } = await getSupabase()
      .from("transactions")
      .select(TRANSACTION_SELECT)
      .eq("is_duplicate", false)
      .gte("date", startKey)
      .lte("date", endKey)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + SPENDING_PAGE_SIZE - 1);
    if (error) {
      throw new Error("Could not load your transactions.");
    }
    const batch = (data ?? [])
      .map((row) => readTransactionRow(row))
      .filter((row): row is TransactionRow => row !== null);
    rows.push(...batch);
    if ((data ?? []).length < SPENDING_PAGE_SIZE) break;
    truncated = page === SPENDING_MAX_PAGES - 1;
  }
  return { rows, truncated };
}

async function latestTransactionDate(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("date")
    .eq("is_duplicate", false)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load your transactions.");
  }
  return typeof data?.date === "string" ? data.date.slice(0, 10) : null;
}

export type InsightsData = {
  /** Rows for the period and the equal-length period before it. */
  rows: TransactionRow[];
  range: PeriodRange | null;
  /** False when the newest transaction is old, so "this month" is not the current month. */
  isCurrent: boolean;
  referenceDate: Date | null;
  /** True when more rows existed than could be loaded. */
  truncated: boolean;
};

/** Real transactions behind the whole Insights tab for one period. */
export async function loadInsightsData(
  period: Period,
  customRange: CustomRange,
  now = new Date(),
): Promise<InsightsData> {
  await requireAuthenticatedUserId();
  const reference = resolveSpendingReference(await latestTransactionDate(), now);
  if (!reference) {
    return { rows: [], range: null, isCurrent: false, referenceDate: null, truncated: false };
  }
  const range = periodDateRange(period, customRange, reference.referenceDate);
  const earlier = previousPeriodRange(range);
  const { rows, truncated } = await fetchTransactionWindow(earlier.startKey, range.endKey);
  return {
    rows,
    range,
    isCurrent: reference.isCurrent,
    referenceDate: reference.referenceDate,
    truncated,
  };
}

/**
 * Real transactions for the spending-patterns section: every account, no
 * overlap duplicates, bounded to the window the patterns actually use.
 */
export async function loadSpendingPatternData(now = new Date()): Promise<SpendingPatternData> {
  await requireAuthenticatedUserId();
  const latestDate = await latestTransactionDate();
  const reference = resolveSpendingReference(latestDate, now);
  if (!reference) {
    return { rows: [], referenceDate: null, isCurrent: false, latestTransactionDate: null };
  }

  const { rows } = await fetchTransactionWindow(
    localDateKey(shiftDate(reference.referenceDate, -SPENDING_WINDOW_DAYS)),
    localDateKey(reference.referenceDate),
  );
  return {
    rows,
    referenceDate: reference.referenceDate,
    isCurrent: reference.isCurrent,
    latestTransactionDate: latestDate,
  };
}

export type SpendingRhythmData = {
  rows: TransactionRow[];
  /** The month being described; null when there are no transactions. */
  referenceDate: Date | null;
  isCurrent: boolean;
};

/** Real transactions for the home spending rhythm: the chosen span plus the span before it. */
export async function loadSpendingRhythmData(
  span: RhythmSpan,
  now = new Date(),
): Promise<SpendingRhythmData> {
  await requireAuthenticatedUserId();
  const reference = resolveSpendingReference(await latestTransactionDate(), now);
  if (!reference) {
    return { rows: [], referenceDate: null, isCurrent: false };
  }
  const { rows } = await fetchTransactionWindow(
    rhythmStartKey(span, reference.referenceDate),
    localDateKey(reference.referenceDate),
  );
  return { rows, referenceDate: reference.referenceDate, isCurrent: reference.isCurrent };
}
