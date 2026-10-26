import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  Car,
  ChevronDown,
  ChevronRight,
  Film,
  Receipt,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Zap,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { PeriodTabs } from "../../src/components/insights/PeriodTabs";
import { useInsightsReport } from "../../src/hooks/useInsightsReport";
import {
  comparisonCopy,
  formatChange,
  formatPeakDay,
  type TrendGrain,
} from "../../src/features/insights/insights-report";
import { formatPercent } from "../../src/features/insights/category-breakdown";
import { SpendingPatternsSection } from "../../src/components/insights/SpendingPatternsSection";
import { Button } from "../../src/components/ui/Button";
import { SelectionSheet } from "../../src/components/ui/Modal";
import { Skeleton } from "../../src/components/ui/Skeleton";
import {
  CUSTOM_RANGES,
  formatRandAmount,
  type CustomRange,
  type Period,
} from "../../src/features/insights/period";
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

type MetricMode = "Spending" | "Income";

type ToneKey = "primary" | "accent" | "warning" | "success" | "blue" | "destructive";

const TONE_ORDER: ToneKey[] = ["primary", "accent", "warning", "success", "blue", "destructive"];

const CATEGORY_ICONS: Array<{ match: RegExp; Icon: typeof Car }> = [
  { match: /transport|ride|taxi|fuel|petrol|parking/i, Icon: Car },
  { match: /food|grocer|restaurant|dining|coffee|takeaway|fast/i, Icon: UtensilsCrossed },
  { match: /shop|cloth|retail|online|electronics/i, Icon: ShoppingBag },
  { match: /bill|utilit|airtime|data|insurance|telecom|rent|fee|bank/i, Icon: Zap },
  { match: /entertain|subscription|stream|gaming|alcohol|leisure/i, Icon: Film },
  { match: /salary|income|interest|wage/i, Icon: TrendingUp },
];

/** Icon by what the category is called; colour by position so neighbours differ. */
function categoryVisual(name: string, index: number): { colorKey: ToneKey; Icon: typeof Car } {
  const match = CATEGORY_ICONS.find((entry) => entry.match.test(name));
  return {
    colorKey: TONE_ORDER[index % TONE_ORDER.length],
    Icon: match?.Icon ?? Receipt,
  };
}

function toneColor(
  palette: {
    primary: string;
    accent: string;
    warning: string;
    success: string;
    blue: string;
    destructive: string;
  },
  key: ToneKey,
) {
  if (key === "primary") return palette.primary;
  if (key === "accent") return palette.accent;
  if (key === "warning") return palette.warning;
  if (key === "success") return palette.success;
  if (key === "blue") return palette.blue;
  return palette.destructive;
}

function HeroSpendingChart({
  values,
  line,
  peak,
}: {
  values: number[];
  line: string;
  peak: string;
}) {
  const width = 320;
  const height = 96;
  const padX = 8;
  const top = 14;
  const bottom = 82;
  const max = Math.max(...values, 0);

  if (values.length < 2 || max === 0) {
    return (
      <Svg width="100%" height={96} viewBox="0 0 320 96">
        <Line
          x1={padX}
          y1={bottom}
          x2={width - padX}
          y2={bottom}
          stroke={withAlpha(line, 0.35)}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      </Svg>
    );
  }

  const step = (width - padX * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: padX + index * step,
    y: bottom - (value / max) * (bottom - top),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const peakIndex = values.indexOf(max);
  const peakPoint = points[peakIndex];

  return (
    <Svg width="100%" height={96} viewBox="0 0 320 96">
      <Path
        d={path}
        stroke={line}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <Circle cx={peakPoint.x} cy={peakPoint.y} r={5} fill={peak} />
      <Circle cx={peakPoint.x} cy={peakPoint.y} r={9} fill={withAlpha(peak, 0.25)} />
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
  const [showMetricSheet, setShowMetricSheet] = useState(false);
  const [showTrendSheet, setShowTrendSheet] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  const handlePeriodChange = (next: Period) => {
    setPeriod(next);
    if (next === "Custom") setShowCustomSheet(true);
  };

  const {
    data: categoryData,
    breakdown,
    loading: categoriesLoading,
    error: categoriesError,
    retry: retryCategories,
    report,
  } = useInsightsReport(period, customRange, metricMode, trendGrain);

  const categories = useMemo(
    () =>
      (breakdown?.slices ?? []).map((slice, index) => ({
        name: slice.name,
        amount: formatRandAmount(slice.amount),
        percent: formatPercent(slice.percent),
        share: slice.percent,
        ...categoryVisual(slice.name, index),
      })),
    [breakdown],
  );

  const heroTotal = report ? formatRandAmount(report.total) : "—";
  const dailyAverage = report ? formatRandAmount(report.dailyAverage) : "—";
  const peakDay = report ? formatPeakDay(report.peakDay, formatRandAmount) : "—";
  const changeLabel = report ? formatChange(report) : "Loading…";
  const trendPoints = useMemo(
    () =>
      (report?.trend ?? []).map((point) => ({
        current: Math.round(point.current),
        previous: Math.round(point.previous),
      })),
    [report],
  );
  const trendLabels = useMemo(() => (report?.trend ?? []).map((point) => point.label), [report]);

  const donutSegments = useMemo(() => {
    const total = categories.reduce((sum, item) => sum + item.share, 0) || 1;
    const circumference = 2 * Math.PI * 46;
    let offset = 0;

    return categories.map((item) => {
      const length = circumference * (item.share / total);
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
            <View className="h-10 w-10" />
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

          {categoryData && categoryData.range && (!categoryData.isCurrent || categoryData.truncated) ? (
            <View className="mt-3 rounded-2xl bg-muted px-3 py-2">
              <Text className="text-[12px] leading-[18px] text-muted-foreground">
                {!categoryData.isCurrent && categoryData.referenceDate
                  ? `Your latest statement activity is from ${categoryData.referenceDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}, so periods are counted back from then. Add a newer statement to see this month. `
                  : ""}
                {categoryData.truncated
                  ? "This period has more transactions than could be loaded, so figures may be slightly low. "
                  : ""}
              </Text>
            </View>
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
                    {changeLabel}
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
                values={report?.sparkline ?? []}
                line={trace.splashPayStart}
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
            <Button variant="ghost" className="px-0">
              {periodLabel}
            </Button>
          </View>
          <View className="rounded-3xl bg-card p-4">
            {categoriesLoading && !categoryData ? (
              <View className="gap-3 py-1">
                <Skeleton width="50%" height={18} />
                <Skeleton width="100%" height={120} radius={14} />
              </View>
            ) : categoriesError && !categoryData ? (
              <View>
                <Text className="text-[14px] font-semibold text-foreground">
                  Categories unavailable
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {categoriesError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 self-start active:opacity-70"
                  onPress={retryCategories}
                >
                  <Text className="text-[13px] font-semibold text-primary">Try again</Text>
                </Pressable>
              </View>
            ) : categories.length === 0 ? (
              <View>
                <Text className="text-[14px] font-semibold text-foreground">
                  {categoryData?.range
                    ? `No ${metricMode.toLowerCase()} in this period`
                    : "No transactions yet"}
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {categoryData?.range
                    ? "Nothing in your uploaded statements falls in this period. Try another period, or add the statement that covers it."
                    : "Add a bank statement to see where your money goes. Categories can only come from the statements you add."}
                </Text>
                {!categoryData?.range ? (
                  <Pressable
                    accessibilityRole="button"
                    className="mt-3 self-start active:opacity-70"
                    onPress={() => router.push("/statements/coverage")}
                  >
                    <Text className="text-[13px] font-semibold text-primary">
                      Add a statement
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <>
            <View className="flex-row items-center gap-3">
              <DonutChart segments={donutSegments} total={formatRandAmount(breakdown?.total ?? 0)} />
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
              </>
            )}
          </View>

          <SpendingPatternsSection />

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              {metricMode} trends
            </Text>
            <Button
              onPress={() => router.push("/insights")}
              variant="ghost"
              className="px-0"
            >
              View full report
            </Button>
          </View>
          <View className="rounded-3xl bg-card p-4">
            <View className="mb-4 flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[13px] text-muted-foreground">
                  {report ? comparisonCopy(report) : "Comparing with the period before"}
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

            {trendPoints.length === 0 || trendPoints.every((point) => point.current === 0 && point.previous === 0) ? (
              <Text className="py-6 text-center text-[13px] leading-5 text-muted-foreground">
                {categoriesLoading && !categoryData
                  ? "Reading your transactions…"
                  : "No activity in these periods yet. Trends appear once your statements cover them."}
              </Text>
            ) : (
              <>
                <TrendsChart
                  currentColor={palette.primary}
                  previousColor={withAlpha(palette.primary, 0.22)}
                  points={trendPoints}
                />

                <View className="mt-1 flex-row justify-between px-2">
                  {trendLabels.map((label, index) => (
                    <Text key={`${label}-${index}`} className="text-[10px] text-muted-foreground">
                      {label}
                    </Text>
                  ))}
                </View>
              </>
            )}
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
