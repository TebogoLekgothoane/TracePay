import { fetchDetectedSubscriptions } from "../api/financial-features.api";
import { selectUpcomingPayments } from "../features/dashboard/upcoming-payments";
import { useCachedQuery } from "../lib/query-cache";

/** Next expected charges from subscriptions TracePay has actually detected. */
export function useUpcomingPayments() {
  const { data, loading, error } = useCachedQuery(
    "upcoming-payments",
    async () => selectUpcomingPayments((await fetchDetectedSubscriptions()).subscriptions),
    { staleMs: 5 * 60_000 },
  );
  return { payments: data ?? [], loading, error };
}
