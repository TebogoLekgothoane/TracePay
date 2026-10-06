import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLeakDetections,
  LeakIntelligenceApiError,
} from "../api/leak-intelligence.api";
import type { LeakDetectionResult } from "../features/leak-intelligence/leak-intelligence.types";

export function useLeakIntelligenceDebug() {
  const [result, setResult] = useState<LeakDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);

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
        setResult(null);
        setError(
          caught instanceof LeakIntelligenceApiError || caught instanceof Error
            ? caught.message
            : "Could not analyse your financial activity.",
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        controllerRef.current?.abort();
      };
    }, [load]),
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { result, loading, error, refresh: load };
}
