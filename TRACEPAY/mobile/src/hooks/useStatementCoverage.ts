import { fetchStatementCoverage } from "../api/statement-coverage.api";
import { useCachedQuery } from "../lib/query-cache";

/** Which accounts and periods the uploaded statements cover. */
export function useStatementCoverage(enabled = true) {
  const { data, loading, error, retry } = useCachedQuery("coverage", () => fetchStatementCoverage(), {
    enabled,
  });
  return { coverage: data, loading, error, reload: retry };
}
