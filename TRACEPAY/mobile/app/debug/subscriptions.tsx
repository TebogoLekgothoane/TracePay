import { Redirect, router } from "expo-router";
import { ChevronLeft, CreditCard, Repeat } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { SimpleBrandLogo } from "../../src/components/ui/SimpleBrandLogo";
import { resolveBrandIcon } from "../../src/features/brands/simple-brand-icons";
import {
  formatIntervalDays,
  formatMonthlyEstimate,
  formatObservedRange,
  formatRecurrenceStrength,
  formatSubscriptionSource,
  formatSubscriptionsSummary,
} from "../../src/features/subscriptions-debug/subscriptions.format";
import { subscriptionsFromLeakDetections } from "../../src/features/subscriptions-debug/subscriptions.parse";
import type { DetectedSubscription } from "../../src/features/subscriptions-debug/subscriptions.types";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import {
  catalogLogoUrl,
  resolveCatalogLogo,
} from "../../src/features/transactions/merchant-logos";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { useSubscriptionsDebug } from "../../src/hooks/useSubscriptionsDebug";
import { COLORS } from "../../src/theme/colors";

export default function SubscriptionsDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <SubscriptionsDebugScreen />;
}

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
  const refresh = live.refresh;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton
              accessibilityLabel="Go back"
              variant="ghost"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1">
              <Text className="text-[24px] font-bold text-foreground">
                Subscriptions
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Detected from your bank statements
              </Text>
            </View>
          </View>

          {synthetic.active && synthetic.analysis ? (
            <SyntheticSourceNote
              scenarioName={scenarioLabel(synthetic.analysis.scenario)}
            />
          ) : (
            <View className="mt-5 rounded-3xl bg-card px-4 py-4">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <Repeat color={palette.primary} size={20} strokeWidth={2.2} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-semibold text-foreground">
                    Statement-derived recurring payments
                  </Text>
                  <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                    Built from imported transactions with a subscription category or
                    stable recurring cadence. This does not confirm active usage or
                    cancel anything.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {synthetic.active ? null : (
            <View className="mt-4">
              <Button
                accessibilityLabel="Refresh subscriptions"
                loading={loading}
                size="md"
                onPress={refresh}
              >
                Refresh
              </Button>
            </View>
          )}

          {loading && !result ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={refresh} /> : null}
          {result && !loading ? <ResultContent result={result} /> : null}
          {result && loading ? (
            <Text className="mt-3 text-center text-[13px] text-muted-foreground">
              Updating subscriptions…
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadingState() {
  return (
    <View className="mt-8 items-center rounded-3xl bg-card px-5 py-10">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">
        Finding subscriptions…
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
        TracePay is reviewing recurring payments in your imported statements.
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-6 rounded-3xl bg-card px-5 py-5">
      <Text className="text-[16px] font-semibold text-destructive">
        Subscriptions unavailable
      </Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        {message}
      </Text>
      <Button className="mt-4 self-start" size="sm" variant="outline" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

function ResultContent({
  result,
}: {
  result: {
    transactionCount: number;
    periodStart: string | null;
    periodEnd: string | null;
    subscriptions: DetectedSubscription[];
    monthlyTotal: number;
  };
}) {
  return (
    <View className="mt-6">
      <View className="flex-row gap-3">
        <Metric label="Detected" value={String(result.subscriptions.length)} />
        <Metric
          label="Est. monthly"
          value={formatMonthlyEstimate(result.monthlyTotal)}
        />
      </View>
      <Text className="mt-3 text-[13px] text-muted-foreground">
        {formatSubscriptionsSummary(
          result.subscriptions.length,
          result.monthlyTotal,
        )}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Period: {formatPeriod(result.periodStart, result.periodEnd)} ·{" "}
        {result.transactionCount} transactions analysed
      </Text>

      {result.subscriptions.length === 0 ? <EmptyState /> : null}
      <View className="mt-5 gap-4">
        {result.subscriptions.map((subscription) => (
          <SubscriptionCard
            key={`${subscription.merchantKey}:${subscription.source}`}
            subscription={subscription}
          />
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3">
      <Text className="text-[12px] font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[20px] font-bold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-5 rounded-3xl bg-card px-5 py-6">
      <Text className="text-[16px] font-semibold text-foreground">
        No subscriptions detected yet
      </Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        Import more statement history, or check that subscription merchants are
        categorised. Occasional purchases are not listed here.
      </Text>
    </View>
  );
}

function SubscriptionCard({ subscription }: { subscription: DetectedSubscription }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="rounded-3xl bg-card px-5 py-5 active:opacity-90"
      onPress={() => setExpanded((current) => !current)}
    >
      <View className="flex-row items-start gap-3">
        <MerchantMark displayName={subscription.displayName} />
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
            {formatSubscriptionSource(subscription.source)}
          </Text>
          <Text className="mt-1 text-[18px] font-bold text-foreground">
            {subscription.displayName}
          </Text>
          <Text className="mt-1 text-[14px] text-muted-foreground">
            {formatMonthlyEstimate(subscription.monthlyEstimate)} / month ·{" "}
            {formatIntervalDays(subscription.averageIntervalDays)}
          </Text>
        </View>
        <View className="rounded-full bg-primary/10 px-3 py-1.5">
          <Text className="text-[12px] font-semibold text-primary">
            {formatRecurrenceStrength(subscription.recurrenceStrength)}
          </Text>
        </View>
      </View>

      {expanded ? (
        <View className="mt-4 gap-2 border-t border-border/60 pt-4">
          <DetailRow
            label="Observations"
            value={String(subscription.observationCount)}
          />
          <DetailRow
            label="Average amount"
            value={formatMonthlyEstimate(subscription.averageAmount)}
          />
          <DetailRow
            label="Observed range"
            value={formatObservedRange(
              subscription.firstObservedDate,
              subscription.lastObservedDate,
            )}
          />
          {subscription.category ? (
            <DetailRow label="Category" value={subscription.category} />
          ) : null}
          {subscription.debitOrderCount > 0 ? (
            <DetailRow
              label="Debit-order txs"
              value={String(subscription.debitOrderCount)}
            />
          ) : null}
          <Text className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Detection only — TracePay does not cancel, pause, or contact the
            merchant.
          </Text>
        </View>
      ) : (
        <Text className="mt-3 text-[12px] text-muted-foreground">
          Tap for observation details
        </Text>
      )}
      <View className="mt-2 flex-row items-center gap-1.5">
        <CreditCard color={palette.placeholder} size={14} strokeWidth={2} />
        <Text className="text-[12px] text-muted-foreground">
          From statement history
        </Text>
      </View>
    </Pressable>
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
      return (
        <SimpleBrandLogo
          brandId={logo.brandId}
          name={displayName}
          shape="circle"
          size={40}
        />
      );
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

function formatPeriod(start: string | null, end: string | null): string {
  return start && end ? `${start} to ${end}` : "Not available";
}
