import { Redirect, router, useLocalSearchParams } from "expo-router";
import {
  Bell,
  Check,
  ChevronLeft,
  FileText,
  Lock,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorNote, goBackOr } from "../src/components/billing/BillingShell";
import { FinancialInsightsIllustration } from "../src/components/billing/FinancialInsightsIllustration";
import { Button } from "../src/components/ui/Button";
import { IconButton } from "../src/components/ui/IconButton";
import { Skeleton } from "../src/components/ui/Skeleton";
import { Input } from "../src/components/ui/Input";
import { formatCents, formatWholeRand } from "../src/features/billing/billing.format";
import { usePaymentFlow } from "../src/hooks/usePaymentFlow";
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
  const params = useLocalSearchParams<{ product?: string; resume?: string }>();
  const unlocked = Boolean(entitlements?.fullAnalysis.unlocked);
  const [selected, setSelected] = useState<BillingProduct>(
    params.product === "annual_monitoring" ? "annual_monitoring" : "full_analysis",
  );
  const [email, setEmail] = useState("");

  // Once the full analysis is owned, the only thing left to buy is monitoring.
  const product: BillingProduct = unlocked ? "annual_monitoring" : selected;
  const flow = usePaymentFlow(product);

  // Returning from Paystack's callback link, or reopening after an interrupted payment.
  const pending = entitlements?.pending.find((entry) => entry.product === product);
  useEffect(() => {
    if (params.resume === "1" && pending) void flow.resume(pending.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.resume, pending?.reference]);

  useEffect(() => {
    if (flow.phase === "success") {
      router.replace(`/billing/success?product=${product}`);
    }
  }, [flow.phase, product]);

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
  const busy = flow.phase === "starting" || flow.phase === "verifying";
  const waiting = flow.phase === "awaiting" || flow.phase === "delayed";
  const needsEmail = flow.phase === "needs_email";
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim());

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
              Unlock your{"\n"}full money analysis
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
                  borderWidth: 1,
                  borderColor: isSelected ? withAlpha(palette.primary, 0.7) : palette.border,
                }}
              >
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
                        style={{ backgroundColor: withAlpha(isSelected ? palette.primary : palette.foreground, 0.14) }}
                      >
                        <Check
                          color={isSelected ? palette.primary : palette.mutedForeground}
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

        {needsEmail ? (
          <View className="mt-4 rounded-2xl bg-card p-4">
            <Text className="mb-3 text-[13px] leading-5 text-muted-foreground">
              Paystack sends your receipt by email. Your account was set up with a phone number, so
              enter an email to use for this payment.
            </Text>
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="done"
              error={flow.message}
            />
          </View>
        ) : null}

        {flow.message && !needsEmail ? (
          <View className="mt-4">
            {flow.phase === "delayed" ? (
              <View className="rounded-2xl bg-card p-4">
                <Text className="text-[14px] leading-5 text-foreground">{flow.message}</Text>
              </View>
            ) : (
              <ErrorNote message={flow.message} />
            )}
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
        {waiting ? (
          <Button loading={busy} style={{ minHeight: 44 }} onPress={() => void flow.verify()}>
            I have paid — check status
          </Button>
        ) : needsEmail ? (
          <Button
            disabled={!emailValid}
            style={{ minHeight: 44 }}
            onPress={() => void flow.start(email.trim())}
          >
            Continue to payment
          </Button>
        ) : (
          <Button
            arrow
            disabled={!canContinue}
            loading={busy}
            style={{ minHeight: 44 }}
            onPress={() => void flow.start()}
          >
            {flow.phase === "failed" || flow.phase === "error"
              ? "Try again"
              : active.priceCents
                ? `Pay ${formatCents(active.priceCents)} securely`
                : "Pay securely"}
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
}
