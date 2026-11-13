import { useMemo } from "react";

import {
  buildCategoryBreakdown,
  type CategoryBreakdown,
  type CategoryMode,
} from "../features/insights/category-breakdown";
import {
  buildInsightsReport,
  type InsightsReport,
  type TrendGrain,
} from "../features/insights/insights-report";
import type { CustomRange, Period } from "../features/insights/period";
import { loadInsightsData } from "../features/transactions/transaction.service";
import { useCachedQuery } from "../lib/query-cache";

/** Real data for the whole Insights tab: totals, comparison, trends and categories. */
export function useInsightsReport(
  period: Period,
  customRange: CustomRange,
  mode: CategoryMode,
  grain: TrendGrain,
) {
  const { data, loading, error, retry } = useCachedQuery(`insights:${period}:${customRange}`, () =>
    loadInsightsData(period, customRange),
  );

  const breakdown: CategoryBreakdown | null = useMemo(
    () => (data?.range ? buildCategoryBreakdown(data.rows, mode, data.range) : null),
    [data, mode],
  );
  const report: InsightsReport | null = useMemo(
    () => (data?.range ? buildInsightsReport(data.rows, mode, data.range, grain) : null),
    [data, mode, grain],
  );

  return { data, breakdown, report, loading, error, retry };
}
