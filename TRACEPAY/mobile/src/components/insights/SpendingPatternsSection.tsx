import { router } from "expo-router";
import {
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Coins,
  Repeat2,
  ShoppingBag,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  buildSpendingPatterns,
  type SpendingPatternInsight,
} from "../../features/insights/spending-patterns";
import { useSpendingPatternData } from "../../hooks/useSpendingPatternData";
import { COLORS, withAlpha } from "../../theme/colors";
import { Button } from "../ui/Button";
import { SkeletonCard } from "../ui/SkeletonGroups";

const patternIcons = [CircleAlert, Coins, Repeat2, ShoppingBag] as const;

export function SpendingPatternsSection() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { data, loading, error, retry } = useSpendingPatternData();
  const patterns = useMemo(
    () =>
      data?.referenceDate
        ? buildSpendingPatterns(data.rows, data.referenceDate)
        : null,
    [data],
  );


function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

function TodaySummary({
  patterns,
  palette,
  isCurrent,
  referenceDate,
}: {
  patterns: ReturnType<typeof buildSpendingPatterns>;
  palette: typeof COLORS.light | typeof COLORS.dark;
  isCurrent: boolean;
  referenceDate: Date;
}) {
  
}

function PatternCard({
  insight,
  icon: Icon,
  palette,
}: {
  insight: SpendingPatternInsight;
  icon: (typeof patternIcons)[number];
  palette: typeof COLORS.light | typeof COLORS.dark;
}) {
  return (
    <View className="rounded-3xl bg-card p-4">
      <View className="flex-row items-start gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(palette.accent, 0.12) }}
        >
          <Icon color={palette.accent} size={18} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-foreground">
            {insight.title}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {insight.detail}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 self-start active:opacity-70"
            onPress={() => router.push("/(tabs)/transactions")}
          >
            <Text className="text-[13px] font-semibold text-primary">{insight.action}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatRand(value: number): string {
  return `R${value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
}