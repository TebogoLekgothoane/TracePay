import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAnthropicAnalysis } from "../api/anthropic-analysis.api";
import type { AnthropicAnalysis } from "../api/anthropic-analysis.api";

/** Anthropic analysis that only runs when `run` is called, never on mount or focus. */
export function useAnthropicAnalysisOnDemand() {
  const [analysis, setAnalysis] = useState<AnthropicAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    void fetchAnthropicAnalysis(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setAnalysis(next);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "AI analysis failed.");
      })
      .finally(() => {
        if (controllerRef.current === controller) setLoading(false);
      });
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { analysis, loading, error, run };
}
