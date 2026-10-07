import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";

import {
  isSyntheticDebugSource,
  readSyntheticAnalysis,
} from "../features/synthetic-intelligence/synthetic-intelligence.session";
import type { SyntheticScenarioAnalysis } from "../features/synthetic-intelligence/synthetic-intelligence.types";

export function useStoredSyntheticAnalysis() {
  const params = useLocalSearchParams<{ source?: string | string[] }>();
  const active = isSyntheticDebugSource(params.source);
  const [analysis, setAnalysis] = useState<SyntheticScenarioAnalysis | null>(() =>
    active ? readSyntheticAnalysis() : null,
  );

  useFocusEffect(
    useCallback(() => {
      setAnalysis(active ? readSyntheticAnalysis() : null);
    }, [active]),
  );

  return { active, analysis: active ? analysis : null };
}
