import { Redirect, router } from "expo-router";
import { ChevronLeft, RefreshCw } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import {
  formatExpectedSavings,
  formatImpactDetail,
  formatImpactHeading,
  formatImpactValue,
  formatNonAdditiveNotice,
  formatPriority,
  formatRecommendedAction,
  isVerificationRequired,
  RECOMMENDATION_DISCLAIMER,
} from "../../src/features/financial-recommendations/financial-recommendations.format";
import type { Recommendation } from "../../src/features/financial-recommendations/financial-recommendations.types";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { useFinancialRecommendationsDebug } from "../../src/hooks/useFinancialRecommendationsDebug";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../src/theme/colors";

/**
 * What to do next, as the action list of a finding would read: the step, what it
 * is worth, and how urgent it is. Nothing here moves money or contacts anyone.
 */
export default function FinancialRecommendationsDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <FinancialRecommendationsDebugScreen />;
}

const PRIORITY_CHIPS: Record<string, { container: string; text: string }> = {
  high: { container: "bg-destructive/10", text: "text-destructive" },
  medium: { container: "bg-primary/10", text: "text-primary" },
  low: { container: "bg-muted", text: "text-muted-foreground" },
};

function FinancialRecommendationsDebugScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useFinancialRecommendationsDebug(!synthetic.active);
  const result = synthetic.active ? synthetic.analysis?.recommendations ?? null : live.result;
  const loading = synthetic.active ? false : live.loading;
  const error = synthetic.active
    ? synthetic.analysis
      ? null
      : "Run a synthetic scenario before opening this view."
    : live.error;
  const notice = result ? formatNonAdditiveNotice(result) : null;

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
              <Text className="text-[24px] font-bold text-foreground">Next steps</Text>
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
                Preparing your next steps…
              </Text>
            </View>
          ) : null}
          {error ? (
            <View className="mt-6 rounded-3xl bg-card px-5 py-5">
              <Text className="text-[16px] font-semibold text-destructive">
                Next steps unavailable
              </Text>
              <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4 self-start" variant="outline" onPress={live.refresh}>
                Try again
              </Button>
            </View>
          ) : null}

          {result ? (
            <View className="mt-6">
              {notice ? (
                <View className="mb-3 rounded-2xl bg-muted/40 px-4 py-3">
                  <Text className="text-[13px] leading-5 text-foreground">{notice}</Text>
                </View>
              ) : null}
              <View className="gap-3">
                {result.recommendations.length === 0 ? (
                  <View className="rounded-3xl bg-card px-5 py-6">
                    <Text className="text-[16px] font-semibold text-foreground">
                      Nothing to do right now
                    </Text>
                    <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                      Next steps appear here when a finding needs your attention.
                    </Text>
                  </View>
                ) : (
                  result.recommendations.map((item) => (
                    <StepCard key={item.recommendation_id} recommendation={item} />
                  ))
                )}
              </View>
              {loading ? (
                <Text className="mt-3 text-center text-[13px] text-muted-foreground">Updating…</Text>
              ) : null}
              <Text className="mt-5 text-[12px] leading-5 text-muted-foreground">
                {RECOMMENDATION_DISCLAIMER}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StepCard({ recommendation }: { recommendation: Recommendation }) {
  const verification = isVerificationRequired(recommendation);
  const detail = formatImpactDetail(recommendation);
  const chip = PRIORITY_CHIPS[recommendation.priority];

  return (
    <View className="rounded-3xl bg-card px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[17px] font-bold text-foreground">
          {recommendation.title}
        </Text>
        {chip ? (
          <View className={`rounded-full px-3 py-1.5 ${chip.container}`}>
            <Text className={`text-[12px] font-semibold ${chip.text}`}>
              {formatPriority(recommendation.priority)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
        {recommendation.explanation}
      </Text>

      <View className="mt-4 rounded-2xl bg-primary/5 px-4 py-3">
        <Text className="text-[13px] font-semibold text-primary">What to do</Text>
        <Text className="mt-1 text-[14px] leading-5 text-foreground">
          {formatRecommendedAction(recommendation)}
        </Text>
      </View>

      <View className="mt-3 rounded-2xl bg-muted/40 px-4 py-3">
        <Text className="text-[12px] font-medium text-muted-foreground">
          {formatImpactHeading(recommendation)}
        </Text>
        <Text className="mt-1 text-[16px] font-bold text-foreground">
          {formatImpactValue(recommendation)}
          {detail ? ` · ${detail}` : ""}
        </Text>
        {recommendation.expected_savings_amount !== null ? (
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Expected savings: {formatExpectedSavings(recommendation.expected_savings_amount)}
          </Text>
        ) : null}
      </View>

      {verification ? (
        <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
          We have not confirmed this as a duplicate or an error.
        </Text>
      ) : null}
    </View>
  );
}
