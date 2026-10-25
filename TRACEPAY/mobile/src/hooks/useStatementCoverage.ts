import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchStatementCoverage } from "../api/statement-coverage.api";
import type { StatementCoverage } from "../features/statement-coverage/statement-coverage.types";

/** Loads which accounts and periods the uploaded statements cover, on focus. */
export function useStatementCoverage(enabled = true) {
  const [coverage, setCoverage] = useState<StatementCoverage | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    void fetchStatementCoverage(controller.signal)
      .then((next) => {
        if (requestId !== requestIdRef.current) return;
        setCoverage(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load your statement coverage.",
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => controllerRef.current?.abort();
    }, [load]),
  );

  return { coverage, loading, error, reload: load };
}
