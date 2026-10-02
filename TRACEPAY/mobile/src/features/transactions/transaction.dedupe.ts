export function normalizeTransactionDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
