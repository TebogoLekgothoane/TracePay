import { ActivityIndicator, Text, View } from "react-native";

import { Button } from "../ui/Button";
import {
  fetchLeakCounteractPlan,
  type CounteractPlan,
  type CounteractStep,
} from "../../features/guidance/finding-guidance.api";
import { useCachedQuery } from "../../lib/query-cache";

/** Keep AI plans warm across tab switches and screen revisits. */
const COUNTERACT_STALE_MS = 30 * 60_000;

function StepGroup({ title, steps }: { title: string; steps: CounteractStep[] }) {
  if (steps.length === 0) return null;
  return (
    <View className="mt-5">
      <Text className="text-[17px] font-bold text-foreground">{title}</Text>
      <View className="mt-3 gap-3">
        {steps.map((step, index) => (
          <View key={`${index}-${step.title}`} className="rounded-3xl bg-card px-4 py-4">
            <Text className="text-[15px] font-semibold text-foreground">
              {index + 1}. {step.title}
            </Text>
            <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">{step.detail}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PlanBody({ plan }: { plan: CounteractPlan }) {
  return (
    <>
      <Text className="mt-2 text-[16px] leading-6 text-muted-foreground">{plan.summary}</Text>
      {plan.potentialSaving ? (
        <View className="mt-4 rounded-2xl bg-muted px-4 py-3.5">
          <Text className="text-[14px] text-muted-foreground">Potential saving</Text>
          <Text className="mt-0.5 text-[16px] font-semibold text-foreground">
            {plan.potentialSaving}
          </Text>
        </View>
      ) : null}
      <StepGroup title="Do this now" steps={plan.actions} />
      <StepGroup title="Stop it happening again" steps={plan.prevent} />
      <Text className="mt-3 text-[12px] leading-4 text-muted-foreground">
        {plan.source === "ai"
          ? "Written by AI from this finding's summary only. TracePay can't cancel or dispute anything for you, and this isn't financial advice."
          : "AI guidance isn't available right now, so these are the standard steps."}
      </Text>
    </>
  );
}

/** The Guidance tab's plan for a live finding. Cached so revisits skip the loading flash. */
export function CounteractPlanCard({ fingerprint }: { fingerprint: string }) {
  const { data: plan, loading, error, retry } = useCachedQuery(
    `leak-counteract:${fingerprint}`,
    () => fetchLeakCounteractPlan(fingerprint),
    { staleMs: COUNTERACT_STALE_MS },
  );

  return (
    <View className="mt-2">
      <Text className="text-[22px] font-bold tracking-[-0.3px] text-foreground">
        How to counteract this
      </Text>
      {plan ? (
        <PlanBody plan={plan} />
      ) : loading ? (
        <View className="mt-4 flex-row items-center gap-3">
          <ActivityIndicator />
          <Text className="text-[14px] text-muted-foreground">Working out your next steps…</Text>
        </View>
      ) : (
        <View className="mt-3">
          <Text className="text-[14px] leading-5 text-muted-foreground">
            {error ?? "The plan could not be loaded."}
          </Text>
          <Button className="mt-3" variant="secondary" onPress={retry}>
            Try again
          </Button>
        </View>
      )}
    </View>
  );
}
