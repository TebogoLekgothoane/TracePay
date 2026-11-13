import { loadSpendingPatternData } from "../features/transactions/transaction.service";
import { useCachedQuery } from "../lib/query-cache";

/** The real transactions behind the spending-patterns figures, kept warm between visits. */
export function useSpendingPatternData() {
  const { data, loading, error, retry } = useCachedQuery("patterns", () => loadSpendingPatternData());
  return { data, loading, error, retry };
}
