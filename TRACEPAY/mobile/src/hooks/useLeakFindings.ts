import { useMemo } from "react";

import { withoutKept } from "../features/leaks/kept-payments";
import { useKeptPayments } from "../features/leaks/kept-payments.preferences";
import { useLeakIntelligenceDebug } from "./useLeakIntelligenceDebug";

/**
 * The live detections as the user sees them: payments they said they use are taken out, so they
 * are not counted or listed as leaks. Debug screens keep using the raw hook.
 */
export function useLeakFindings(enabled = true) {
  const detections = useLeakIntelligenceDebug(enabled);
  const { kept } = useKeptPayments();
  const result = useMemo(() => withoutKept(detections.result, kept), [detections.result, kept]);
  return { ...detections, result };
}
