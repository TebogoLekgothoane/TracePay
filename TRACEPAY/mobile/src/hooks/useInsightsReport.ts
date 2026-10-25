import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";

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
import { loadInsightsData, type InsightsData } from "../features/transactions/transaction.service";

/** Real data for the whole Insights tab: totals, comparison, trends and categories. */
export function useInsightsReport(
  period: Period,
  customRange: CustomRange,
  mode: CategoryMode,
  grain: TrendGrain,
) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    void loadInsightsData(period, customRange)
      .then((next) => {
        if (requestId.current !== id) return;
        setData(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setError(caught instanceof Error ? caught.message : "Could not load your insights.");
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [period, customRange]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  const breakdown: CategoryBreakdown | null = useMemo(
    () => (data?.range ? buildCategoryBreakdown(data.rows, mode, data.range) : null),
    [data, mode],
  );
  const report: InsightsReport | null = useMemo(
    () => (data?.range ? buildInsightsReport(data.rows, mode, data.range, grain) : null),
    [data, mode, grain],
  );

  return { data, breakdown, report, loading, error, retry: load };
}
