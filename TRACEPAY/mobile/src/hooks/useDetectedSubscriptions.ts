import { fetchDetectedSubscriptions } from "../api/financial-features.api";
import { useCachedQuery } from "../lib/query-cache";

/**
 * Recurring payments TracePay detected in the user's statements. One shared, cached request
 * feeds the home page, the billing calendar and the recurring payment screens.
 */
export function useDetectedSubscriptions() {
  const { data, loading, error, retry } = useCachedQuery(
    "detected-subscriptions",
    () => fetchDetectedSubscriptions(),
    { staleMs: 5 * 60_000 },
  );
  return {
    subscriptions: data?.subscriptions ?? [],
    possibleRecurringDigitalSpend: data?.possibleRecurringDigitalSpend ?? [],
    loading,
    error,
    retry,
  };
}
