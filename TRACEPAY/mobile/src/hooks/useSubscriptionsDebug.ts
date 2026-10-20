import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchDetectedSubscriptions,
  SubscriptionsDebugApiError,
} from "../api/financial-features.api";
import type { SubscriptionsDebugResult } from "../features/subscriptions-debug/subscriptions.types";

export function useSubscriptionsDebug(enabled = true) {
  const [result, setResult] = useState<SubscriptionsDebugResult | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    if (!enabled) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);

    void fetchDetectedSubscriptions(controller.signal)
      .then((next) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResult(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) {
          return;
        }
        setResult(null);
        setError(
          caught instanceof SubscriptionsDebugApiError || caught instanceof Error
            ? caught.message
            : "Could not analyse subscriptions from your statements.",
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      load();
      return () => {
        controllerRef.current?.abort();
      };
    }, [enabled, load]),
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { result, loading, error, refresh: load };
}
