import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLeakDetections,
  LeakIntelligenceApiError,
} from "../api/leak-intelligence.api";
import type { LeakDetectionResult } from "../features/leak-intelligence/leak-intelligence.types";

/**
 * The analysis is slow (about 20s) and the server allows 20 calls per 15
 * minutes, so every screen shares one result and one in-flight request. Moving
 * between screens reuses a recent result; Refresh and answering a question
 * always fetch a new one.
 */
const FRESH_MS = 2 * 60_000;

let cached: { result: LeakDetectionResult; at: number } | null = null;
let inFlight: Promise<LeakDetectionResult> | null = null;

/** Drop the shared result, e.g. after new transactions are saved. */
export function invalidateLeakDetections(): void {
  cached = null;
}

function fetchShared(force: boolean): Promise<LeakDetectionResult> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) {
    return Promise.resolve(cached.result);
  }
  // No abort signal: the server finishes the work anyway, so let the next screen use it.
  inFlight ??= fetchLeakDetections(undefined, force)
    .then((result) => {
      cached = { result, at: Date.now() };
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useLeakIntelligenceDebug(enabled = true) {
  const [result, setResult] = useState<LeakDetectionResult | null>(
    enabled && cached ? cached.result : null,
  );
  const [loading, setLoading] = useState(enabled && !cached);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const activeRef = useRef(true);

  // A quiet load refreshes in the background: no spinner, the screen stays as
  // it is, and a failure leaves the current result in place.
  const load = useCallback(
    (quiet: boolean, force: boolean) => {
      if (!enabled) {
        return;
      }
      const requestId = ++requestIdRef.current;
      const showSpinner = !quiet && !(!force && cached && Date.now() - cached.at < FRESH_MS);
      if (showSpinner) {
        setLoading(true);
      }

      void fetchShared(force)
        .then((next) => {
          if (!activeRef.current || requestId !== requestIdRef.current) {
            return;
          }
          setResult(next);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!activeRef.current || requestId !== requestIdRef.current || quiet) {
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
          if (activeRef.current && requestId === requestIdRef.current && showSpinner) {
            setLoading(false);
          }
        });
    },
    [enabled],
  );
  const refresh = useCallback(() => load(false, true), [load]);
  const refreshQuietly = useCallback(() => load(true, true), [load]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      load(false, false);
    }, [enabled, load]),
  );

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  return { result, loading, error, refresh, refreshQuietly };
}
