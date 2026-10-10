import type { TransactionRow } from "./transaction.types";

/** Matches compareTransactionsNewestFirst when no transaction timestamp is stored. */
export const TRANSACTION_LIST_ORDER = [
  { column: "date", ascending: false },
  { column: "id", ascending: true },
] as const;

function compareDescending(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
}

/**
 * Newest calendar date first. Same date uses the transaction timestamp when
 * both rows have one, then id so the order stays stable.
 * Query order in transaction.service must match this when occurredAt is absent:
 * date descending, id ascending.
 */
export function compareTransactionsNewestFirst(
  left: TransactionRow,
  right: TransactionRow,
): number {
  const byDate = compareDescending(left.date, right.date);
  if (byDate !== 0) {
    return byDate;
  }

  if (left.occurredAt && right.occurredAt) {
    const byTime = compareDescending(left.occurredAt, right.occurredAt);
    if (byTime !== 0) {
      return byTime;
    }
  }

  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

export function mergeRecentTransactions(
  rows: readonly TransactionRow[],
  limit: number,
): TransactionRow[] {
  return [...rows].sort(compareTransactionsNewestFirst).slice(0, Math.max(0, limit));
}
