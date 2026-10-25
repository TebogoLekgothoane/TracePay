import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchDetectedSubscriptions } from "../api/financial-features.api";
import {
  selectUpcomingPayments,
  type UpcomingPayment,
} from "../features/dashboard/upcoming-payments";

/** Next expected charges from subscriptions TracePay has actually detected. */
export function useUpcomingPayments() {
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const id = ++requestId.current;
      const controller = new AbortController();
      setLoading(true);
      void fetchDetectedSubscriptions(controller.signal)
        .then((result) => {
          if (requestId.current !== id) return;
          setPayments(selectUpcomingPayments(result.subscriptions));
          setError(null);
        })
        .catch((caught: unknown) => {
          if (requestId.current !== id || controller.signal.aborted) return;
          setError(caught instanceof Error ? caught.message : "Could not load upcoming payments.");
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
      return () => {
        requestId.current += 1;
        controller.abort();
      };
    }, []),
  );

  return { payments, loading, error };
}
