export type TotalsRow = {
  account_id: string;
  amount: number | string;
  type: "debit" | "credit";
};

export type TransactionTotals = {
  /** Sum of debits (money out), as a positive number. */
  spent: number;
  /** Sum of credits (money in). */
  income: number;
  count: number;
};

export const ALL_ACCOUNTS_KEY = "all";

const EMPTY: TransactionTotals = { spent: 0, income: 0, count: 0 };

export function emptyTotals(): TransactionTotals {
  return { ...EMPTY };
}

/** Totals for every account and for all accounts together, keyed by account id. */
export function summariseTotalsByAccount(rows: readonly TotalsRow[]): Record<string, TransactionTotals> {
  const result: Record<string, TransactionTotals> = { [ALL_ACCOUNTS_KEY]: emptyTotals() };

  for (const row of rows) {
    const amount = Math.abs(Number(row.amount));
    if (!Number.isFinite(amount)) continue;

    for (const key of [ALL_ACCOUNTS_KEY, row.account_id]) {
      const totals = (result[key] ??= emptyTotals());
      if (row.type === "debit") totals.spent += amount;
      else totals.income += amount;
      totals.count += 1;
    }
  }

  return result;
}

export function formatRand(value: number): string {
  const whole = Math.abs(value).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R${whole.replace(/ /g, " ")}`;
}
