import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLeakDetections,
  LeakIntelligenceApiError,
} from "../api/leak-intelligence.api";
import { fetchAnthropicAnalysis } from "../api/anthropic-analysis.api";
import type { AnthropicAnalysis } from "../api/anthropic-analysis.api";
import type { LeakDetectionResult } from "../features/leak-intelligence/leak-intelligence.types";

export function useLeakIntelligenceDebug(enabled = true) {
  const [result, setResult] = useState<LeakDetectionResult | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AnthropicAnalysis | null>(null);
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

    void Promise.all([
      fetchLeakDetections(controller.signal),
      fetchAnthropicAnalysis(controller.signal).catch(() => null),
    ])
      .then(([next, ai]) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResult(next);
        setAiAnalysis(ai);
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

  return { result, aiAnalysis, loading, error, refresh: load };
}
