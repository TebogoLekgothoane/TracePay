import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FindingReview } from "../../src/components/leaks/FindingReview";
import { CounteractPlanCard } from "../../src/components/leaks/CounteractPlanCard";
import { LeakCategoryScreen } from "../../src/components/leaks/LeakCategoryScreen";
import { Button } from "../../src/components/ui/Button";
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
import { useKeptPayments } from "../../src/features/leaks/kept-payments.preferences";
import { leakMerchantKey } from "../../src/features/leaks/kept-payments";
import { KeepPaymentCard } from "../../src/components/leaks/KeepPaymentCard";
import { useLeakFindings } from "../../src/hooks/useLeakFindings";

const RECURRING_TYPES = new Set([
  "subscription_leak",
  "duplicate_streaming_leak",
  "recurring_payment_leak",
  "unknown_recurring_payment",
  "inactive_recurring_payment_leak",
]);

export default function LeakDetailScreen() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { unlocked, hydrated } = useLeakEntitlement();
  const detections = useLeakFindings(true);
  const liveLeaks = useMemo(
    () => listLivePotentialLeaks(detections.result),
    [detections.result],
  );

  if (!hydrated) return null;
  if (leakId && isLeakLocked(liveLeaks, leakId, unlocked)) {
    return <Redirect href="/(tabs)/leaks" />;
  }
  return <LeakDetailContent />;
}

function LeakDetailContent() {
  const params = useLocalSearchParams<{ id: string; view?: string; filter?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const detections = useLeakFindings(true);
  const { keep } = useKeptPayments();
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

  // A recurring payment the user may want to keep: only findings that name a merchant.
  const keepTarget = useMemo(() => {
    const raw = detections.result?.leaks.find(
      (leak) => leak.fingerprint === leakId || leak.leak_id === leakId,
    );
    if (!raw || !RECURRING_TYPES.has(raw.leak_type)) return null;
    const key = leakMerchantKey(raw);
    if (!key) return null;
    const label = raw.evidence?.merchant_display_name;
    return { key, name: typeof label === "string" && label.trim() ? label.trim() : raw.title };
  }, [detections.result, leakId]);

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
            detail: "This label is how the finding looks now.",
          },
        ]}
        icon={potential.icon}
        known={potential.known}
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
        guidanceExtra={
          <>
            <CounteractPlanCard fingerprint={leakId as string} />
            {keepTarget ? (
              <KeepPaymentCard
                name={keepTarget.name}
                kept={false}
                onToggle={() => {
                  void keep(keepTarget.key).then(() => router.back());
                }}
              />
            ) : null}
          </>
        }
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
