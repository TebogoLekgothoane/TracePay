import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import {
  loadFinancialOverview,
  type FinancialOverview,
} from "../features/analytics/financial-overview.service";

export function useFinancialOverview(accountId?: string | null) {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void loadFinancialOverview(accountId)
      .then((next) => {
        setOverview(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setOverview(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load your financial overview.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { overview, loading, error, retry: load };
}
