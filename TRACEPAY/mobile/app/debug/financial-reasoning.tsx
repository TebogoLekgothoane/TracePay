import { Redirect, router } from "expo-router";
import { Brain, ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import {
  detectedImpactPeriodLabel,
  formatAnnualAmountMetricLabel,
  formatAvoidabilitySummary,
  formatDetectedAmountHeading,
  formatMonthlyAmountMetricLabel,
  formatAvoidableAmount,
  formatConfidence,
  formatCurrency,
  formatImpactKind,
  formatPersistence,
  formatReasoningEvidence,
  formatRootCauseType,
  isVerificationRequired,
} from "../../src/features/financial-reasoning/financial-reasoning.format";
import type { FinancialReasoning } from "../../src/features/financial-reasoning/financial-reasoning.types";
import { useFinancialReasoningDebug } from "../../src/hooks/useFinancialReasoningDebug";
import { COLORS } from "../../src/theme/colors";

export default function FinancialReasoningDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <FinancialReasoningDebugScreen />;
}

function FinancialReasoningDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { result, loading, error, refresh } = useFinancialReasoningDebug();

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
                Financial Reasoning
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Development validation view
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-3xl bg-card px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Brain color={palette.primary} size={20} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  Authenticated backend reasoning
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  Root causes, persistence, and impact come from the server. This
                  screen does not calculate savings or recommendations.
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
        Analysing the financial patterns...
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
        TracePay is explaining detected patterns using your current transaction
        history.
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
    potential_leaks_analyzed: number;
    transaction_count: number;
    period_start: string | null;
    period_end: string | null;
    reasoning_version: string;
    analyses: FinancialReasoning[];
  };
}) {
  return (
    <View className="mt-6">
      <Text className="text-[13px] text-muted-foreground">
        Potential patterns analysed: {result.potential_leaks_analyzed}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Transactions: {result.transaction_count}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Period: {formatPeriod(result.period_start, result.period_end)} · Reasoning{" "}
        {result.reasoning_version}
      </Text>

      {result.analyses.length === 0 ? <EmptyState /> : null}
      <View className="mt-5 gap-4">
        {result.analyses.map((analysis) => (
          <ReasoningCard key={analysis.reasoning_id} analysis={analysis} />
        ))}
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-5 rounded-3xl bg-card px-5 py-6">
      <Text className="text-[16px] font-semibold text-foreground">
        No financial reasoning available yet.
      </Text>
      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        TracePay needs more evidence before explaining the detected patterns.
      </Text>
    </View>
  );
}

function ReasoningCard({ analysis }: { analysis: FinancialReasoning }) {
  const impact = analysis.impact_assessment;
  const evidence = formatReasoningEvidence(analysis.evidence);
  const verification = isVerificationRequired(analysis);

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <Text className="text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        Root cause
      </Text>
      <Text className="mt-1 text-[18px] font-bold text-foreground">
        {formatRootCauseType(analysis.root_cause_type)}
      </Text>
      <Text className="mt-1 text-[14px] font-medium text-foreground">
        {analysis.title}
      </Text>

      <Text className="mt-4 text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        Explanation
      </Text>
      <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
        {analysis.explanation}
      </Text>

      <ImpactSection analysis={analysis} />

      <View className="mt-4 flex-row gap-3">
        <Metric label="Persistence" value={formatPersistence(analysis.persistence)} />
        <Metric
          label="Root cause confidence"
          value={formatConfidence(analysis.confidence)}
        />
      </View>

      <View className="mt-3 rounded-2xl bg-muted/40 px-4 py-3">
        <Text className="text-[12px] font-medium text-muted-foreground">
          Avoidability
        </Text>
        <Text className="mt-1 text-[15px] font-semibold text-foreground">
          {formatAvoidabilitySummary(analysis.avoidability)}
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Potentially avoidable amount:{" "}
          {formatAvoidableAmount(impact.potentially_avoidable_amount)}
        </Text>
      </View>

      {verification ? (
        <View className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Text className="text-[13px] font-semibold text-primary">
            Verification required
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            This finding is a candidate only and has not been confirmed as a
            duplicate or error.
          </Text>
        </View>
      ) : null}

      {analysis.competing_explanations.length > 0 ? (
        <View className="mt-4">
          <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
            Possible explanations
          </Text>
          <View className="mt-2 gap-2">
            {analysis.competing_explanations.map((cause, index) => (
              <View
                key={`${analysis.reasoning_id}-${cause}`}
                className="rounded-xl bg-muted/40 px-3 py-2.5"
              >
                <Text className="text-[13px] font-semibold text-foreground">
                  {index + 1}. {formatRootCauseType(cause)}
                </Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  Alternative supported by aggregate evidence; no separate
                  confidence score provided.
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

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
    </View>
  );
}

function ImpactSection({ analysis }: { analysis: FinancialReasoning }) {
  const impact = analysis.impact_assessment;
  const isOneTime = impact.impact_kind === "one_time";

  if (isOneTime) {
    const recovery =
      impact.recoverable_amount ?? impact.detected_amount;
    return (
      <View className="mt-4">
        <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
          Potential recovery
        </Text>
        <View className="mt-2 flex-row gap-3">
          <Metric label="Amount" value={formatCurrency(recovery)} />
          <Metric label="Impact" value={formatImpactKind(impact.impact_kind)} />
        </View>
        <Text className="mt-2 text-[13px] text-muted-foreground">
          Annualisation: Not applicable
        </Text>
      </View>
    );
  }

  const period = detectedImpactPeriodLabel(impact.impact_kind);
  const heading = formatDetectedAmountHeading(analysis);
  const annualLabel = formatAnnualAmountMetricLabel(analysis.persistence);
  return (
    <View className="mt-4">
      <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        {heading}
      </Text>
      <Text className="mt-1 text-[15px] font-semibold text-foreground">
        {formatCurrency(impact.detected_amount)} / {period}
      </Text>
      <View className="mt-3 flex-row gap-3">
        <Metric
          label={formatMonthlyAmountMetricLabel(analysis)}
          value={formatCurrency(impact.detected_amount)}
        />
        <Metric
          label={annualLabel}
          value={
            impact.detected_annual_amount === null
              ? "Not annualised"
              : formatCurrency(impact.detected_annual_amount)
          }
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl bg-muted/40 px-4 py-3">
      <Text className="text-[12px] font-medium text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[16px] font-bold text-foreground">{value}</Text>
    </View>
  );
}

function formatPeriod(start: string | null, end: string | null): string {
  return start && end ? `${start} to ${end}` : "Not available";
}
