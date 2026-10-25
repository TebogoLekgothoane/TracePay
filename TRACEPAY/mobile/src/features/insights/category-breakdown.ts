/**
 * Spending / income by category from real transactions.
 *
 * Rules, all applied to rows the app already stores:
 *  - overlap duplicates are never counted
 *  - confirmed transfers between the user's own accounts are never spending or income
 *  - a refund or reversal reduces the category it came back to (it is not income)
 *  - a transaction with no category is shown as "Uncategorised", not guessed
 */

import { categoryName } from "../transactions/transaction.row";
import type { TransactionRow } from "../transactions/transaction.types";
import type { CustomRange, Period } from "./period";

export type CategoryMode = "Spending" | "Income";

export type CategorySlice = {
  name: string;
  amount: number;
  /** Share of the total, 0–100. */
  percent: number;
  count: number;
};

export type CategoryBreakdown = {
  total: number;
  slices: CategorySlice[];
  transactionCount: number;
};

export type PeriodRange = {
  start: Date;
  end: Date;
  startKey: string;
  endKey: string;
};

const MAX_SLICES = 6;
const OTHER_LABEL = "Other";
const REFUND_WORDS = /\b(refund|reversal|reversed|chargeback|cashback)\b/i;
const NOT_REAL_FLOW_CLASSES = new Set(["internal_transfer"]);

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The calendar days a period covers, relative to the day being analysed. */
export function periodDateRange(
  period: Period,
  customRange: CustomRange,
  reference: Date,
): PeriodRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const day = reference.getDate();
  let start: Date;
  let end = new Date(year, month, day);
  if (period === "Last month") {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0);
  } else if (period === "3 months") {
    start = new Date(year, month - 2, 1);
  } else if (period === "Custom") {
    if (customRange === "Last 7 days") start = new Date(year, month, day - 6);
    else if (customRange === "Year to date") start = new Date(year, 0, 1);
    else start = new Date(year, month, day - 13);
  } else {
    start = new Date(year, month, 1);
  }
  return { start, end, startKey: dateKey(start), endKey: dateKey(end) };
}

function amountOf(row: TransactionRow): number {
  const value = Math.abs(Number(row.amount));
  return Number.isFinite(value) ? value : 0;
}

function isRefund(row: TransactionRow): boolean {
  return (
    row.type === "credit" &&
    REFUND_WORDS.test(`${row.description} ${categoryName(row)}`)
  );
}

/**
 * What a row contributes to spending or income: positive money, a negative
 * amount for a refund against spending, or 0 when it is not part of the flow
 * (duplicate, own-account transfer, wrong direction, zero).
 */
export function flowAmount(row: TransactionRow, mode: CategoryMode): number {
  if (row.is_duplicate) return 0;
  if (NOT_REAL_FLOW_CLASSES.has((row.transaction_class ?? "").toLowerCase())) return 0;
  const amount = amountOf(row);
  if (amount === 0) return 0;
  const refund = isRefund(row);
  if (mode === "Spending") {
    if (row.type === "debit") return amount;
    return refund ? -amount : 0;
  }
  return row.type === "credit" && !refund ? amount : 0;
}

export function buildCategoryBreakdown(
  rows: readonly TransactionRow[],
  mode: CategoryMode,
  range: Pick<PeriodRange, "startKey" | "endKey">,
): CategoryBreakdown {
  const totals = new Map<string, { amount: number; count: number }>();
  let transactionCount = 0;

  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (day < range.startKey || day > range.endKey) continue;
    const flow = flowAmount(row, mode);
    if (flow === 0) continue;

    const name = categoryName(row);
    const current = totals.get(name) ?? { amount: 0, count: 0 };
    current.amount += flow;
    current.count += flow > 0 ? 1 : 0;
    totals.set(name, current);
    transactionCount += 1;
  }

  // A refund can only bring a category back to zero, never below.
  const positive = [...totals.entries()]
    .map(([name, value]) => ({ name, amount: Math.max(value.amount, 0), count: value.count }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const total = positive.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) return { total: 0, slices: [], transactionCount };

  const head = positive.slice(0, MAX_SLICES - 1);
  const rest = positive.slice(MAX_SLICES - 1);
  const grouped =
    rest.length > 1
      ? [
          ...head,
          {
            name: OTHER_LABEL,
            amount: rest.reduce((sum, item) => sum + item.amount, 0),
            count: rest.reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : positive.slice(0, MAX_SLICES);

  return {
    total,
    transactionCount,
    slices: grouped.map((item) => ({
      ...item,
      percent: (item.amount / total) * 100,
    })),
  };
}

export function formatPercent(percent: number): string {
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}
