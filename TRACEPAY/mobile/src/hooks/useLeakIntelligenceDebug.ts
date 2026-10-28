import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLeakDetections,
  LeakIntelligenceApiError,
} from "../api/leak-intelligence.api";
import type { LeakDetectionResult } from "../features/leak-intelligence/leak-intelligence.types";

export function useLeakIntelligenceDebug(enabled = true) {
  const [result, setResult] = useState<LeakDetectionResult | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // A quiet load refreshes in the background: no spinner, the screen stays as
  // it is, and a failure leaves the current result in place.
  const load = useCallback(
    (quiet: boolean) => {
      if (!enabled) {
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = ++requestIdRef.current;
      if (!quiet) {
        setLoading(true);
      }

      void fetchLeakDetections(controller.signal)
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
          if (quiet) {
            return;
          }
          setResult(null);
          setError(
            caught instanceof LeakIntelligenceApiError ||
              caught instanceof Error
              ? caught.message
              : "Could not analyse your financial activity.",
          );
        })
        .finally(() => {
          if (requestId === requestIdRef.current && !quiet) {
            setLoading(false);
          }
        });
    },
    [enabled],
  );
  const refresh = useCallback(() => load(false), [load]);
  const refreshQuietly = useCallback(() => load(true), [load]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      load(false);
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

  return { result, loading, error, refresh, refreshQuietly };
}
