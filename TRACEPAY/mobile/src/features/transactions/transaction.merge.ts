import type { TransactionRow } from "./transaction.types";

export function mergeRecentTransactions(
  rows: readonly TransactionRow[],
  limit: number,
): TransactionRow[] {
  return [...rows]
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }
      return left.id < right.id ? 1 : -1;
    })
    .slice(0, Math.max(0, limit));
}
