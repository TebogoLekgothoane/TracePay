export function normalizeTransactionDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type DedupeInput = {
  date: string;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
};

/**
 * Keys for every row of one statement, numbering identical rows.
 *
 * A statement can legitimately contain the same row several times (four R50
 * airtime purchases on one day, each with the same text), so identical rows are
 * told apart by occurrence. The first occurrence keeps the legacy key, which
 * keeps rows saved before this change matching; later ones get `|#n`. A
 * re-imported overlapping statement still matches occurrence by occurrence,
 * while repeats inside one statement are never collapsed.
 */
export function buildOccurrenceDedupeKeys(
  accountId: string,
  transactions: readonly DedupeInput[],
): string[] {
  const seen = new Map<string, number>();
  return transactions.map((transaction) => {
    const base = buildTransactionDedupeKey(accountId, transaction);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence === 1 ? base : `${base}|#${occurrence}`;
  });
}

export function buildTransactionDedupeKey(
  accountId: string,
  transaction: {
    date: string;
    description: string;
    amount: number | string;
    type: "debit" | "credit";
  },
): string {
  const amount = Math.abs(Number(transaction.amount)).toFixed(2);
  const description = normalizeTransactionDescription(transaction.description);
  return `${accountId}|${transaction.date}|${transaction.type}|${amount}|${description}`;
}
