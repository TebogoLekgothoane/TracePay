import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, RefreshCw } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../../src/components/ui/IconButton";
import {
  belongsToCategory,
  leakDebugCategoryByKey,
  type LeakDebugCategory,
} from "../../../src/features/leak-intelligence/leak-debug-categories";
import { SyntheticSourceNote } from "../../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { useLeakIntelligenceDebug } from "../../../src/hooks/useLeakIntelligenceDebug";
import { useStoredSyntheticAnalysis } from "../../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../../src/theme/colors";
import { ErrorState, FindingCard, LoadingState, NearMisses } from "../leak-intelligence";

/**
 * One leak category on its own: the same findings and near misses as the main
 * leak page, limited to the finding types in this category.
 */
export default function LeakCategoryDebugRoute() {
  const { category: key } = useLocalSearchParams<{ category: string }>();
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  const category = leakDebugCategoryByKey(key);
  if (!category) {
    return <Redirect href="/(tabs)/settings" />;
  }
  return <LeakCategoryScreen category={category} />;
}

function LeakCategoryScreen({ category }: { category: LeakDebugCategory }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const synthetic = useStoredSyntheticAnalysis();
  const live = useLeakIntelligenceDebug(!synthetic.active);
  const result = synthetic.active ? synthetic.analysis?.leaks ?? null : live.result;
  const loading = synthetic.active ? false : live.loading;
  const error = synthetic.active
    ? synthetic.analysis
      ? null
      : "Run a synthetic scenario before opening this view."
    : live.error;
  const leaks = result?.leaks.filter((leak) => belongsToCategory(category, leak)) ?? [];
  const nearMisses = (result?.near_misses ?? []).filter((item) =>
    belongsToCategory(category, item),
  );

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
              <Text className="text-[24px] font-bold text-foreground">{category.title}</Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">{category.blurb}</Text>
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

          {loading && !result ? <LoadingState /> : null}
          {error ? <ErrorState message={error} onRetry={live.refresh} /> : null}
          {result ? (
            <View className="mt-6">
              {leaks.length === 0 ? (
                <View className="rounded-3xl bg-card px-5 py-6">
                  <Text className="text-[16px] font-semibold text-foreground">
                    Nothing flagged here
                  </Text>
                  <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                    No {category.title.toLowerCase()} findings in your statements right now.
                  </Text>
                </View>
              ) : (
                <>
                  <Text className="text-[14px] leading-5 text-muted-foreground">
                    {leaks.length} {leaks.length === 1 ? "finding" : "findings"} in this category.
                  </Text>
                  <View className="mt-3 gap-3">
                    {leaks.map((leak) => (
                      <FindingCard key={leak.fingerprint} leak={leak} />
                    ))}
                  </View>
                </>
              )}
              <NearMisses items={nearMisses} />
              {loading ? (
                <Text className="mt-3 text-center text-[13px] text-muted-foreground">
                  Updating…
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
