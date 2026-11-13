/**
 * The analysis behind the Insights tab's charts, all from stored transactions:
 * cash flow, cumulative spending pace against the previous period, category
 * movement, top merchants, a day-by-day calendar, weekday habits and the
 * largest single payments.
 *
 * Spending and income follow the same rules as the category breakdown
 * (duplicates and own-account transfers excluded, refunds net against spend).
 */

import { categoryName } from "../transactions/transaction.row";
import type { TransactionRow } from "../transactions/transaction.types";
import { dateKey, flowAmount, type PeriodRange } from "./category-breakdown";
import { previousPeriodRange } from "./insights-report";

type Range = Pick<PeriodRange, "startKey" | "endKey">;

const MERCHANT_MAX = 26;

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key: string, days: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function eachDay(range: Range): string[] {
  const days: string[] = [];
  for (let key = range.startKey; key <= range.endKey; key = addDays(key, 1)) days.push(key);
  return days;
}

function inRange(row: TransactionRow, range: Range): boolean {
  const day = row.date.slice(0, 10);
  return day >= range.startKey && day <= range.endKey;
}

function sumFlow(rows: readonly TransactionRow[], mode: "Spending" | "Income", range: Range): number {
  let total = 0;
  for (const row of rows) {
    if (inRange(row, range)) total += flowAmount(row, mode);
  }
  return Math.max(total, 0);
}

// --- Cash flow ---------------------------------------------------------------

export type CashFlow = {
  income: number;
  spending: number;
  net: number;
  /** Share of income kept, 0–100. Null when there was no income to measure against. */
  savingsRate: number | null;
  previousNet: number | null;
};

export function buildCashFlow(rows: readonly TransactionRow[], range: Range): CashFlow {
  const before = previousPeriodRange(range);
  const income = sumFlow(rows, "Income", range);
  const spending = sumFlow(rows, "Spending", range);
  const previousIncome = sumFlow(rows, "Income", before);
  const previousSpending = sumFlow(rows, "Spending", before);
  const hasPrevious = previousIncome > 0 || previousSpending > 0;
  return {
    income,
    spending,
    net: income - spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : null,
    previousNet: hasPrevious ? previousIncome - previousSpending : null,
  };
}

// --- Spending pace ------------------------------------------------------------

export type SpendingPace = {
  /** Cumulative spend by day of the period, same index = same day number. */
  current: number[];
  previous: number[];
  /** Day labels (day-of-month for the current period). */
  labels: string[];
  /** Expected total if the pace holds to the end of the calendar month; null when not applicable. */
  projected: number | null;
  /** Previous period's cumulative spend on the same day of the period. */
  previousAtSameDay: number;
};

function cumulative(rows: readonly TransactionRow[], range: Range): number[] {
  const perDay = new Map<string, number>();
  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const flow = flowAmount(row, "Spending");
    if (flow !== 0) perDay.set(row.date.slice(0, 10), (perDay.get(row.date.slice(0, 10)) ?? 0) + flow);
  }
  let running = 0;
  return eachDay(range).map((key) => {
    running += perDay.get(key) ?? 0;
    return Math.max(running, 0);
  });
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day number inside a month-long view; "12 Oct" once the period crosses months. */
function paceLabel(key: string, periodDays: number): string {
  const date = parseKey(key);
  return periodDays > 31 ? `${date.getDate()} ${MONTH_ABBR[date.getMonth()]}` : String(date.getDate());
}

export function buildSpendingPace(rows: readonly TransactionRow[], range: Range): SpendingPace {
  const before = previousPeriodRange(range);
  const current = cumulative(rows, range);
  const previous = cumulative(rows, before);
  const start = parseKey(range.startKey);
  const end = parseKey(range.endKey);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const startsOnFirst = start.getDate() === 1;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const partial = end.getDate() < daysInMonth;
  const elapsed = current.length;
  const spent = current[elapsed - 1] ?? 0;
  return {
    current,
    previous,
    labels: eachDay(range).map((key) => paceLabel(key, elapsed)),
    projected:
      startsOnFirst && sameMonth && partial && elapsed >= 5 && spent > 0
        ? (spent / elapsed) * daysInMonth
        : null,
    previousAtSameDay: previous[elapsed - 1] ?? 0,
  };
}

// --- Categories with movement -------------------------------------------------

export type CategoryMovement = {
  name: string;
  amount: number;
  /** Change against the previous period, in percent. Null when it had no spend there. */
  changePercent: number | null;
};

function spendByKey(
  rows: readonly TransactionRow[],
  range: Range,
  keyOf: (row: TransactionRow) => string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const flow = flowAmount(row, "Spending");
    if (flow === 0) continue;
    const key = keyOf(row);
    totals.set(key, (totals.get(key) ?? 0) + flow);
  }
  return totals;
}

export function buildCategoryMovement(
  rows: readonly TransactionRow[],
  range: Range,
  limit = 6,
): CategoryMovement[] {
  const now = spendByKey(rows, range, categoryName);
  const before = spendByKey(rows, previousPeriodRange(range), categoryName);
  return [...now.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, amount]) => {
      const earlier = before.get(name) ?? 0;
      return { name, amount, changePercent: earlier > 0 ? ((amount - earlier) / earlier) * 100 : null };
    });
}

// --- Merchants ----------------------------------------------------------------

export type MerchantSpend = { name: string; amount: number; count: number };

function merchantOf(row: TransactionRow): string {
  const named = row.merchantName?.trim();
  const label = named || row.description.replace(/\s+/g, " ").trim();
  return label.length > MERCHANT_MAX ? `${label.slice(0, MERCHANT_MAX - 1).trimEnd()}…` : label;
}

export function buildTopMerchants(
  rows: readonly TransactionRow[],
  range: Range,
  limit = 5,
): MerchantSpend[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const flow = flowAmount(row, "Spending");
    if (flow <= 0) continue;
    const name = merchantOf(row);
    const entry = totals.get(name) ?? { amount: 0, count: 0 };
    entry.amount += flow;
    entry.count += 1;
    totals.set(name, entry);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// --- Calendar and weekday habits ----------------------------------------------

export type CalendarDay = { key: string; day: number; weekday: number; amount: number };

/** Daily spend for the last `maxDays` days of the period, oldest first. */
export function buildSpendingCalendar(
  rows: readonly TransactionRow[],
  range: Range,
  maxDays = 35,
): CalendarDay[] {
  const perDay = spendByKey(rows, range, (row) => row.date.slice(0, 10));
  return eachDay(range)
    .slice(-maxDays)
    .map((key) => {
      const date = parseKey(key);
      return {
        key,
        day: date.getDate(),
        weekday: (date.getDay() + 6) % 7, // Monday = 0
        amount: Math.max(perDay.get(key) ?? 0, 0),
      };
    });
}

export type WeekdayAverage = { weekday: number; label: string; average: number };

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function buildWeekdayAverages(rows: readonly TransactionRow[], range: Range): WeekdayAverage[] {
  const perDay = spendByKey(rows, range, (row) => row.date.slice(0, 10));
  const sums = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  for (const key of eachDay(range)) {
    const weekday = (parseKey(key).getDay() + 6) % 7;
    sums[weekday] += Math.max(perDay.get(key) ?? 0, 0);
    counts[weekday] += 1;
  }
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    average: counts[weekday] > 0 ? sums[weekday] / counts[weekday] : 0,
  }));
}

// --- Largest payments ---------------------------------------------------------

export type LargePayment = { id: string; name: string; date: string; amount: number };

export function buildLargestPayments(
  rows: readonly TransactionRow[],
  range: Range,
  limit = 3,
): LargePayment[] {
  return rows
    .filter((row) => inRange(row, range) && flowAmount(row, "Spending") > 0)
    .map((row) => ({
      id: row.id,
      name: merchantOf(row),
      date: row.date.slice(0, 10),
      amount: flowAmount(row, "Spending"),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// --- What changed -------------------------------------------------------------

export type SpendingDriver = { name: string; delta: number; amount: number; previous: number };

/** The categories whose spend moved most, in rand, against the previous period. */
export function buildSpendingDrivers(
  rows: readonly TransactionRow[],
  range: Range,
  limit = 2,
  minimumDelta = 50,
): SpendingDriver[] {
  const now = spendByKey(rows, range, categoryName);
  const before = spendByKey(rows, previousPeriodRange(range), categoryName);
  const names = new Set([...now.keys(), ...before.keys()]);
  return [...names]
    .map((name) => {
      const amount = Math.max(now.get(name) ?? 0, 0);
      const previous = Math.max(before.get(name) ?? 0, 0);
      return { name, amount, previous, delta: amount - previous };
    })
    .filter((driver) => Math.abs(driver.delta) >= minimumDelta)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

// --- Plain-language takeaways -------------------------------------------------

/** A sentence split so the key figure can be shown in bold. */
export type Highlight = { id: string; before: string; strong: string; after: string };

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type HighlightInput = {
  total: number;
  pace: SpendingPace;
  weekdays: WeekdayAverage[];
  merchants: MerchantSpend[];
  largest: LargePayment[];
  cashFlow: CashFlow;
  money: (value: number) => string;
  dateLabel: (key: string) => string;
};

/**
 * Observations worth acting on, each from numbers on this screen. Nothing is
 * shown unless the data supports it, so a quiet period yields fewer lines.
 */
export function buildHighlights(input: HighlightInput): Highlight[] {
  const { total, pace, weekdays, merchants, largest, cashFlow, money, dateLabel } = input;
  const lines: Highlight[] = [];

  if (cashFlow.income > 0 && cashFlow.spending > cashFlow.income) {
    lines.push({
      id: "overspent",
      before: "You have spent ",
      strong: money(cashFlow.spending - cashFlow.income),
      after: " more than came in this period.",
    });
  }

  if (pace.projected !== null) {
    const ahead = pace.current[pace.current.length - 1] - pace.previousAtSameDay;
    lines.push({
      id: "projection",
      before: "At this pace you will spend about ",
      strong: money(pace.projected),
      after:
        Math.abs(ahead) >= 50
          ? ` this month. That is ${money(Math.abs(ahead))} ${ahead > 0 ? "more" : "less"} than by this point last time.`
          : " this month, about the same as last time.",
    });
  }

  const topDay = weekdays.reduce((best, day) => (day.average > best.average ? day : best), weekdays[0]);
  const meanDay = weekdays.reduce((sum, day) => sum + day.average, 0) / (weekdays.length || 1);
  if (topDay && topDay.average > 0 && topDay.average >= meanDay * 1.4) {
    lines.push({
      id: "weekday",
      before: `${WEEKDAY_NAMES[topDay.weekday]}s are your heaviest day, averaging `,
      strong: money(topDay.average),
      after: ".",
    });
  }

  if (merchants.length >= 3 && total > 0) {
    const share = (merchants.slice(0, 3).reduce((sum, item) => sum + item.amount, 0) / total) * 100;
    if (share >= 40) {
      lines.push({
        id: "concentration",
        before: "Your top three merchants take ",
        strong: `${Math.round(share)}%`,
        after: " of everything you spent.",
      });
    }
  }

  if (largest.length > 0 && total > 0 && largest[0].amount / total >= 0.2) {
    lines.push({
      id: "largest",
      before: `${largest[0].name} on ${dateLabel(largest[0].date)} was `,
      strong: money(largest[0].amount),
      after: `, ${Math.round((largest[0].amount / total) * 100)}% of the period.`,
    });
  }

  return lines.slice(0, 4);
}
