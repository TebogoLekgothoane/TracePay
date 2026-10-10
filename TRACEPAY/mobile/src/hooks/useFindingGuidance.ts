import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import {
  fetchFindingGuidance,
  recordFindingAction,
} from "../features/guidance/finding-guidance.api";
import {
  isFindingId,
  type ActionType,
  type FindingGuidance,
} from "../features/guidance/finding-guidance.model";

export function useFindingGuidance(findingId: string) {
  const [guidance, setGuidance] = useState<FindingGuidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const current = requestId.current + 1;
    requestId.current = current;
    abortRef.current?.abort();
    if (!isFindingId(findingId)) {
      setGuidance(null);
      setError("That finding was not found.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchFindingGuidance(findingId, controller.signal);
      if (requestId.current === current) {
        setGuidance(next);
      }
    } catch (caught) {
      if (controller.signal.aborted || requestId.current !== current) {
        return;
      }
      setGuidance(null);
      setError(caught instanceof Error ? caught.message : "Finding guidance could not be loaded.");
    } finally {
      if (requestId.current === current) {
        setLoading(false);
      }
    }
  }, [findingId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestId.current += 1;
        abortRef.current?.abort();
      };
    }, [load]),
  );

  const record = useCallback(
    async (actionType: ActionType, note: string | null): Promise<boolean> => {
      if (savingRef.current || !isFindingId(findingId)) {
        return false;
      }
      savingRef.current = true;
      setSaving(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const next = await recordFindingAction(findingId, actionType, note, controller.signal);
        if (controller.signal.aborted) {
          return false;
        }
        setGuidance(next);
        return true;
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "The response could not be saved.");
        }
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [findingId],
  );

  return { guidance, loading, saving, error, retry: load, record };
}
