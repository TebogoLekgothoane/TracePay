import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  loadSpendingPatternData,
  type SpendingPatternData,
} from "../features/transactions/transaction.service";

/** Loads the real transactions behind the spending-patterns section on focus. */
export function useSpendingPatternData() {
  const [data, setData] = useState<SpendingPatternData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    void loadSpendingPatternData()
      .then((next) => {
        if (requestId.current !== id) return;
        setData(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load your spending patterns.",
        );
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  return { data, loading, error, retry: load };
}
