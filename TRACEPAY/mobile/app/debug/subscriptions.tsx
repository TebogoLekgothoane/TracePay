import { Redirect, router } from "expo-router";
import { ChevronDown, ChevronLeft, Repeat, RefreshCw } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { SimpleBrandLogo } from "../../src/components/ui/SimpleBrandLogo";
import { resolveBrandIcon } from "../../src/features/brands/simple-brand-icons";
import {
  formatIntervalDays,
  formatMonthlyEstimate,
  formatSubscriptionsSummary,
} from "../../src/features/subscriptions-debug/subscriptions.format";
import { subscriptionsFromLeakDetections } from "../../src/features/subscriptions-debug/subscriptions.parse";
import type { DetectedSubscription } from "../../src/features/subscriptions-debug/subscriptions.types";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { catalogLogoUrl, resolveCatalogLogo } from "../../src/features/transactions/merchant-logos";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { useSubscriptionsDebug } from "../../src/hooks/useSubscriptionsDebug";
import { COLORS } from "../../src/theme/colors";

/**
 * Your subscriptions, as the subscriptions list would show them: what each costs,
 * when it is next due, and whether the last payment went through.
 */
export default function SubscriptionsDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <SubscriptionsDebugScreen />;
}

const STATUS_CHIPS: Record<string, { label: string; container: string; text: string }> = {
  active: { label: "Active", container: "bg-primary/10", text: "text-primary" },
  late: { label: "Late", container: "bg-muted", text: "text-muted-foreground" },
  failed_recently: { label: "Payment failed", container: "bg-destructive/10", text: "text-destructive" },
  ended: { label: "Ended", container: "bg-muted", text: "text-muted-foreground" },
};

function SubscriptionsDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useSubscriptionsDebug(!synthetic.active);
  const result = useMemo(() => {
    if (synthetic.active) {
      return synthetic.analysis?.leaks
        ? subscriptionsFromLeakDetections(synthetic.analysis.leaks)
        : null;
    }
    return live.result;
  }, [live.result, synthetic.active, synthetic.analysis]);
  const loading = synthetic.active ? false : live.loading;
  const error = synthetic.active
    ? synthetic.analysis
      ? null
      : "Run a synthetic scenario before opening this view."
    : live.error;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1">
              <Text className="text-[24px] font-bold text-foreground">Subscriptions</Text>
              {result ? (
                <Text className="mt-0.5 text-[14px] text-muted-foreground">
                  {formatSubscriptionsSummary(result.subscriptions.length, result.monthlyTotal)}
                </Text>
              ) : null}
            </View>
            {synthetic.active ? null : (
              <IconButton accessibilityLabel="Refresh" variant="ghost" onPress={live.refresh}>
                <RefreshCw color={palette.foreground} size={20} strokeWidth={2} />
              </IconButton>
            )}
          </View>

          {synthetic.active && synthetic.analysis ? (
            <SyntheticSourceNote scenarioName={scenarioLabel(synthetic.analysis.scenario)} />
          ) : null}

          {loading && !result ? (
            <View className="mt-8 items-center rounded-3xl bg-card px-5 py-10">
              <ActivityIndicator size="large" />
              <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">
                Finding your subscriptions…
              </Text>
            </View>
          ) : null}
          {error ? (
            <View className="mt-6 rounded-3xl bg-card px-5 py-5">
              <Text className="text-[16px] font-semibold text-destructive">
                Subscriptions unavailable
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4 self-start" variant="outline" onPress={live.refresh}>
                Try again
              </Button>
            </View>
          ) : null}

          {result ? (
            <View className="mt-6">
              {result.subscriptions.length === 0 ? (
                <View className="rounded-3xl bg-card px-5 py-6">
                  <Text className="text-[16px] font-semibold text-foreground">
                    No subscriptions found yet
                  </Text>
                  <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                    Add more statement history and we will list what you pay for every month.
                  </Text>
                </View>
              ) : (
                <View className="gap-3">
                  {result.subscriptions.map((subscription) => (
                    <SubscriptionCard
                      key={`${subscription.productKey ?? subscription.merchantKey}:${subscription.source}`}
                      subscription={subscription}
                    />
                  ))}
                </View>
              )}
              {loading ? (
                <Text className="mt-3 text-center text-[13px] text-muted-foreground">Updating…</Text>
              ) : null}
              {result.subscriptions.length > 0 ? (
                <Text className="mt-5 text-[12px] leading-5 text-muted-foreground">
                  TracePay only shows what your statements contain. It does not cancel or change
                  anything.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SubscriptionCard({ subscription }: { subscription: DetectedSubscription }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  const chip = subscription.status ? STATUS_CHIPS[subscription.status] : undefined;
  const history = subscription.amountHistory?.length
    ? subscription.amountHistory
    : subscription.observedAmounts;
  const priceChanged = new Set(history.map((amount) => amount.toFixed(2))).size > 1;

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="active:opacity-90"
        onPress={() => setOpen((current) => !current)}
      >
        <View className="flex-row items-center gap-3">
          <MerchantMark displayName={subscription.displayName} />
          <View className="min-w-0 flex-1">
            <Text className="text-[17px] font-bold text-foreground">
              {subscription.displayName}
            </Text>
            <Text className="mt-0.5 text-[14px] text-muted-foreground">
              {formatMonthlyEstimate(subscription.monthlyEstimate)} a month ·{" "}
              {formatIntervalDays(subscription.averageIntervalDays).toLowerCase()}
            </Text>
          </View>
          {chip ? (
            <View className={`rounded-full px-3 py-1.5 ${chip.container}`}>
              <Text className={`text-[12px] font-semibold ${chip.text}`}>{chip.label}</Text>
            </View>
          ) : null}
        </View>

        {subscription.nextExpectedDate ? (
          <Text className="mt-3 text-[13px] text-muted-foreground">
            Next payment around {subscription.nextExpectedDate}
          </Text>
        ) : null}
        {priceChanged ? (
          <Text className="mt-1 text-[13px] text-muted-foreground">
            The amount has changed over time.
          </Text>
        ) : null}
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[13px] font-semibold text-foreground">
            {open ? "Hide payments" : "See payments"}
          </Text>
          <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
        </View>
      </Pressable>

      {open ? (
        <View className="mt-3 gap-2">
          {subscription.lastSuccessfulCharge ? (
            <DetailRow label="Last payment" value={subscription.lastSuccessfulCharge} />
          ) : null}
          {subscription.currentAmount != null ? (
            <DetailRow label="Latest amount" value={formatMoney(subscription.currentAmount)} />
          ) : null}
          {subscription.expectedDayOfMonth ? (
            <DetailRow
              label="Usually paid"
              value={`Around the ${subscription.expectedDayOfMonth}${ordinal(subscription.expectedDayOfMonth)}`}
            />
          ) : null}
          {history.length > 0 ? (
            <DetailRow label="Amounts paid" value={history.map(formatMoney).join(" · ")} />
          ) : null}
          {subscription.failedPaymentAttemptCount > 0 ? (
            <DetailRow
              label="Failed payments"
              value={`${subscription.failedPaymentAttemptCount} · fees ${formatMoney(subscription.totalFailureFees ?? 0)}`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
      <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">{label}</Text>
      <Text className="min-w-0 flex-1 text-right text-[13px] font-semibold text-foreground">
        {value}
      </Text>
    </View>
  );
}

function MerchantMark({ displayName }: { displayName: string }) {
  const logo = resolveCatalogLogo(displayName);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logo?.domain]);

  if (logo && !logoFailed) {
    const bundled = resolveBrandIcon(logo.brandId) ?? resolveBrandIcon(logo.domain);
    if (bundled) {
      return <SimpleBrandLogo brandId={logo.brandId} name={displayName} shape="circle" size={40} />;
    }
    const uri = catalogLogoUrl(logo.domain);
    if (uri) {
      return (
        <Image
          accessibilityLabel={`${displayName} logo`}
          resizeMode="contain"
          source={{ uri }}
          style={{ width: 40, height: 40, borderRadius: 20 }}
          onError={() => setLogoFailed(true)}
        />
      );
    }
  }

  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
      <Repeat color="#64748B" size={18} strokeWidth={2.2} />
    </View>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
}
