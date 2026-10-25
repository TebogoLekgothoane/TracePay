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
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  buildSpendingPatterns,
  type SpendingPatternInsight,
} from "../../features/insights/spending-patterns";
import { useSpendingPatternData } from "../../hooks/useSpendingPatternData";
import { COLORS, withAlpha } from "../../theme/colors";

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

  return (
    <View className="mt-8">
      <View className="mb-1 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[17px] font-bold text-foreground">
            Your Spending Patterns
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Clear signals from your recent transactions.
          </Text>
        </View>
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
        >
          <BarChart3 color={palette.primary} size={19} strokeWidth={2.2} />
        </View>
      </View>

      {loading && !data ? (
        <View className="mt-4 items-center rounded-3xl border border-border/60 bg-card p-6">
          <ActivityIndicator color={palette.primary} />
          <Text className="mt-3 text-[13px] text-muted-foreground">
            Reading your transactions…
          </Text>
        </View>
      ) : error && !data ? (
        <View className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
          <Text className="text-[14px] font-semibold text-foreground">
            Spending patterns unavailable
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{error}</Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 self-start active:opacity-70"
            onPress={retry}
          >
            <Text className="text-[13px] font-semibold text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : !data || !data.referenceDate || !patterns ? (
        <View className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
          <Text className="text-[14px] font-semibold text-foreground">
            No transactions yet
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Add a bank statement and TracePay will show where your money goes. Patterns can only
            come from the statements you add.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 self-start active:opacity-70"
            onPress={() => router.push("/statements/coverage")}
          >
            <Text className="text-[13px] font-semibold text-primary">Add a statement</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {!data.isCurrent ? (
            <View className="mt-3 rounded-2xl bg-muted px-3 py-2">
              <Text className="text-[12px] leading-[18px] text-muted-foreground">
                Your latest statement activity is from {formatLongDate(data.referenceDate)}. These
                patterns describe that day and the weeks before it. Add a newer statement to see
                today.
              </Text>
            </View>
          ) : null}
          <TodaySummary
            patterns={patterns}
            palette={palette}
            isCurrent={data.isCurrent}
            referenceDate={data.referenceDate}
          />
          {patterns.insights.length > 0 ? (
            <View className="mt-3 gap-3">
              {patterns.insights.map((insight, index) => (
                <PatternCard
                  key={insight.id}
                  insight={insight}
                  icon={patternIcons[index % patternIcons.length]}
                  palette={palette}
                />
              ))}
            </View>
          ) : (
            <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
              No unusual patterns in your recent spending.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

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
  return (
    <View className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[13px] font-medium text-muted-foreground">
            {isCurrent
              ? "Today’s spending"
              : `Spending on ${referenceDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`}
          </Text>
          <Text className="mt-1 text-[26px] font-bold tracking-[-0.4px] text-foreground">
            {formatRand(patterns.todayTotal)}
          </Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            {patterns.todayCount === 0
              ? isCurrent
                ? "No spending recorded today"
                : "No spending recorded that day"
              : `${patterns.todayCount} ${patterns.todayCount === 1 ? "payment" : "payments"} recorded`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View today's transactions"
          className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-2 active:opacity-70"
          onPress={() => router.push("/(tabs)/transactions")}
        >
          <Text className="text-[12px] font-semibold text-foreground">View</Text>
          <ArrowUpRight color={palette.foreground} size={14} strokeWidth={2.2} />
        </Pressable>
      </View>

      {patterns.todayCategories.length > 0 ? (
        <View className="mt-4 gap-2 border-t border-border/60 pt-3">
          {patterns.todayCategories.slice(0, 4).map((category) => (
            <View key={category.name} className="flex-row items-center justify-between">
              <Text className="text-[13px] text-muted-foreground">{category.name}</Text>
              <Text className="text-[13px] font-semibold text-foreground">
                {formatRand(category.amount)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
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
    <View className="rounded-3xl border border-border/60 bg-card p-4">
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
