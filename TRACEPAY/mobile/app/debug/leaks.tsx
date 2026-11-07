import { Redirect, router } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  RefreshCw,
  Smartphone,
  Banknote,
  MoreHorizontal,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import { formatCurrency } from "../../src/features/leak-intelligence/leak-intelligence.format";
import {
  LEAK_DEBUG_CATEGORIES,
  categoryHref,
  categoryTotal,
  type LeakDebugCategory,
} from "../../src/features/leak-intelligence/leak-debug-categories";
import { SyntheticSourceNote } from "../../src/features/synthetic-intelligence/SyntheticSourceNote";
import { scenarioLabel } from "../../src/features/synthetic-intelligence/synthetic-intelligence.parse";
import { useLeakIntelligenceDebug } from "../../src/hooks/useLeakIntelligenceDebug";
import { useStoredSyntheticAnalysis } from "../../src/hooks/useStoredSyntheticAnalysis";
import { COLORS } from "../../src/theme/colors";
import { ErrorState, LoadingState } from "./leak-intelligence";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fees: Landmark,
  subs: RefreshCw,
  airtime: Smartphone,
  debit: CreditCard,
  atm: Banknote,
  other: MoreHorizontal,
};

/**
 * The Leaks tab, for debugging: a Leak breakdown row of category tiles that open
 * each category, then the full findings list. Amounts come from the live analysis.
 */
export default function LeaksDebugRoute() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <LeaksDebugScreen />;
}

function LeaksDebugScreen() {
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
            <Text className="min-w-0 flex-1 text-[30px] font-bold tracking-[-0.6px] text-foreground">
              Leaks
            </Text>
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
            <>
              <Text className="mb-1 mt-7 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Leak breakdown
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                Areas where we found potential money leaks.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-5 mt-4"
                contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
              >
                {LEAK_DEBUG_CATEGORIES.map((category) => (
                  <CategoryTile
                    key={category.key}
                    category={category}
                    count={categoryTotal(category, result.leaks).count}
                    monthly={categoryTotal(category, result.leaks).monthly}
                  />
                ))}
              </ScrollView>

              <Text className="mb-1 mt-7 text-[22px] font-bold tracking-[-0.3px] text-foreground">
                Potential leaks
              </Text>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                We found {result.leaks.length} {result.leaks.length === 1 ? "thing" : "things"} worth
                reviewing.
              </Text>
              <Pressable
                accessibilityRole="button"
                className="mt-4 rounded-3xl bg-card px-4 py-4 active:opacity-80"
                onPress={() => router.push("/debug/leak-intelligence" as never)}
              >
                <Text className="text-[16px] font-bold text-foreground">All findings</Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  Every finding with its evidence, near misses and the tuning report.
                </Text>
              </Pressable>
              {loading ? (
                <Text className="mt-3 text-center text-[13px] text-muted-foreground">Updating…</Text>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Same tile as the Leaks tab, showing the number found instead of a trend. */
function CategoryTile({
  category,
  count,
  monthly,
}: {
  category: LeakDebugCategory;
  count: number;
  monthly: number;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const Icon = CATEGORY_ICONS[category.key] ?? CreditCard;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.title}, ${count} findings, ${formatCurrency(monthly)} a month`}
      onPress={() => router.push(categoryHref(category) as never)}
      className="overflow-hidden rounded-[20px] bg-card px-4 pb-3 pt-3.5 active:opacity-80"
      style={{ width: 146, minHeight: 112 }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon color={palette.foreground} size={17} strokeWidth={1.8} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] text-foreground">
            {category.title}
          </Text>
        </View>
        <ChevronRight color={palette.foreground} size={16} strokeWidth={2} />
      </View>
      <Text className="mt-3 text-[26px] font-bold tracking-[-0.5px] text-foreground">
        {formatCurrency(monthly)}
      </Text>
      <Text className="mt-0.5 text-[13px] font-semibold text-muted-foreground">
        {count} {count === 1 ? "finding" : "findings"}
      </Text>
    </Pressable>
  );
}
