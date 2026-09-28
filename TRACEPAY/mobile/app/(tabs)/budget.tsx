import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  Car,
  ChevronDown,
  ChevronRight,
  Film,
  Lightbulb,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  UtensilsCrossed,
  Zap,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { SelectionSheet } from "../../src/components/ui/Modal";
import {
  CUSTOM_RANGES,
  PERIODS,
  formatRandAmount,
  periodChangeLabel,
  periodComparisonCopy,
  periodFactor,
  scaleRandAmount,
  type CustomRange,
  type Period,
} from "../../src/features/insights/period";
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

type MetricMode = "Spending" | "Income";
type TrendGrain = "By week" | "By month" | "By day";
type InsightFilter = "All" | "Spending" | "Fees" | "Savings";

const BASE_CATEGORIES = [
  { name: "Transport", amount: "R1,816.74", percent: "31%", colorKey: "primary" as const, Icon: Car },
  { name: "Food & Dining", amount: "R1,406.51", percent: "24%", colorKey: "accent" as const, Icon: UtensilsCrossed },
  { name: "Shopping", amount: "R879.07", percent: "15%", colorKey: "warning" as const, Icon: ShoppingBag },
  { name: "Bills & utilities", amount: "R761.86", percent: "13%", colorKey: "success" as const, Icon: Zap },
  { name: "Entertainment", amount: "R644.65", percent: "11%", colorKey: "blue" as const, Icon: Film },
  { name: "Other", amount: "R351.62", percent: "6%", colorKey: "destructive" as const, Icon: Receipt },
];

const INCOME_CATEGORIES = [
  { name: "Salary", amount: "R28,500.00", percent: "82%", colorKey: "success" as const, Icon: Zap },
  { name: "Side income", amount: "R3,200.00", percent: "9%", colorKey: "primary" as const, Icon: TrendingUp },
  { name: "Transfers in", amount: "R1,850.00", percent: "5%", colorKey: "blue" as const, Icon: Receipt },
  { name: "Refunds", amount: "R920.00", percent: "3%", colorKey: "accent" as const, Icon: ShoppingBag },
  { name: "Other", amount: "R430.00", percent: "1%", colorKey: "warning" as const, Icon: Film },
];

const INSIGHT_ITEMS = [
  {
    id: "transport",
    text: "You spent ",
    highlight: "14% more",
    rest: " on transport than last month.",
    link: "View transport insights",
    Icon: TrendingUp,
    tone: "primary" as const,
    filter: "Spending" as const,
  },
  {
    id: "fees",
    text: "Bank fees are ",
    highlight: "18% higher",
    rest: " than your monthly average.",
    link: "Review bank fees",
    Icon: Receipt,
    tone: "accent" as const,
    filter: "Fees" as const,
  },
  {
    id: "subs",
    text: "You could save ",
    highlight: "R430.00",
    rest: " by reviewing subscriptions.",
    link: "View subscriptions",
    Icon: Lightbulb,
    tone: "warning" as const,
    filter: "Savings" as const,
  },
];

const WEEKLY_TRENDS = [
  { current: 920, previous: 780 },
  { current: 1040, previous: 890 },
  { current: 1180, previous: 960 },
  { current: 620, previous: 540 },
  { current: 1100, previous: 980 },
];

const MONTHLY_TRENDS = [
  { current: 4200, previous: 3900 },
  { current: 5100, previous: 4700 },
  { current: 5860, previous: 5140 },
];

const DAILY_TRENDS = [
  { current: 180, previous: 150 },
  { current: 220, previous: 190 },
  { current: 310, previous: 240 },
  { current: 160, previous: 170 },
  { current: 290, previous: 210 },
  { current: 140, previous: 130 },
  { current: 250, previous: 200 },
];

const BASE_SPENDING = 5860.45;
const BASE_INCOME = 34900;
const BASE_DAILY = 195.35;

function toneColor(
  palette: {
    primary: string;
    accent: string;
    warning: string;
    success: string;
    blue: string;
    destructive: string;
  },
  key: (typeof BASE_CATEGORIES)[number]["colorKey"] | (typeof INSIGHT_ITEMS)[number]["tone"],
) {
  if (key === "primary") return palette.primary;
  if (key === "accent") return palette.accent;
  if (key === "warning") return palette.warning;
  if (key === "success") return palette.success;
  if (key === "blue") return palette.blue;
  return palette.destructive;
}

function PeriodTabs({
  active,
  onChange,
}: {
  active: Period;
  onChange: (period: Period) => void;
}) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
      >
        {PERIODS.map((period) => {
          const selected = period === active;

          return (
            <Pressable
              key={period}
              onPress={() => onChange(period)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
              style={selected ? { backgroundColor: trace.primary } : undefined}
            >
              <Text
                className={`text-[13px] ${selected ? "font-semibold" : "font-medium text-muted-foreground"}`}
                style={selected ? { color: trace.primaryForeground } : undefined}
              >
                {period}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function HeroSpendingChart({
  line,
  accent,
  peak,
}: {
  line: string;
  accent: string;
  peak: string;
}) {
  return (
    <Svg width="100%" height={96} viewBox="0 0 320 96">
      <Path
        d="M8 72 C40 58 58 82 92 54 C118 34 142 68 176 42 C204 22 232 58 268 36 C286 26 302 30 312 24"
        stroke={line}
        strokeWidth={3}
        fill="none"
        opacity={0.9}
      />
      <Line
        x1={176}
        y1={18}
        x2={176}
        y2={82}
        stroke={withAlpha(accent, 0.45)}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <Circle cx={176} cy={42} r={5} fill={peak} />
      <Circle cx={176} cy={42} r={9} fill={withAlpha(peak, 0.25)} />
    </Svg>
  );
}

function DonutChart({
  segments,
  total,
}: {
  segments: { color: string; offset: number; length: number }[];
  total: string;
}) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  return (
    <View className="h-[112px] w-[112px] items-center justify-center">
      <Svg width={112} height={112} viewBox="0 0 112 112">
        {segments.map((segment, index) => (
          <Circle
            key={index}
            cx={56}
            cy={56}
            r={radius}
            stroke={segment.color}
            strokeWidth={14}
            fill="none"
            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
            strokeDashoffset={-segment.offset}
            rotation={-90}
            origin="56, 56"
          />
        ))}
      </Svg>
      <View className="absolute items-center">
        <Text className="text-[11px] text-muted-foreground">Total</Text>
        <Text className="text-[13px] font-bold text-foreground">{total}</Text>
      </View>
    </View>
  );
}

function InsightMiniCard({
  item,
  palette,
}: {
  item: (typeof INSIGHT_ITEMS)[number];
  palette: {
    primary: string;
    accent: string;
    warning: string;
    success: string;
    blue: string;
    destructive: string;
    placeholder: string;
  };
}) {
  const color = toneColor(palette, item.tone);

  return (
    <View className="mr-3 w-[248px] rounded-3xl border border-border bg-card p-4">
      <View
        className="mb-3 h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(color, 0.14) }}
      >
        <item.Icon color={color} size={18} strokeWidth={2.2} />
      </View>
      <Text className="text-[14px] leading-5 text-foreground">
        {item.text}
        <Text style={{ color }} className="font-bold">
          {item.highlight}
        </Text>
        {item.rest}
      </Text>
      <Pressable className="mt-3 flex-row items-center gap-1 active:opacity-75">
        <Text className="text-[12px] font-semibold text-primary">{item.link}</Text>
        <ChevronRight color={palette.primary} size={14} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function TrendsChart({
  currentColor,
  previousColor,
  points,
}: {
  currentColor: string;
  previousColor: string;
  points: { current: number; previous: number }[];
}) {
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.current, point.previous]),
  );
  const barWidth = points.length > 5 ? 8 : 10;
  const gap = points.length > 5 ? 4 : 6;
  const groupGap = points.length > 5 ? 10 : 18;
  const chartHeight = 120;
  const gridSteps = 4;

  return (
    <Svg width="100%" height={150} viewBox="0 0 320 150">
      {Array.from({ length: gridSteps + 1 }, (_, index) => {
        const value = (max / gridSteps) * index;
        const y = 118 - (value / max) * chartHeight;
        return (
          <Line
            key={value}
            x1={8}
            y1={y}
            x2={312}
            y2={y}
            stroke={withAlpha(currentColor, 0.08)}
            strokeWidth={1}
          />
        );
      })}

      {points.map((week, index) => {
        const x = 24 + index * (barWidth * 2 + gap + groupGap);
        const currentHeight = (week.current / max) * chartHeight;
        const previousHeight = (week.previous / max) * chartHeight;

        return (
          <G key={index}>
            <Rect
              x={x}
              y={118 - previousHeight}
              width={barWidth}
              height={previousHeight}
              rx={4}
              fill={previousColor}
            />
            <Rect
              x={x + barWidth + gap}
              y={118 - currentHeight}
              width={barWidth}
              height={currentHeight}
              rx={4}
              fill={currentColor}
            />
          </G>
        );
      })}
    </Svg>
  );
}

export default function InsightsScreen() {
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [metricMode, setMetricMode] = useState<MetricMode>("Spending");
  const [trendGrain, setTrendGrain] = useState<TrendGrain>("By week");
  const [insightFilter, setInsightFilter] = useState<InsightFilter>("All");
  const [showMetricSheet, setShowMetricSheet] = useState(false);
  const [showTrendSheet, setShowTrendSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  const factor = periodFactor(period, customRange);

  const handlePeriodChange = (next: Period) => {
    setPeriod(next);
    if (next === "Custom") setShowCustomSheet(true);
  };

  const categories = useMemo(() => {
    const source = metricMode === "Spending" ? BASE_CATEGORIES : INCOME_CATEGORIES;
    return source.map((item) => ({
      ...item,
      amount: scaleRandAmount(item.amount, factor),
    }));
  }, [factor, metricMode]);

  const heroTotal = useMemo(
    () =>
      formatRandAmount(
        (metricMode === "Spending" ? BASE_SPENDING : BASE_INCOME) * factor,
      ),
    [factor, metricMode],
  );

  const dailyAverage = useMemo(() => {
    if (metricMode === "Income") {
      return formatRandAmount((BASE_INCOME / 30) * factor);
    }
    return formatRandAmount(BASE_DAILY * factor);
  }, [factor, metricMode]);

  const peakDay = useMemo(() => {
    if (period === "Last month") return "12 Apr • R540.00";
    if (period === "3 months") return "3 Mar • R890.00";
    if (period === "Custom") {
      if (customRange === "Last 7 days") return "Yesterday • R310.00";
      if (customRange === "Year to date") return "18 May • R1,120.00";
      return "2 days ago • R420.00";
    }
    return metricMode === "Income" ? "25 May • R28,500.00" : "18 May • R620.00";
  }, [customRange, metricMode, period]);

  const visibleInsights = useMemo(() => {
    const filtered =
      insightFilter === "All"
        ? INSIGHT_ITEMS
        : INSIGHT_ITEMS.filter((item) => item.filter === insightFilter);

    return filtered.map((item) => {
      if (!item.highlight.startsWith("R")) return item;
      return {
        ...item,
        highlight: scaleRandAmount(item.highlight, factor),
      };
    });
  }, [factor, insightFilter]);

  const trendPoints = useMemo(() => {
    const source =
      trendGrain === "By month"
        ? MONTHLY_TRENDS
        : trendGrain === "By day"
          ? DAILY_TRENDS
          : WEEKLY_TRENDS;

    return source.map((point) => ({
      current: Math.round(point.current * factor),
      previous: Math.round(point.previous * factor),
    }));
  }, [factor, trendGrain]);

  const trendLabels = useMemo(() => {
    if (trendGrain === "By month") return ["Mar", "Apr", "May"];
    if (trendGrain === "By day") {
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    }
    return ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"];
  }, [trendGrain]);

  const donutSegments = useMemo(() => {
    const total = categories.reduce(
      (sum, item) => sum + Number(item.percent.replace("%", "")),
      0,
    );
    const circumference = 2 * Math.PI * 46;
    let offset = 0;

    return categories.map((item) => {
      const share = Number(item.percent.replace("%", "")) / total;
      const length = circumference * share;
      const segment = { color: toneColor(palette, item.colorKey), offset, length };
      offset += length;
      return segment;
    });
  }, [categories, palette]);

  const periodLabel =
    period === "Custom" ? customRange : period;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-2">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Insights
              </Text>
              <Text className="mt-1 text-[14px] text-muted-foreground">
                Understand your money story
              </Text>
            </View>
            <IconButton
              accessibilityLabel="Filter insights"
              variant="outline"
              onPress={() => setShowFilterSheet(true)}
            >
              <SlidersHorizontal color={palette.primary} size={18} strokeWidth={2} />
            </IconButton>
          </View>

          <View className="mt-5">
            <PeriodTabs active={period} onChange={handlePeriodChange} />
          </View>
          {period === "Custom" ? (
            <Pressable
              onPress={() => setShowCustomSheet(true)}
              className="mt-2 self-start rounded-full bg-muted px-3 py-1.5 active:opacity-75"
            >
              <Text className="text-[12px] font-medium text-foreground">
                Range: {customRange}
              </Text>
            </Pressable>
          ) : null}

          <LinearGradient
            colors={[...trace.summaryGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 20,
              marginTop: 20,
              overflow: "hidden",
            }}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text style={{ color: trace.heroMuted }} className="text-[13px]">
                  {metricMode === "Spending" ? "You spent" : "You earned"}
                </Text>
                <Text
                  style={{ color: trace.heroForeground }}
                  className="mt-1 text-[34px] font-bold tracking-[-0.8px]"
                >
                  {heroTotal}
                </Text>
                <View
                  className="mt-2 self-start rounded-full px-3 py-1"
                  style={{ backgroundColor: withAlpha(trace.splashAccentPink, 0.2) }}
                >
                  <Text
                    className="text-[12px] font-semibold"
                    style={{ color: trace.splashAccentPink }}
                  >
                    {periodChangeLabel(period)}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setShowMetricSheet(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose spending or income"
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: trace.heroSubtle }}
              >
                <Text
                  style={{ color: trace.heroForeground }}
                  className="text-[12px] font-medium"
                >
                  {metricMode}
                </Text>
                <ChevronDown color={trace.heroForeground} size={14} strokeWidth={2} />
              </Pressable>
            </View>

            <View className="mt-2">
              <HeroSpendingChart
                line={trace.splashPayStart}
                accent={trace.splashAccentPink}
                peak={trace.splashAccentPink}
              />
            </View>

            <View
              className="mt-3 flex-row border-t pt-4"
              style={{ borderColor: withAlpha(trace.heroForeground, 0.12) }}
            >
              <View className="flex-1 pr-3">
                <Text style={{ color: trace.heroMuted }} className="text-[11px]">
                  Daily average
                </Text>
                <Text
                  style={{ color: trace.heroForeground }}
                  className="mt-1 text-[15px] font-bold"
                >
                  {dailyAverage}
                </Text>
              </View>
              <View
                className="w-px"
                style={{ backgroundColor: withAlpha(trace.heroForeground, 0.12) }}
              />
              <View className="flex-1 pl-3">
                <Text style={{ color: trace.heroMuted }} className="text-[11px]">
                  {metricMode === "Spending"
                    ? "Highest spending day"
                    : "Highest income day"}
                </Text>
                <Text
                  style={{ color: trace.heroForeground }}
                  className="mt-1 text-[15px] font-bold"
                >
                  {peakDay}
                </Text>
              </View>
            </View>
          </LinearGradient>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              {metricMode === "Spending"
                ? "Spending by category"
                : "Income by category"}
            </Text>
            <Button size="sm" variant="ghost" className="px-0">
              {periodLabel}
            </Button>
          </View>
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-3">
              <DonutChart segments={donutSegments} total={heroTotal} />
              <View className="min-w-0 flex-1 gap-3">
                {categories.map((item) => {
                  const color = toneColor(palette, item.colorKey);
                  return (
                    <View key={item.name} className="flex-row items-center gap-2.5">
                      <View
                        className="h-8 w-8 items-center justify-center rounded-full"
                        style={{ backgroundColor: withAlpha(color, 0.14) }}
                      >
                        <item.Icon color={color} size={14} strokeWidth={2.2} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-[12px] font-medium text-foreground">
                          {item.name}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[11px] font-semibold text-foreground">
                          {item.amount}
                        </Text>
                        <Text className="text-[10px] text-muted-foreground">
                          {item.percent}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              Insights for you
            </Text>
            <Button
              onPress={() => router.push("/insights")}
              size="sm"
              variant="ghost"
              className="px-0"
            >
              View all
            </Button>
          </View>
          {visibleInsights.length === 0 ? (
            <View className="rounded-3xl border border-border bg-card px-4 py-6">
              <Text className="text-[14px] text-muted-foreground">
                No insights match this filter.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {visibleInsights.map((item) => (
                <InsightMiniCard key={item.id} item={item} palette={palette} />
              ))}
            </ScrollView>
          )}

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              {metricMode} trends
            </Text>
            <Button
              onPress={() => router.push("/insights")}
              size="sm"
              variant="ghost"
              className="px-0"
            >
              View full report
            </Button>
          </View>
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="mb-4 flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[13px] text-muted-foreground">
                  {periodComparisonCopy(period)}
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <Text className="text-[11px] text-muted-foreground">
                      Current
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: withAlpha(palette.primary, 0.25) }}
                    />
                    <Text className="text-[11px] text-muted-foreground">
                      Previous
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => setShowTrendSheet(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose trend grouping"
                className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5 active:opacity-75"
              >
                <Text className="text-[12px] font-medium text-foreground">
                  {trendGrain}
                </Text>
                <ChevronDown color={palette.mutedForeground} size={14} strokeWidth={2} />
              </Pressable>
            </View>

            <TrendsChart
              currentColor={palette.primary}
              previousColor={withAlpha(palette.primary, 0.22)}
              points={trendPoints}
            />

            <View className="mt-1 flex-row justify-between px-2">
              {trendLabels.map((label) => (
                <Text key={label} className="text-[10px] text-muted-foreground">
                  {label}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </TabScrollView>

      <SelectionSheet
        visible={showMetricSheet}
        title="Show totals for"
        selected={metricMode}
        onSelect={setMetricMode}
        onClose={() => setShowMetricSheet(false)}
        options={[
          { value: "Spending", label: "Spending", description: "Money out" },
          { value: "Income", label: "Income", description: "Money in" },
        ]}
      />
      <SelectionSheet
        visible={showTrendSheet}
        title="Group trends"
        selected={trendGrain}
        onSelect={setTrendGrain}
        onClose={() => setShowTrendSheet(false)}
        options={[
          { value: "By week", label: "By week" },
          { value: "By month", label: "By month" },
          { value: "By day", label: "By day" },
        ]}
      />
      <SelectionSheet
        visible={showFilterSheet}
        title="Filter insights"
        selected={insightFilter}
        onSelect={setInsightFilter}
        onClose={() => setShowFilterSheet(false)}
        options={[
          { value: "All", label: "All insights" },
          { value: "Spending", label: "Spending" },
          { value: "Fees", label: "Fees" },
          { value: "Savings", label: "Savings" },
        ]}
      />
      <SelectionSheet
        visible={showCustomSheet}
        title="Custom range"
        selected={customRange}
        onSelect={setCustomRange}
        onClose={() => setShowCustomSheet(false)}
        options={CUSTOM_RANGES.map((range) => ({
          value: range,
          label: range,
        }))}
      />
    </SafeAreaView>
  );
}
