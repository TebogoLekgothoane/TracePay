import { ChevronRight, Lightbulb } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { SpendingPatternInsight } from "../../features/insights/spending-patterns";
import { COLORS, withAlpha } from "../../theme/colors";

type Props = {
  insights: SpendingPatternInsight[];
  loading: boolean;
  /** True when there are no transactions at all. */
  noData: boolean;
  onPress: () => void;
  onSeeAll: () => void;
};

/** "Insights for you" from the user's real recent spending. */
export function HomeInsights({ insights, loading, noData, onPress, onSeeAll }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">Insights for you</Text>
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-0.5 active:opacity-70"
          onPress={onSeeAll}
        >
          <Text className="text-[14px] font-semibold text-primary">See all</Text>
          <ChevronRight color={palette.primary} size={16} strokeWidth={2.4} />
        </Pressable>
      </View>

      {insights.length > 0 ? (
        <View className="gap-3">
          {insights.map((insight) => (
            <Pressable
              key={insight.id}
              accessibilityRole="button"
              accessibilityLabel={insight.title}
              className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5 active:opacity-75"
              onPress={onPress}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: withAlpha(palette.primary, 0.14) }}
              >
                <Lightbulb color={palette.primary} size={19} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={2}>
                  {insight.title}
                </Text>
                <Text
                  className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground"
                  numberOfLines={2}
                >
                  {insight.detail}
                </Text>
              </View>
              <ChevronRight color={palette.mutedForeground} size={18} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="rounded-2xl border border-border/60 bg-card px-4 py-4">
          <Text className="text-[13px] leading-5 text-muted-foreground">
            {loading
              ? "Reading your recent spending…"
              : noData
                ? "Add a bank statement to get insights about your own spending."
                : "Nothing unusual in your recent spending."}
          </Text>
        </View>
      )}
    </View>
  );
}
