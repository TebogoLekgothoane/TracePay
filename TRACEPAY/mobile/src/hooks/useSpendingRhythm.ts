import { useMemo } from "react";

import {
  buildSpendingRhythm,
  type RhythmSpan,
  type SpendingRhythm,
} from "../features/dashboard/spending-rhythm";
import { loadSpendingRhythmData } from "../features/transactions/transaction.service";
import { useCachedQuery } from "../lib/query-cache";

/** Real month-by-month spending for the home screen chart. */
export function useSpendingRhythm(span: RhythmSpan) {
  const { data, loading, error, retry } = useCachedQuery(`rhythm:${span}`, () =>
    loadSpendingRhythmData(span),
  );

  const rhythm: SpendingRhythm | null = useMemo(
    () => (data?.referenceDate ? buildSpendingRhythm(data.rows, span, data.referenceDate) : null),
    [data, span],
  );

  return { data, rhythm, loading, error, retry };
}
