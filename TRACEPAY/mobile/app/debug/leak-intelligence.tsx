import { Redirect, router } from "expo-router";
import { ChevronLeft, RefreshCw, ShieldAlert } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import { Button } from "../../src/components/ui/Button";
import {
  formatConfidence,
  formatCurrency,
  formatEvidence,
  formatImpactKind,
  formatPrimaryImpactLabel,
} from "../../src/features/leak-intelligence/leak-intelligence.format";
import type { LeakDetection } from "../../src/features/leak-intelligence/leak-intelligence.types";
import { useLeakIntelligenceDebug } from "../../src/hooks/useLeakIntelligenceDebug";
import { COLORS } from "../../src/theme/colors";

export default function LeakIntelligenceDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <LeakIntelligenceDebugScreen />;
}

function LeakIntelligenceDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { result, loading, error, refresh } = useLeakIntelligenceDebug();

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
                Leak Intelligence
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Development validation view
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-3xl bg-card px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldAlert color={palette.primary} size={20} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  Authenticated backend response
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  Results are calculated from your imported transactions. Sensitive
                  transaction details are not displayed here.
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-4">
            <Button
              accessibilityLabel="Refresh Analysis"
              loading={loading}
              size="md"
              onPress={refresh}
            >
              Refresh Analysis
            </Button>
          </View>

          {loading && !result ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={refresh} /> : null}
          {result && !loading ? <ResultContent result={result} /> : null}
          {result && loading ? (
            <Text className="mt-3 text-center text-[13px] text-muted-foreground">
              Updating analysis…
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
        Analysing your financial activity...
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
        This may take a moment while TracePay reviews your current patterns.
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
        Analysis unavailable
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
    transaction_count: number;
    period_start: string | null;
    period_end: string | null;
    detector_version: string;
    leaks: LeakDetection[];
  };
}) {
  return (
    <View className="mt-6">
      <View className="flex-row gap-3">
        <Metric label="Potential patterns" value={String(result.leaks.length)} />
        <Metric label="Transactions" value={String(result.transaction_count)} />
      </View>
      <Text className="mt-3 text-[13px] text-muted-foreground">
        Period: {formatPeriod(result.period_start, result.period_end)} · Detector{" "}
        {result.detector_version}
      </Text>

      {result.leaks.length === 0 ? <EmptyState /> : null}
      <View className="mt-5 gap-4">
        {result.leaks.map((leak) => (
          <LeakCard key={leak.fingerprint} leak={leak} />
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3">
      <Text className="text-[12px] font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[22px] font-bold text-foreground">{value}</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-5 rounded-3xl bg-card px-5 py-6">
      <Text className="text-[16px] font-semibold text-foreground">
        No potential financial leaks detected yet.
      </Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        TracePay will continue analysing your financial patterns as more data becomes
        available.
      </Text>
    </View>
  );
}

function LeakCard({ leak }: { leak: LeakDetection }) {
  const evidence = formatEvidence(leak.evidence);
  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
            {humanize(leak.leak_type)}
          </Text>
          <Text className="mt-1 text-[18px] font-bold text-foreground">{leak.title}</Text>
        </View>
        <SeverityBadge severity={leak.severity} />
      </View>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        {leak.description}
      </Text>

      <View className="mt-5 flex-row gap-3">
        <Metric
          label={formatPrimaryImpactLabel(leak.impact_kind)}
          value={formatCurrency(leak.estimated_monthly_impact)}
        />
        <Metric
          label="Annual impact"
          value={
            leak.estimated_annual_impact === null
              ? "Not annualised"
              : formatCurrency(leak.estimated_annual_impact)
          }
        />
      </View>
      <View className="mt-3 flex-row gap-3">
        <Metric label="Confidence" value={formatConfidence(leak.confidence)} />
        <Metric label="Impact kind" value={formatImpactKind(leak.impact_kind)} />
      </View>

      <Text className="mt-5 text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        Evidence
      </Text>
      {evidence.length ? (
        <View className="mt-2 gap-2">
          {evidence.map((item) => (
            <View
              key={item.label}
              className="flex-row items-center justify-between gap-4 rounded-xl bg-muted/40 px-3 py-2.5"
            >
              <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                {item.label}
              </Text>
              <Text className="text-right text-[13px] font-semibold text-foreground">
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-2 text-[13px] text-muted-foreground">
          Aggregate evidence is available for this pattern.
        </Text>
      )}
      <Text className="mt-4 text-[12px] text-muted-foreground">
        Status: {humanize(leak.status)} · Detected period:{" "}
        {formatPeriod(leak.period_start, leak.period_end)}
      </Text>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: LeakDetection["severity"] }) {
  const tone =
    severity === "high"
      ? { container: "bg-destructive/10", label: "text-destructive" }
      : severity === "medium"
        ? { container: "bg-primary/10", label: "text-primary" }
        : { container: "bg-muted", label: "text-muted-foreground" };
  return (
    <View className={`rounded-full px-3 py-1.5 ${tone.container}`}>
      <Text className={`text-[12px] font-semibold ${tone.label}`}>
        {humanize(severity)}
      </Text>
    </View>
  );
}

function formatPeriod(start: string | null, end: string | null): string {
  return start && end ? `${start} to ${end}` : "Not available";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
