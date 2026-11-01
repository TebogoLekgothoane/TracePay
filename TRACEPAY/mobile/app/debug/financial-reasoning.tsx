import { Redirect, router } from "expo-router";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import {
  detectedImpactPeriodLabel,
  formatAvoidabilitySummary,
  formatAvoidableAmount,
  formatConfidence,
  formatCurrency,
  formatPersistence,
  formatReasoningEvidence,
  formatRootCauseType,
  isVerificationRequired,
} from "../../src/features/financial-reasoning/financial-reasoning.format";
import type { FinancialReasoning } from "../../src/features/financial-reasoning/financial-reasoning.types";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { useFinancialReasoningDebug } from "../../src/hooks/useFinancialReasoningDebug";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../src/theme/colors";

/**
 * Why each potential leak is happening, as the explanation sheet of a finding would
 * read: the cause in one line, what it means in rand, and whether it can be avoided.
 * The working behind it sits one tap down.
 */
export default function FinancialReasoningDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <FinancialReasoningDebugScreen />;
}

function FinancialReasoningDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useFinancialReasoningDebug(!synthetic.active);
  const result = synthetic.active ? synthetic.analysis?.reasoning ?? null : live.result;
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
              <Text className="text-[24px] font-bold text-foreground">Why it happened</Text>
              {result?.period_start && result.period_end ? (
                <Text className="mt-0.5 text-[14px] text-muted-foreground">
                  {result.period_start} to {result.period_end}
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
                Working out what is behind your findings…
              </Text>
            </View>
          ) : null}
          {error ? (
            <View className="mt-6 rounded-3xl bg-card px-5 py-5">
              <Text className="text-[16px] font-semibold text-destructive">
                Explanations unavailable
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4 self-start" variant="outline" onPress={live.refresh}>
                Try again
              </Button>
            </View>
          ) : null}
          {result ? (
            <View className="mt-6 gap-3">
              {result.analyses.length === 0 ? (
                <View className="rounded-3xl bg-card px-5 py-6">
                  <Text className="text-[16px] font-semibold text-foreground">
                    Nothing to explain yet
                  </Text>
                  <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                    Explanations appear here once we have a finding to explain.
                  </Text>
                </View>
              ) : (
                result.analyses.map((analysis) => (
                  <ReasoningCard key={analysis.reasoning_id} analysis={analysis} />
                ))
              )}
              {loading ? (
                <Text className="text-center text-[13px] text-muted-foreground">Updating…</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReasoningCard({ analysis }: { analysis: FinancialReasoning }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  const impact = analysis.impact_assessment;
  const verification = isVerificationRequired(analysis);
  const evidence = formatReasoningEvidence(analysis.evidence);
  const oneTime = impact.impact_kind === "one_time";
  const amountLine = oneTime
    ? `${formatCurrency(impact.recoverable_amount ?? impact.detected_amount)} · one time`
    : `${formatCurrency(impact.detected_amount)} a ${detectedImpactPeriodLabel(impact.impact_kind)}`;

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[17px] font-bold text-foreground">
          {analysis.title}
        </Text>
        <View className="rounded-full bg-primary/10 px-3 py-1.5">
          <Text className="text-[12px] font-semibold text-primary">
            {formatRootCauseType(analysis.root_cause_type)}
          </Text>
        </View>
      </View>

      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        {analysis.explanation}
      </Text>

      <View className="mt-4 rounded-2xl bg-muted/40 px-4 py-3">
        <Text className="text-[12px] font-medium text-muted-foreground">
          {oneTime ? "Potential amount" : "What it adds up to"}
        </Text>
        <Text className="mt-1 text-[18px] font-bold text-foreground">{amountLine}</Text>
        {!oneTime && impact.detected_annual_amount !== null ? (
          <Text className="mt-1 text-[13px] text-muted-foreground">
            About {formatCurrency(impact.detected_annual_amount)} a year if it continues.
          </Text>
        ) : null}
      </View>

      <View className="mt-3 rounded-2xl bg-muted/40 px-4 py-3">
        <Text className="text-[12px] font-medium text-muted-foreground">Could it be avoided?</Text>
        <Text className="mt-1 text-[15px] font-semibold text-foreground">
          {formatAvoidabilitySummary(analysis.avoidability)}
        </Text>
        {impact.potentially_avoidable_amount !== null ? (
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Potentially avoidable: {formatAvoidableAmount(impact.potentially_avoidable_amount)}
          </Text>
        ) : null}
      </View>

      {verification ? (
        <View className="mt-3 rounded-2xl bg-primary/5 px-4 py-3">
          <Text className="text-[13px] font-semibold text-primary">Worth checking</Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            We have not confirmed this as a duplicate or an error. Compare the transactions
            first.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="mt-4 flex-row items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 active:opacity-75"
        onPress={() => setOpen((current) => !current)}
      >
        <Text className="text-[13px] font-semibold text-foreground">
          {open ? "Hide details" : "See the details"}
        </Text>
        <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
      </Pressable>

      {open ? (
        <View className="mt-3 gap-3">
          <View className="flex-row gap-3">
            <Detail label="Pattern" value={formatPersistence(analysis.persistence)} />
            <Detail label="Confidence" value={formatConfidence(analysis.confidence)} />
          </View>

          {analysis.competing_explanations.length > 0 ? (
            <View>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
                Other possible causes
              </Text>
              <View className="mt-2 gap-2">
                {analysis.competing_explanations.map((cause) => (
                  <View
                    key={`${analysis.reasoning_id}-${cause}`}
                    className="rounded-xl bg-muted/40 px-3 py-2.5"
                  >
                    <Text className="text-[13px] font-semibold text-foreground">
                      {formatRootCauseType(cause)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {evidence.length > 0 ? (
            <View className="gap-2">
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
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-muted/40 px-4 py-3">
      <Text className="text-[12px] font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[15px] font-bold text-foreground">{value}</Text>
    </View>
  );
}
