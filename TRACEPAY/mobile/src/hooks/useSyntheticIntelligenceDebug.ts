import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSyntheticScenarioAnalysis,
  fetchSyntheticScenarios,
  SyntheticIntelligenceApiError,
} from "../api/synthetic-intelligence.api";
import {
  clearSyntheticAnalysis,
  storeSyntheticAnalysis,
} from "../features/synthetic-intelligence/synthetic-intelligence.session";
import type {
  SyntheticScenarioAnalysis,
  SyntheticScenarioCatalog,
} from "../features/synthetic-intelligence/synthetic-intelligence.types";

export function useSyntheticIntelligenceDebug() {
  const [catalog, setCatalog] = useState<SyntheticScenarioCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SyntheticScenarioAnalysis | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalogController = useRef<AbortController | null>(null);
  const analysisController = useRef<AbortController | null>(null);
  const catalogRequest = useRef(0);
  const analysisRequest = useRef(0);
  const runningRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const loadCatalog = useCallback(() => {
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    const requestId = ++catalogRequest.current;
    setLoadingCatalog(true);
    void fetchSyntheticScenarios(controller.signal)
      .then((next) => {
        if (requestId !== catalogRequest.current) {
          return;
        }
        setCatalog(next);
        setError(null);
        const current = selectedIdRef.current;
        const nextId =
          current && next.scenarios.some((item) => item.scenario_id === current)
            ? current
            : (next.scenarios[0]?.scenario_id ?? null);
        if (nextId !== current) {
          clearSyntheticAnalysis();
          setAnalysis(null);
          selectedIdRef.current = nextId;
        }
        setSelectedId(nextId);
      })
      .catch((caught: unknown) => {
        if (requestId !== catalogRequest.current || controller.signal.aborted) {
          return;
        }
        setCatalog(null);
        setError(messageFrom(caught, "Could not load synthetic scenarios."));
      })
      .finally(() => {
        if (requestId === catalogRequest.current) {
          setLoadingCatalog(false);
        }
      });
  }, []);

  const selectScenario = useCallback((scenarioId: string) => {
    if (selectedIdRef.current !== scenarioId) {
      clearSyntheticAnalysis();
      setAnalysis(null);
      selectedIdRef.current = scenarioId;
      setSelectedId(scenarioId);
    }
    setError(null);
  }, []);

  const runAnalysis = useCallback(() => {
    if (!selectedId || runningRef.current) {
      return;
    }
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    const requestId = ++analysisRequest.current;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    void fetchSyntheticScenarioAnalysis(selectedId, controller.signal)
      .then((next) => {
        if (requestId !== analysisRequest.current) {
          return;
        }
        storeSyntheticAnalysis(next);
        setAnalysis(next);
      })
      .catch((caught: unknown) => {
        if (requestId !== analysisRequest.current || controller.signal.aborted) {
          return;
        }
        clearSyntheticAnalysis();
        setAnalysis(null);
        setError(messageFrom(caught, "Could not run the synthetic scenario."));
      })
      .finally(() => {
        if (requestId === analysisRequest.current) {
          runningRef.current = false;
          setRunning(false);
        }
      });
  }, [selectedId]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
      return () => {
        catalogController.current?.abort();
        analysisController.current?.abort();
      };
    }, [loadCatalog]),
  );

  useEffect(
    () => () => {
      catalogController.current?.abort();
      analysisController.current?.abort();
    },
    [],
  );

  const selected =
    catalog?.scenarios.find((item) => item.scenario_id === selectedId) ?? null;

  return {
    catalog,
    selected,
    analysis,
    loadingCatalog,
    running,
    error,
    refreshCatalog: loadCatalog,
    selectScenario,
    runAnalysis,
  };
}

function messageFrom(caught: unknown, fallback: string): string {
  return caught instanceof SyntheticIntelligenceApiError || caught instanceof Error
    ? caught.message
    : fallback;
}
