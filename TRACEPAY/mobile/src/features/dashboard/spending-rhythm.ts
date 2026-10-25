/**
 * Spending rhythm: month-by-month spending for the chosen number of months,
 * each month set beside the same month one span earlier ("last period").
 * Built from real rows with the same rules as the Insights tab (duplicates and
 * own-account transfers excluded, refunds netted off).
 */

import { dateKey, flowAmount } from "../insights/category-breakdown";
import type { TransactionRow } from "../transactions/transaction.types";

export const RHYTHM_SPANS = ["3 months", "6 months", "12 months"] as const;
export type RhythmSpan = (typeof RHYTHM_SPANS)[number];

export function rhythmMonths(span: RhythmSpan): number {
  return span === "3 months" ? 3 : span === "12 months" ? 12 : 6;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type RhythmPoint = {
  label: string;
  monthKey: string;
  current: number;
  previous: number;
};

export type RhythmComparison = {
  /** Spending so far this month. */
  monthToDate: number;
  /** Spending over the same days of the month before. */
  previousMonthToDate: number;
  /** Null when the month before has nothing to compare. */
  changePercent: number | null;
  difference: number;
};

export type SpendingRhythm = {
  points: RhythmPoint[];
  comparison: RhythmComparison;
  /** Top of the y axis, rounded up to a clean number. */
  axisMax: number;
};

/** First day of the earliest month the rhythm needs (current span plus the span before). */
export function rhythmStartKey(span: RhythmSpan, reference: Date): string {
  const months = rhythmMonths(span);
  return dateKey(new Date(reference.getFullYear(), reference.getMonth() - (months * 2 - 1), 1));
}

function monthKeyOf(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function niceAxisMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export function buildSpendingRhythm(
  rows: readonly TransactionRow[],
  span: RhythmSpan,
  reference: Date,
): SpendingRhythm {
  const months = rhythmMonths(span);
  const perMonth = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const row of rows) {
    const flow = flowAmount(row, "Spending");
    if (flow === 0) continue;
    const day = row.date.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + flow);
    perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + flow);
  }

  const year = reference.getFullYear();
  const month = reference.getMonth();
  const points: RhythmPoint[] = Array.from({ length: months }, (_, index) => {
    const offset = index - (months - 1);
    const date = new Date(year, month + offset, 1);
    const key = monthKeyOf(year, month + offset);
    return {
      label: MONTHS[date.getMonth()],
      monthKey: key,
      current: Math.max(perMonth.get(key) ?? 0, 0),
      previous: Math.max(perMonth.get(monthKeyOf(year, month + offset - months)) ?? 0, 0),
    };
  });

  // Fair comparison: this month so far against the same days of last month.
  const dayOfMonth = reference.getDate();
  const sumDays = (monthIndex: number): number => {
    let total = 0;
    const days = new Date(year, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= Math.min(dayOfMonth, days); day += 1) {
      total += perDay.get(dateKey(new Date(year, monthIndex, day))) ?? 0;
    }
    return Math.max(total, 0);
  };
  const monthToDate = sumDays(month);
  const previousMonthToDate = sumDays(month - 1);

  const peak = Math.max(0, ...points.flatMap((point) => [point.current, point.previous]));
  return {
    points,
    axisMax: niceAxisMax(peak),
    comparison: {
      monthToDate,
      previousMonthToDate,
      difference: monthToDate - previousMonthToDate,
      changePercent:
        previousMonthToDate > 0
          ? ((monthToDate - previousMonthToDate) / previousMonthToDate) * 100
          : null,
    },
  };
}

/** `R2.5K`, `R10K`, `R0` — compact labels for the y axis. */
export function formatAxisAmount(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `R${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return `R${Math.round(value)}`;
}
