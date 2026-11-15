import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FindingReview } from "../../src/components/leaks/FindingReview";
import { LeakCategoryScreen } from "../../src/components/leaks/LeakCategoryScreen";
import { Button } from "../../src/components/ui/Button";
import type { ActionType } from "../../src/features/guidance/finding-guidance.model";
import {
  readLeakResponse,
  saveLeakResponse,
  type StoredLeakResponse,
} from "../../src/features/leaks/leak-response.store";
import { useLeakEntitlement } from "../../src/features/leaks/leak-entitlement.store";
import { isLeakLocked } from "../../src/features/leaks/leak-paywall";
import { LEAK_DETAILS } from "../../src/features/leaks/leak-details";
import {
  listLivePotentialLeaks,
  potentialLeakFromDetection,
} from "../../src/features/leaks/potential-leaks.live";
import {
  getFixRoute,
  getPrimaryFixActionId,
} from "../../src/features/leaks/fixContent";
import { useLeakIntelligenceDebug } from "../../src/hooks/useLeakIntelligenceDebug";

export default function LeakDetailScreen() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { unlocked, hydrated } = useLeakEntitlement();
  const detections = useLeakIntelligenceDebug(true);
  const liveLeaks = useMemo(
    () => listLivePotentialLeaks(detections.result),
    [detections.result],
  );

  if (!hydrated) return null;
  if (leakId && isLeakLocked(liveLeaks, leakId, unlocked)) {
    return <Redirect href="/upgrade" />;
  }
  return <LeakDetailContent />;
}

function LeakDetailContent() {
  const params = useLocalSearchParams<{ id: string; view?: string; filter?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const detections = useLeakIntelligenceDebug(true);
  const isCategory = Boolean(leakId && LEAK_DETAILS[leakId]);

  const potential = useMemo(() => {
    if (!leakId || isCategory) return null;
    const fromList = listLivePotentialLeaks(detections.result).find((entry) => entry.id === leakId);
    if (fromList) return fromList;
    const raw = detections.result?.leaks.find(
      (leak) => leak.fingerprint === leakId || leak.leak_id === leakId,
    );
    return raw ? potentialLeakFromDetection(raw) : null;
  }, [detections.result, isCategory, leakId]);

  const [response, setResponse] = useState<StoredLeakResponse | null>(null);
  const [savingResponse, setSavingResponse] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!leakId || !potential) return;
    let active = true;
    void readLeakResponse(leakId).then((value) => {
      if (active) setResponse(value);
    });
    return () => {
      active = false;
    };
  }, [leakId, potential]);

  const onSaveResponse = useCallback(
    async (action: ActionType, note: string) => {
      if (!leakId || savingResponse) return false;
      setSavingResponse(true);
      setSaveError(null);
      try {
        const saved = await saveLeakResponse(leakId, action, note);
        setResponse(saved);
        return true;
      } catch (caught) {
        setSaveError(
          caught instanceof Error ? caught.message : "The response could not be saved.",
        );
        return false;
      } finally {
        setSavingResponse(false);
      }
    },
    [leakId, savingResponse],
  );

  const openGuide = (targetLeakId: string) => {
    const actionId = getPrimaryFixActionId(targetLeakId);
    if (!actionId) return;
    router.push(getFixRoute(targetLeakId, actionId) as never);
  };

  if (isCategory && leakId) {
    return (
      <LeakCategoryScreen
        categoryKey={leakId}
        result={detections.result}
        loading={detections.loading}
        error={detections.error}
        onRetry={detections.refresh}
      />
    );
  }

  if (potential) {
    return (
      <FindingReview
        amount={potential.amount}
        evidence={potential.evidence}
        history={[
          {
            title: "Status",
            detail:
              "This label is how the finding looks now. Saving a response does not change it.",
          },
        ]}
        icon={potential.icon}
        known={potential.known}
        response={response}
        saveError={saveError}
        saving={savingResponse}
        status={potential.status}
        steps={potential.steps}
        subtitle={potential.subtitle}
        title={potential.title}
        transactions={potential.transactions}
        uncertain={potential.uncertain}
        nextCharge={potential.nextCharge}
        why={potential.why}
        onOpenGuide={
          potential.relatedLeakId
            ? () => openGuide(potential.relatedLeakId as string)
            : undefined
        }
        onSave={onSaveResponse}
      />
    );
  }

  return (
    <SafeAreaView
      className="flex-1 items-center justify-center bg-background px-5"
      edges={["top"]}
    >
      <Text className="text-center text-[16px] font-semibold text-foreground">
        {detections.loading ? "Loading your findings…" : "This leak could not be found."}
      </Text>
      {!detections.loading ? (
        <Button className="mt-4" onPress={() => router.back()}>
          Go back
        </Button>
      ) : null}
    </SafeAreaView>
  );
}
