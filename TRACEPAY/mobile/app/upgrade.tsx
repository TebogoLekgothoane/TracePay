import { Redirect, router } from "expo-router";
import {
  Bell,
  Check,
  ChevronLeft,
  FileText,
  Lock,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FinancialInsightsIllustration } from "../src/components/billing/FinancialInsightsIllustration";
import { ErrorNote, goBackOr } from "../src/components/billing/BillingShell";
import { Button } from "../src/components/ui/Button";
import { IconButton } from "../src/components/ui/IconButton";
import { Skeleton } from "../src/components/ui/Skeleton";
import { formatWholeRand } from "../src/features/billing/billing.format";
import { useBilling } from "../src/features/billing/billing.store";
import type { BillingProduct } from "../src/features/billing/billing.types";
import { totalMonthlyLeaks } from "../src/features/leaks/leak-paywall";
import { listPotentialLeaks } from "../src/features/leaks/potential-leaks";
import { COLORS, withAlpha } from "../src/theme/colors";

type Plan = {
  product: BillingProduct;
  title: string;
  priceCents: number | null;
  priceNote: string;
  body: string;
  features: readonly string[];
  Icon: LucideIcon;
};

const FULL_FEATURES = [
  "See all detected leaks",
  "View transaction details",
  "Understand why flagged",
  "Review recommendations",
] as const;

const MONITORING_FEATURES = [
  "Everything in full analysis",
  "Monitor new transactions",
  "Get alerts for new leaks",
  "Track price changes",
  "Ongoing financial insights",
] as const;

/** Plan picker: once-off full analysis, or ongoing annual monitoring. */
export default function UpgradeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { products, entitlements, hydrated, error, refresh } = useBilling();
  const total = useMemo(() => totalMonthlyLeaks(listPotentialLeaks()), []);
  const [selected, setSelected] = useState<BillingProduct>("full_analysis");

  const unlocked = Boolean(entitlements?.fullAnalysis.unlocked);
  if (unlocked && entitlements?.monitoring.active) {
    return <Redirect href={"/monitoring" as never} />;
  }

  const monitoringPlan = products?.annualMonitoring;
  const monitoringAvailable = Boolean(monitoringPlan?.available && monitoringPlan.priceCents > 0);

  const plans: Plan[] = [
    ...(unlocked
      ? []
      : [
          {
            product: "full_analysis" as const,
            title: "Full Money Autopsy",
            priceCents: products?.fullAnalysis.priceCents ?? null,
            priceNote: "Once-off",
            body: "Unlock the complete results of your current analysis.",
            features: FULL_FEATURES,
            Icon: FileText,
          },
        ]),
    {
      product: "annual_monitoring" as const,
      title: "Annual Monitoring",
      priceCents: monitoringPlan?.priceCents ?? null,
      priceNote: "Per year",
      body: unlocked
        ? "Ongoing monitoring for new leaks and changes."
        : "Get the full analysis plus ongoing monitoring for new leaks and changes.",
      features: MONITORING_FEATURES,
      Icon: Bell,
    },
  ];

  const active = plans.find((plan) => plan.product === selected) ?? plans[0];
  const canContinue = active.product === "full_analysis" || monitoringAvailable;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="px-5 pt-1">
        <IconButton
          accessibilityLabel="Go back"
          className="self-start"
          variant="muted"
          onPress={() => goBackOr("/(tabs)/leaks")}
        >
          <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mt-2 text-center text-[28px] font-bold leading-[34px] tracking-[-0.5px] text-foreground">
          {unlocked ? (
            "Keep TracePay working for you"
          ) : (
            <>
              Unlock your{"\n"}full <Text className="text-primary">money analysis</Text>
            </>
          )}
        </Text>
        <Text className="mt-3 px-3 text-center text-[14px] leading-5 text-muted-foreground">
          {unlocked
            ? "Monitoring helps you spot new issues as your financial activity changes."
            : "We found potential leaks in your transactions. Choose a plan to see the full results and keep track of your money."}
        </Text>

        <View className="mt-5">
          <FinancialInsightsIllustration total={total} />
        </View>

        <View className="mt-9 flex-row gap-3">
          {plans.map((plan) => {
            const isSelected = plan.product === active.product;
            return (
              <Pressable
                key={plan.product}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelected(plan.product)}
                className="min-w-0 flex-1 rounded-3xl bg-card p-4 active:opacity-90"
                style={{
                  borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected ? palette.primary : palette.border,
                }}
              >
                {isSelected ? (
                  <View
                    className="absolute h-[36px] w-[36px] items-center justify-center rounded-full"
                    style={{
                      right: 12,
                      top: -18,
                      backgroundColor: palette.primary,
                      borderWidth: 2,
                      borderColor: palette.background,
                    }}
                  >
                    <Check color="#FFFFFF" size={20} strokeWidth={3} />
                  </View>
                ) : null}

                <Text className="mt-1 text-[15px] font-semibold text-foreground">{plan.title}</Text>
                {plan.priceCents !== null ? (
                  <Text className="mt-1 text-[30px] font-bold tracking-[-0.6px] text-foreground">
                    {formatWholeRand(plan.priceCents)}
                  </Text>
                ) : (
                  <View className="mt-2">
                    <Skeleton width={90} height={28} radius={8} />
                  </View>
                )}
                <Text className="mt-0.5 text-[12px] text-muted-foreground">{plan.priceNote}</Text>
                <Text className="mt-3 text-[12px] leading-[18px] text-muted-foreground">
                  {plan.body}
                </Text>

                <View className="mt-4 gap-2.5 border-t border-border/60 pt-4">
                  {plan.features.map((feature) => (
                    <View key={feature} className="flex-row items-start gap-2">
                      <View
                        className="mt-px h-[18px] w-[18px] items-center justify-center rounded-full"
                        style={{ backgroundColor: isSelected ? palette.primary : withAlpha(palette.foreground, 0.16) }}
                      >
                        <Check
                          color={isSelected ? "#FFFFFF" : palette.mutedForeground}
                          size={11}
                          strokeWidth={3.2}
                        />
                      </View>
                      <Text className="min-w-0 flex-1 text-[12px] leading-[17px] text-foreground">
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {hydrated && monitoringPlan && !monitoringAvailable && selected === "annual_monitoring" ? (
          <Text className="mt-3 text-center text-[13px] leading-5 text-muted-foreground">
            Annual monitoring is not available just yet.
          </Text>
        ) : null}

        {hydrated && error && !products ? (
          <View className="mt-4 gap-2">
            <ErrorNote message={error} />
            <Button variant="secondary" onPress={() => void refresh()}>
              Try again
            </Button>
          </View>
        ) : null}

        <View className="mt-5 flex-row items-start justify-center gap-2">
          <Lock color={palette.mutedForeground} size={13} strokeWidth={2.2} />
          <Text className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
            Payments are processed securely by Paystack. Annual monitoring renews each year until you
            cancel.
          </Text>
        </View>
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button
          arrow
          disabled={!canContinue}
          style={{ minHeight: 44 }}
          onPress={() => router.push(`/billing/checkout?product=${active.product}`)}
        >
          Continue
        </Button>
      </View>
    </SafeAreaView>
  );
}
