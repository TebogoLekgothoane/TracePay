import { Redirect, router } from "expo-router";
import { BarChart3, Bell, FileText, Lock, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BillingShell, Checklist, ErrorNote, goBackOr } from "../src/components/billing/BillingShell";
import { Button } from "../src/components/ui/Button";
import { Skeleton } from "../src/components/ui/Skeleton";
import { formatWholeRand } from "../src/features/billing/billing.format";
import { useBilling } from "../src/features/billing/billing.store";
import type { BillingProduct } from "../src/features/billing/billing.types";
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

const HIGHLIGHTS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Bell, title: "Get notified", body: "New charges, changes and unusual activity." },
  {
    Icon: BarChart3,
    title: "Ongoing analysis",
    body: "We keep checking your transactions in the background.",
  },
  {
    Icon: ShieldCheck,
    title: "Stay in control",
    body: "Manage your subscriptions and notifications anytime.",
  },
];

type Plan = {
  product: BillingProduct;
  eyebrow: string;
  title: string;
  priceCents: number | null;
  priceNote: string;
  body: string;
  Icon: LucideIcon;
  recommended?: boolean;
};

/** Full analysis paywall: R39 once-off, or the analysis plus a year of monitoring. */
export default function UpgradeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { products, entitlements, hydrated, error, refresh } = useBilling();
  const leaks = useMemo(() => listPotentialLeaks(), []);
  const total = useMemo(() => totalMonthlyLeaks(leaks), [leaks]);
  const [selected, setSelected] = useState<BillingProduct>("annual_monitoring");

  const unlocked = Boolean(entitlements?.fullAnalysis.unlocked);
  if (unlocked && entitlements?.monitoring.active) {
    return <Redirect href={"/monitoring" as never} />;
  }

  const price = products?.fullAnalysis.priceCents ?? null;
  const ready = price !== null;
  const monitoringPlan = products?.annualMonitoring;
  const monitoringAvailable = Boolean(monitoringPlan?.available && monitoringPlan.priceCents > 0);

  const plans: Plan[] = [
    ...(unlocked
      ? []
      : [
          {
            product: "full_analysis" as const,
            eyebrow: "FULL ANALYSIS",
            title: "Unlock this analysis only",
            priceCents: price,
            priceNote: "one-time payment",
            body: "Get the complete results of your current analysis, including all findings, transaction details and explanations.",
            Icon: FileText,
          },
        ]),
    {
      product: "annual_monitoring" as const,
      eyebrow: "ANNUAL MONITORING",
      title: unlocked ? "1 year of monitoring" : "Analysis + 1 year monitoring",
      priceCents: monitoringPlan?.priceCents ?? null,
      priceNote: "per year",
      body: unlocked
        ? "Keep monitoring for new leaks, changes and unusual charges."
        : "Unlock this analysis, plus a year of monitoring for new leaks, changes and unusual charges.",
      Icon: Bell,
      recommended: true,
    },
  ];
  const active = plans.find((plan) => plan.product === selected) ?? plans[plans.length - 1];
  const canContinue = active.product === "full_analysis" || monitoringAvailable;

  return (
    <BillingShell
      onBack={() => goBackOr("/(tabs)/leaks")}
      footer={
        <View>
          <Button
            arrow
            disabled={!canContinue}
            onPress={() => router.push(`/billing/checkout?product=${active.product}`)}
          >
            {active.product === "full_analysis" ? "Unlock full analysis" : "Start annual monitoring"}
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

      <View className="mt-7 gap-3">
        {plans.map((plan) => {
          const isSelected = plan.product === active.product;
          return (
            <Pressable
              key={plan.product}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(plan.product)}
              className="rounded-3xl bg-card p-4 active:opacity-90"
              style={{
                borderWidth: isSelected ? 1.5 : 1,
                borderColor: isSelected ? palette.primary : palette.border,
              }}
            >
              {plan.recommended ? (
                <View className="absolute -top-3 right-4 rounded-lg bg-primary px-3 py-1">
                  <Text className="text-[11px] font-semibold text-primary-foreground">
                    Recommended
                  </Text>
                </View>
              ) : null}

              <View className="flex-row items-start gap-3">
                <View
                  className="mt-1 h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    borderWidth: 2,
                    borderColor: isSelected ? palette.primary : palette.border,
                  }}
                >
                  {isSelected ? (
                    <View
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: palette.primary }}
                    />
                  ) : null}
                </View>

                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-medium tracking-[1px] text-muted-foreground">
                    {plan.eyebrow}
                  </Text>
                  <Text className="mt-1 text-[18px] font-bold text-foreground">{plan.title}</Text>
                  {plan.priceCents !== null ? (
                    <View className="mt-1 flex-row items-baseline gap-2">
                      <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                        {formatWholeRand(plan.priceCents)}
                      </Text>
                      <Text className="text-[14px] text-muted-foreground">{plan.priceNote}</Text>
                    </View>
                  ) : (
                    <Skeleton width={120} height={30} radius={8} />
                  )}
                  <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
                    {plan.body}
                  </Text>
                </View>

                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <plan.Icon color={palette.foreground} size={22} strokeWidth={1.9} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-3 mt-7 text-[12px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
        Included with annual monitoring
      </Text>
      <View className="flex-row gap-3">
        {HIGHLIGHTS.map(({ Icon, title, body }) => (
          <View key={title} className="min-w-0 flex-1 items-center">
            <Icon color={palette.foreground} size={22} strokeWidth={1.9} />
            <Text className="mt-2 text-center text-[13px] font-semibold text-foreground">
              {title}
            </Text>
            <Text className="mt-1 text-center text-[11px] leading-4 text-muted-foreground">
              {body}
            </Text>
          </View>
        ))}
      </View>


      {hydrated && monitoringPlan && !monitoringAvailable && selected === "annual_monitoring" ? (
        <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
          Annual monitoring is not available just yet.
        </Text>
      ) : null}

      {hydrated && error && !ready ? (
        <View className="mt-4 gap-2">
          <ErrorNote message={error} />
          <Button variant="secondary" onPress={() => void refresh()}>
            Try again
          </Button>
        </View>
      ) : null}

      <Text className="mt-5 text-[12px] leading-[18px] text-muted-foreground">
        Annual monitoring renews each year until you cancel. It covers statements you import or
        connect, and your full analysis stays unlocked either way.
      </Text>

      <View className="mt-4 flex-row items-start gap-2.5">
        <Lock color={palette.mutedForeground} size={15} strokeWidth={2.2} />
        <Text className="min-w-0 flex-1 text-[12px] leading-[18px] text-muted-foreground">
          Payments are processed securely by Paystack. TracePay never sees or stores your card
          details.
        </Text>
      </View>
    </BillingShell>
  );
}
