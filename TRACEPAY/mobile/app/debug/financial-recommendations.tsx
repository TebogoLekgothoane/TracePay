import { Redirect, router } from "expo-router";
import { ChevronLeft, ListChecks } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import {
  formatExpectedSavings,
  formatFindingScope,
  formatImpactDetail,
  formatImpactHeading,
  formatImpactValue,
  formatNonAdditiveNotice,
  formatPriority,
  formatRecommendationConfidence,
  formatRecommendedAction,
  formatRootCauseType,
  isVerificationRequired,
  RECOMMENDATION_DISCLAIMER,
} from "../../src/features/financial-recommendations/financial-recommendations.format";
import type {
  FinancialRecommendationResult,
  Recommendation,
} from "../../src/features/financial-recommendations/financial-recommendations.types";
import { useFinancialRecommendationsDebug } from "../../src/hooks/useFinancialRecommendationsDebug";
import { COLORS } from "../../src/theme/colors";

export default function FinancialRecommendationsDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <FinancialRecommendationsDebugScreen />;
}

function FinancialRecommendationsDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { result, loading, error, refresh } = useFinancialRecommendationsDebug();

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
                Recommendation & Action
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Development validation view
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-3xl bg-card px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <ListChecks color={palette.primary} size={20} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  Authenticated backend recommendations
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                Next steps come from the server. This screen does not calculate
                savings, priority, or confidence.
              </Text>
            </View>
          </View>

          <Text className="mt-4 text-[13px] leading-5 text-muted-foreground">
            {RECOMMENDATION_DISCLAIMER}
          </Text>
          </View>

          <View className="mt-4">
            <Button
              accessibilityLabel="Refresh recommendations"
              loading={loading}
              size="md"
              onPress={refresh}
            >
              Refresh recommendations
            </Button>
          </View>

          {loading && !result ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={refresh} /> : null}
          {result && !loading ? <ResultContent result={result} /> : null}
          {result && loading ? (
            <Text className="mt-3 text-center text-[13px] text-muted-foreground">
              Preparing your recommended actions…
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
        Preparing your recommended actions…
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
        Recommendations unavailable
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

function ResultContent({ result }: { result: FinancialRecommendationResult }) {
  const notice = formatNonAdditiveNotice(result);
  return (
    <View className="mt-6">
      <Text className="text-[13px] text-muted-foreground">
        Recommendations: {result.recommendation_count}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Period: {formatPeriod(result.period_start, result.period_end)}
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Reasoning {result.reasoning_version} · Recommendations{" "}
        {result.recommendation_version}
      </Text>
      {notice ? (
        <View className="mt-4 rounded-2xl bg-muted/40 px-4 py-3">
          <Text className="text-[13px] leading-5 text-foreground">{notice}</Text>
        </View>
      ) : null}
      {result.recommendations.length === 0 ? <EmptyState /> : null}
      <View className="mt-5 gap-4">
        {result.recommendations.map((item) => (
          <RecommendationCard key={item.recommendation_id} recommendation={item} />
        ))}
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-5 rounded-3xl bg-card px-5 py-6">
      <Text className="text-[16px] font-semibold text-foreground">
        No recommendations are available yet.
      </Text>
    </View>
  );
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const verification = isVerificationRequired(recommendation);
  const impactDetail = formatImpactDetail(recommendation);

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <Text className="text-[18px] font-bold text-foreground">
        {recommendation.title}
      </Text>

      <SectionLabel>Explanation</SectionLabel>
      <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
        {recommendation.explanation}
      </Text>

      <SectionLabel>Recommended action</SectionLabel>
      <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
        {formatRecommendedAction(recommendation)}
      </Text>

      <View className="mt-4">
        <Text className="text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
          {formatImpactHeading(recommendation)}
        </Text>
        <Text className="mt-1 text-[15px] font-semibold text-foreground">
          {formatImpactValue(recommendation)}
          {impactDetail ? ` · ${impactDetail}` : ""}
        </Text>
        <Text className="mt-2 text-[13px] text-muted-foreground">
          Expected savings: {formatExpectedSavings(recommendation.expected_savings_amount)}
        </Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Metric label="Priority" value={formatPriority(recommendation.priority)} />
        <Metric
          label="Recommendation confidence"
          value={formatRecommendationConfidence(recommendation.recommendation_confidence)}
        />
      </View>
      <View className="mt-3 flex-row gap-3">
        <Metric
          label="Root cause"
          value={formatRootCauseType(recommendation.source_root_cause_type)}
        />
        <Metric
          label="Finding scope"
          value={formatFindingScope(recommendation.finding_scope)}
        />
      </View>

      {verification ? (
        <View className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Text className="text-[13px] font-semibold text-primary">
            Verification required
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            TracePay has not confirmed this as a duplicate or an error.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mt-4 text-[13px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
      {children}
    </Text>
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
