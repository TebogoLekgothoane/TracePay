import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchFinancialRecommendations,
  FinancialRecommendationsApiError,
} from "../api/financial-recommendations.api";
import type { FinancialRecommendationResult } from "../features/financial-recommendations/financial-recommendations.types";

export function useFinancialRecommendationsDebug() {
  const [result, setResult] = useState<FinancialRecommendationResult | null>(null);
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

    void fetchFinancialRecommendations(controller.signal)
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
          caught instanceof FinancialRecommendationsApiError || caught instanceof Error
            ? caught.message
            : "Could not load recommendations.",
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
