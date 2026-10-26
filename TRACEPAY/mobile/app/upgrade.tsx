import { Redirect, router } from "expo-router";
import { Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { BillingShell, Checklist, ErrorNote, Panel, goBackOr } from "../src/components/billing/BillingShell";
import { Button } from "../src/components/ui/Button";
import { Skeleton } from "../src/components/ui/Skeleton";
import { formatCents } from "../src/features/billing/billing.format";
import { useBilling } from "../src/features/billing/billing.store";
import { totalMonthlyLeaks } from "../src/features/leaks/leak-paywall";
import { listPotentialLeaks } from "../src/features/leaks/potential-leaks";
import { COLORS } from "../src/theme/colors";

const INCLUDED = [
  "See every detected leak",
  "Access full transaction details",
  "Understand why each transaction was flagged",
  "Review evidence and recommendations",
  "Access the complete results of this analysis",
];

/** Full analysis paywall: R39 once-off, no subscription. */
export default function UpgradeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { products, entitlements, hydrated, error, refresh } = useBilling();
  const leaks = useMemo(() => listPotentialLeaks(), []);
  const total = useMemo(() => totalMonthlyLeaks(leaks), [leaks]);

  if (entitlements?.fullAnalysis.unlocked) {
    return <Redirect href="/(tabs)/leaks" />;
  }

  const price = products?.fullAnalysis.priceCents ?? null;
  const ready = price !== null;

  return (
    <BillingShell
      onBack={() => goBackOr("/(tabs)/leaks")}
      footer={
        <View>
          <Button
            arrow
            onPress={() => router.push("/billing/checkout?product=full_analysis")}
          >
            Unlock full analysis
          </Button>
          <Button className="mt-1" variant="ghost" onPress={() => goBackOr("/(tabs)/leaks")}>
            Back to free preview
          </Button>
        </View>
      }
    >
      <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">
        Unlock your full money analysis
      </Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
        We found {leaks.length} potential leaks, costing an estimated {total} a month. Unlock the
        full analysis to see exactly where your money is going.
      </Text>

      <View className="mt-6">
        <Checklist items={INCLUDED} />
      </View>

      <Panel className="mt-7">
        <Text className="text-[13px] font-medium text-muted-foreground">One payment</Text>
        {ready ? (
          <View className="mt-1 flex-row items-baseline gap-2">
            <Text className="text-[34px] font-bold tracking-[-0.8px] text-foreground">
              {formatCents(price)}
            </Text>
            <Text className="text-[15px] font-medium text-muted-foreground">once-off</Text>
          </View>
        ) : (
          <View className="mt-2 gap-2">
            <Skeleton width={140} height={32} radius={8} />
          </View>
        )}
        <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Not a subscription. You pay once and keep access to this analysis.
        </Text>
      </Panel>

      {hydrated && error && !ready ? (
        <View className="mt-4 gap-2">
          <ErrorNote message={error} />
          <Button variant="secondary" onPress={() => void refresh()}>
            Try again
          </Button>
        </View>
      ) : null}

      <View className="mt-5 flex-row items-start gap-2.5">
        <Lock color={palette.mutedForeground} size={15} strokeWidth={2.2} />
        <Text className="min-w-0 flex-1 text-[12px] leading-[18px] text-muted-foreground">
          Payments are processed securely by Paystack. TracePay never sees or stores your card
          details.
        </Text>
      </View>
    </BillingShell>
  );
}
