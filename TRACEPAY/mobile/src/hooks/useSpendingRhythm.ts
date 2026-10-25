import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  buildSpendingRhythm,
  type RhythmSpan,
  type SpendingRhythm,
} from "../features/dashboard/spending-rhythm";
import {
  loadSpendingRhythmData,
  type SpendingRhythmData,
} from "../features/transactions/transaction.service";

/** Real month-by-month spending for the home screen chart. */
export function useSpendingRhythm(span: RhythmSpan) {
  const [data, setData] = useState<SpendingRhythmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    void loadSpendingRhythmData(span)
      .then((next) => {
        if (requestId.current !== id) return;
        setData(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (requestId.current !== id) return;
        setError(caught instanceof Error ? caught.message : "Could not load your spending.");
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [span]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  const rhythm: SpendingRhythm | null = useMemo(
    () =>
      data?.referenceDate ? buildSpendingRhythm(data.rows, span, data.referenceDate) : null,
    [data, span],
  );

  return { data, rhythm, loading, error, retry: load };
}
