/**
 * Everything on the Insights tab except the category list, from real rows:
 * the period total, how it compares with the period before it, daily average,
 * highest day, a daily sparkline and the trend bars.
 *
 * The comparison is always the period of equal length immediately before, so
 * "this month so far" is never set against a full month.
 */

import { dateKey, flowAmount, type CategoryMode, type PeriodRange } from "./category-breakdown";
import type { TransactionRow } from "../transactions/transaction.types";

export type TrendGrain = "By day" | "By week" | "By month";

export type TrendPoint = {
  label: string;
  current: number;
  previous: number;
};

export type InsightsReport = {
  total: number;
  previousTotal: number;
  /** Null when the earlier period has nothing to compare against. */
  changePercent: number | null;
  days: number;
  dailyAverage: number;
  peakDay: { dateKey: string; amount: number } | null;
  /** Values for the hero sparkline, oldest first (long periods are summed into ≤30 points). */
  sparkline: number[];
  trend: TrendPoint[];
};

const MAX_SPARK_POINTS = 30;
const MAX_TREND_POINTS = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key: string, days: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function daysInclusive(startKey: string, endKey: string): number {
  const ms = parseKey(endKey).getTime() - parseKey(startKey).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** The equal-length period immediately before this one. */
export function previousPeriodRange(range: Pick<PeriodRange, "startKey" | "endKey">): {
  startKey: string;
  endKey: string;
  days: number;
} {
  const days = daysInclusive(range.startKey, range.endKey);
  return {
    startKey: addDays(range.startKey, -days),
    endKey: addDays(range.startKey, -1),
    days,
  };
}

function sumDays(perDay: ReadonlyMap<string, number>, startKey: string, endKey: string): number {
  let total = 0;
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    total += perDay.get(key) ?? 0;
  }
  return total;
}

type Bucket = { label: string; startKey: string; endKey: string };

function trendBuckets(range: Pick<PeriodRange, "startKey" | "endKey">, grain: TrendGrain): Bucket[] {
  const days = daysInclusive(range.startKey, range.endKey);
  if (grain === "By day") {
    const shown = Math.min(days, 14);
    return Array.from({ length: shown }, (_, index) => {
      const key = addDays(range.endKey, index - (shown - 1));
      const date = parseKey(key);
      return {
        label: shown <= 7 ? WEEKDAYS[date.getDay()] : String(date.getDate()),
        startKey: key,
        endKey: key,
      };
    });
  }
  if (grain === "By week") {
    const buckets: Bucket[] = [];
    for (let start = range.startKey; start <= range.endKey; start = addDays(start, 7)) {
      const end = addDays(start, 6) > range.endKey ? range.endKey : addDays(start, 6);
      const date = parseKey(start);
      buckets.push({
        label: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
        startKey: start,
        endKey: end,
      });
    }
    return buckets.slice(-MAX_TREND_POINTS);
  }
  const buckets: Bucket[] = [];
  const first = parseKey(range.startKey);
  const last = parseKey(range.endKey);
  for (
    let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    cursor <= last;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const monthStart = dateKey(cursor);
    const monthEnd = dateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    buckets.push({
      label: MONTHS[cursor.getMonth()],
      startKey: monthStart < range.startKey ? range.startKey : monthStart,
      endKey: monthEnd > range.endKey ? range.endKey : monthEnd,
    });
  }
  return buckets.slice(-MAX_TREND_POINTS);
}

function downsample(values: readonly number[]): number[] {
  if (values.length <= MAX_SPARK_POINTS) return [...values];
  const size = Math.ceil(values.length / MAX_SPARK_POINTS);
  const out: number[] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size).reduce((sum, value) => sum + value, 0));
  }
  return out;
}

export function buildInsightsReport(
  rows: readonly TransactionRow[],
  mode: CategoryMode,
  range: Pick<PeriodRange, "startKey" | "endKey">,
  grain: TrendGrain,
): InsightsReport {
  const previous = previousPeriodRange(range);
  const perDay = new Map<string, number>();
  for (const row of rows) {
    const flow = flowAmount(row, mode);
    if (flow === 0) continue;
    const key = row.date.slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + flow);
  }

  const days = previous.days;
  const total = Math.max(sumDays(perDay, range.startKey, range.endKey), 0);
  const previousTotal = Math.max(sumDays(perDay, previous.startKey, previous.endKey), 0);

  let peakDay: InsightsReport["peakDay"] = null;
  const dailyValues: number[] = [];
  for (let key = range.startKey; key <= range.endKey; key = addDays(key, 1)) {
    const value = Math.max(perDay.get(key) ?? 0, 0);
    dailyValues.push(value);
    if (value > 0 && (peakDay === null || value > peakDay.amount)) {
      peakDay = { dateKey: key, amount: value };
    }
  }

  return {
    total,
    previousTotal,
    changePercent: previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null,
    days,
    dailyAverage: days > 0 ? total / days : 0,
    peakDay,
    sparkline: downsample(dailyValues),
    trend: trendBuckets(range, grain).map((bucket) => ({
      label: bucket.label,
      current: Math.max(sumDays(perDay, bucket.startKey, bucket.endKey), 0),
      previous: Math.max(
        sumDays(
          perDay,
          addDays(bucket.startKey, -days),
          addDays(bucket.endKey, -days),
        ),
        0,
      ),
    })),
  };
}

export function formatChange(report: Pick<InsightsReport, "changePercent" | "days">): string {
  if (report.changePercent === null) return "No earlier period to compare";
  const rounded = Math.round(Math.abs(report.changePercent));
  const span = report.days === 1 ? "the day before" : `the previous ${report.days} days`;
  if (rounded === 0) return `Same as ${span}`;
  return `${report.changePercent > 0 ? "↑" : "↓"} ${rounded}% vs ${span}`;
}

export function formatPeakDay(
  peak: InsightsReport["peakDay"],
  formatAmount: (value: number) => string,
): string {
  if (!peak) return "—";
  const date = parseKey(peak.dateKey);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} • ${formatAmount(peak.amount)}`;
}

export function comparisonCopy(report: Pick<InsightsReport, "days">): string {
  return report.days === 1
    ? "This day vs the day before"
    : `These ${report.days} days vs the ${report.days} days before`;
}
