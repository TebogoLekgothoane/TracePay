import { Redirect, router } from "expo-router";
import { Text, View } from "react-native";

import { BillingShell, Checklist, Panel, goBackOr } from "../../src/components/billing/BillingShell";
import { Button } from "../../src/components/ui/Button";
import { formatWholeRand } from "../../src/features/billing/billing.format";
import { useBilling } from "../../src/features/billing/billing.store";

const FEATURES = [
  "Checks statements you import or connect for new potential leaks",
  "Notifications when a new potential leak is found",
  "Updates when an existing finding changes",
  "Watches recurring charges and suspicious transaction patterns",
  "Monitoring access for the whole paid year",
];

/** Optional annual plan, offered after the once-off analysis is already unlocked. */
export default function MonitoringOfferScreen() {
  const { products, entitlements, hydrated } = useBilling();

  if (hydrated && entitlements && !entitlements.fullAnalysis.unlocked) {
    return <Redirect href="/upgrade" />;
  }
  if (entitlements?.monitoring.active) return <Redirect href={"/monitoring" as never} />;

  const plan = products?.annualMonitoring;
  const available = Boolean(plan?.available && plan.priceCents > 0);

  return (
    <BillingShell
      onBack={() => goBackOr("/(tabs)/leaks")}
      footer={
        <View>
          <Button
            arrow
            disabled={!available}
            onPress={() => router.push("/billing/checkout?product=annual_monitoring")}
          >
            Start annual monitoring
          </Button>
          <Button className="mt-1" variant="ghost" onPress={() => goBackOr("/(tabs)/leaks")}>
            Maybe later
          </Button>
        </View>
      }
    >
      <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">
        Keep TracePay working for you
      </Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
        Your one-off analysis shows what may be costing you money. Continuous monitoring helps you
        spot new issues as your financial activity changes.
      </Text>

      <Panel className="mt-6">
        {plan ? (
          <>
            <View className="flex-row items-baseline gap-2">
              <Text className="text-[34px] font-bold tracking-[-0.8px] text-foreground">
                {formatWholeRand(plan.priceCents)}
              </Text>
              <Text className="text-[15px] font-medium text-muted-foreground">per year</Text>
            </View>
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Billed once a year. Renews automatically each year until you cancel.
            </Text>
          </>
        ) : (
          <Text className="text-[14px] text-muted-foreground">Loading plan details…</Text>
        )}
      </Panel>

      {hydrated && plan && !available ? (
        <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
          Annual monitoring is not available just yet.
        </Text>
      ) : null}

      <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">What is included</Text>
      <Checklist items={FEATURES} />

      <Panel className="mt-7">
        <Text className="text-[13px] leading-5 text-muted-foreground">
          Monitoring covers the statements you import or connect to TracePay. It cannot see activity
          in accounts you have not added. Cancel before your renewal date to stop the next charge;
          you keep access until the end of the year you paid for. Your full analysis stays unlocked
          either way.
        </Text>
      </Panel>
    </BillingShell>
  );
}
