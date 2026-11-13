import { categoryName } from "../transactions/transaction.row";
import type { TransactionRow } from "../transactions/transaction.types";

const SMALL_PURCHASE_LIMIT = 50;
const RECENT_WINDOW_DAYS = 7;
const BASELINE_WINDOW_DAYS = 30;
const MIN_BASELINE_DAYS = 7;

const NON_SPENDING_CLASSES = new Set([
  "income",
  "salary",
  "transfer",
  "internal_transfer",
  "person_to_person",
  "savings",
  "bank_fee",
  "cash_withdrawal",
]);

const REVERSAL_WORDS = /\b(refund|reversal|reversed|chargeback|cashback)\b/i;

export type SpendingPatternCategory = {
  name: string;
  amount: number;
  count: number;
};

export type SpendingPatternInsight = {
  id: string;
  title: string;
  detail: string;
  amount: number | null;
  count: number | null;
  action: string;
};

export type SpendingPatterns = {
  today: string;
  todayTotal: number;
  todayCount: number;
  todayCategories: SpendingPatternCategory[];
  recentSmallPurchaseCount: number;
  recentSmallPurchaseTotal: number;
  insights: SpendingPatternInsight[];
  hasBaseline: boolean;
};

export function buildSpendingPatterns(
  transactions: readonly TransactionRow[],
  referenceDate = new Date(),
): SpendingPatterns {
  const today = localDateKey(referenceDate);
  const todayRows = spendingRowsOn(transactions, today);
  const recentRows = spendingRowsBetween(
    transactions,
    shiftDate(referenceDate, -(RECENT_WINDOW_DAYS - 1)),
    referenceDate,
  );
  const baselineRows = spendingRowsBetween(
    transactions,
    shiftDate(referenceDate, -BASELINE_WINDOW_DAYS),
    shiftDate(referenceDate, -1),
  );
  const todayCategories = aggregateCategories(todayRows);
  const recentSmallRows = recentRows.filter(
    (row) => amountOf(row) < SMALL_PURCHASE_LIMIT,
  );
  const insights: SpendingPatternInsight[] = [];

  const topToday = todayCategories[0];
  if (topToday && topToday.amount >= 250) {
    insights.push({
      id: "today-category",
      title: `${topToday.name} is your biggest spend today`,
      detail: `You spent ${formatRand(topToday.amount)} across ${topToday.count} ${topToday.count === 1 ? "payment" : "payments"}. Review the transactions if this was unexpected.`,
      amount: topToday.amount,
      count: topToday.count,
      action: "View transactions",
    });
  }

  if (recentSmallRows.length >= 5) {
    insights.push({
      id: "small-purchases",
      title: "Small purchases are adding up",
      detail: `You made ${recentSmallRows.length} purchases under R${SMALL_PURCHASE_LIMIT} in the past week, totalling ${formatRand(sumAmounts(recentSmallRows))}.`,
      amount: sumAmounts(recentSmallRows),
      count: recentSmallRows.length,
      action: "Review small payments",
    });
  }

  const repeatedMerchant = repeatedMerchantInsight(recentRows);
  if (repeatedMerchant) insights.push(repeatedMerchant);

  const baseline = dailyBaseline(baselineRows);
  const todayTotal = sumAmounts(todayRows);
  if (baseline !== null && todayTotal > baseline * 1.5 && todayTotal >= 250) {
    insights.push({
      id: "unusual-day",
      title: "Today is higher than your usual spending",
      detail: `You spent ${formatRand(todayTotal)} today, compared with your usual daily average of ${formatRand(baseline)}.`,
      amount: todayTotal,
      count: todayRows.length,
      action: "View today's transactions",
    });
  }

  return {
    today,
    todayTotal,
    todayCount: todayRows.length,
    todayCategories,
    recentSmallPurchaseCount: recentSmallRows.length,
    recentSmallPurchaseTotal: sumAmounts(recentSmallRows),
    insights: insights.slice(0, 3),
    hasBaseline: baseline !== null,
  };
}

function spendingRowsOn(
  transactions: readonly TransactionRow[],
  date: string,
): TransactionRow[] {
  return transactions.filter((row) => isSpending(row) && row.date.slice(0, 10) === date);
}

function spendingRowsBetween(
  transactions: readonly TransactionRow[],
  start: Date,
  end: Date,
): TransactionRow[] {
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  return transactions.filter((row) => {
    const date = row.date.slice(0, 10);
    return isSpending(row) && date >= startKey && date <= endKey;
  });
}

function isSpending(row: TransactionRow): boolean {
  if (row.type !== "debit" || row.is_duplicate || !Number.isFinite(amountOf(row))) {
    return false;
  }
  if (NON_SPENDING_CLASSES.has((row.transaction_class ?? "").toLowerCase())) {
    return false;
  }
  return !REVERSAL_WORDS.test(`${row.description} ${categoryName(row)}`);
}

function amountOf(row: TransactionRow): number {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? Math.abs(amount) : Number.NaN;
}

function aggregateCategories(rows: readonly TransactionRow[]): SpendingPatternCategory[] {
  const totals = new Map<string, SpendingPatternCategory>();
  for (const row of rows) {
    const name = categoryName(row);
    const current = totals.get(name) ?? { name, amount: 0, count: 0 };
    current.amount += amountOf(row);
    current.count += 1;
    totals.set(name, current);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

function repeatedMerchantInsight(
  rows: readonly TransactionRow[],
): SpendingPatternInsight | null {
  const merchants = new Map<string, { label: string; count: number; amount: number }>();
  for (const row of rows) {
    const label = row.merchantName?.trim() || row.description.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const current = merchants.get(key) ?? { label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amountOf(row);
    merchants.set(key, current);
  }
  const repeated = [...merchants.values()]
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count || b.amount - a.amount)[0];
  if (!repeated) return null;
  return {
    id: "repeated-merchant",
    title: `${repeated.label} appears often in your recent spending`,
    detail: `You paid this merchant ${repeated.count} times in the past week, totalling ${formatRand(repeated.amount)}.`,
    amount: repeated.amount,
    count: repeated.count,
    action: "Review payments",
  };
}

function dailyBaseline(rows: readonly TransactionRow[]): number | null {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + amountOf(row));
  }
  if (totals.size < MIN_BASELINE_DAYS) return null;
  return sumNumbers([...totals.values()]) / totals.size;
}

function sumAmounts(rows: readonly TransactionRow[]): number {
  return sumNumbers(rows.map(amountOf));
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Days of history the patterns need: the recent week plus the 30-day baseline before it. */
export const SPENDING_WINDOW_DAYS = BASELINE_WINDOW_DAYS + 7;

/** If the newest transaction is older than this, "today" is not what the data shows. */
const CURRENT_DATA_MAX_AGE_DAYS = 7;

export type SpendingReference = {
  /** The day the patterns are computed for. */
  referenceDate: Date;
  /** True when the data reaches (nearly) today, so "today" is meaningful. */
  isCurrent: boolean;
};

/**
 * Choose the day to analyse from real data. Recent data is analysed as of today.
 * Older data is analysed as of its newest transaction day and is labelled that
 * way, rather than presenting stale activity as today's. No transactions: null.
 */
export function resolveSpendingReference(
  latestTransactionDate: string | null,
  now = new Date(),
): SpendingReference | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(latestTransactionDate ?? "");
  if (!match) return null;
  const latest = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(latest.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (latest >= startOfToday) {
    return { referenceDate: now, isCurrent: true };
  }
  const ageDays = Math.round((startOfToday.getTime() - latest.getTime()) / 86_400_000);
  return ageDays <= CURRENT_DATA_MAX_AGE_DAYS
    ? { referenceDate: now, isCurrent: true }
    : { referenceDate: latest, isCurrent: false };
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatRand(value: number): string {
  return `R${value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
