import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchFinancialReasoning,
  FinancialReasoningApiError,
} from "../api/financial-reasoning.api";
import type { FinancialReasoningResult } from "../features/financial-reasoning/financial-reasoning.types";

export function useFinancialReasoningDebug() {
  const [result, setResult] = useState<FinancialReasoningResult | null>(null);
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

    void fetchFinancialReasoning(controller.signal)
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
          caught instanceof FinancialReasoningApiError || caught instanceof Error
            ? caught.message
            : "Could not load financial reasoning.",
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
