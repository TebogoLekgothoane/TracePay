import { useMemo } from "react";

import { selectUpcomingPayments } from "../features/dashboard/upcoming-payments";
import { useDetectedSubscriptions } from "./useDetectedSubscriptions";

/** Next expected charges from subscriptions TracePay has actually detected. */
export function useUpcomingPayments() {
  const { subscriptions, loading, error } = useDetectedSubscriptions();
  const payments = useMemo(() => selectUpcomingPayments(subscriptions), [subscriptions]);
  return { payments, loading, error };
}
