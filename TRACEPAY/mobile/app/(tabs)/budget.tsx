import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedBar } from "../../src/components/charts/AnimatedBar";
import { CalendarHeat } from "../../src/components/charts/CalendarHeat";
import { Donut } from "../../src/components/charts/Donut";
import { PaceChart } from "../../src/components/charts/PaceChart";
import { RankedBars, type RankedBarItem } from "../../src/components/charts/RankedBars";
import { TrendBars } from "../../src/components/charts/TrendBars";
import { WeekdayBars } from "../../src/components/charts/WeekdayBars";
import { formatRandWhole } from "../../src/components/charts/chart-utils";
import { PeriodTabs } from "../../src/components/insights/PeriodTabs";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { ChoiceMenu } from "../../src/components/ui/ChoiceMenu";
import { SegmentToggle } from "../../src/components/ui/SegmentToggle";
import { SkeletonCard } from "../../src/components/ui/SkeletonGroups";
import { formatPercent } from "../../src/features/insights/category-breakdown";
import {
  buildCashFlow,
  buildCategoryMovement,
  buildHighlights,
  buildLargestPayments,
  buildSpendingCalendar,
  buildSpendingDrivers,
  buildSpendingPace,
  buildTopMerchants,
  buildWeekdayAverages,
} from "../../src/features/insights/insights-analytics";
import type { TrendGrain } from "../../src/features/insights/insights-report";
import { CUSTOM_RANGES, type CustomRange, type Period } from "../../src/features/insights/period";
import { useCountUp } from "../../src/hooks/useCountUp";
import { useInsightsReport } from "../../src/hooks/useInsightsReport";
import { COLORS, withAlpha } from "../../src/theme/colors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SPEND_VIEWS = ["Categories", "Merchants"] as const;
const TIME_VIEWS = ["Calendar", "Weekdays"] as const;
const GRAINS: readonly TrendGrain[] = ["By week", "By month", "By day"];

function shortDate(key: string): string {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function periodSubtitle(range: { startKey: string; endKey: string } | null): string {
  if (!range) return "From your imported statements";
  return range.startKey === range.endKey
    ? shortDate(range.startKey)
    : `${shortDate(range.startKey)} – ${shortDate(range.endKey)}`;
}

/** Cards rise into place one after another; `order` sets the stagger. */
function Card({ title, action, order = 0, children }: { title?: string; action?: ReactNode; order?: number; children: ReactNode }) {
  return (
    <Animated.View className="mt-6" entering={FadeInDown.delay(order * 70).duration(420)}>
      {title ? (
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <Text className="text-[17px] font-bold text-foreground">{title}</Text>
          {action}
        </View>
      ) : null}
      <View className="rounded-3xl bg-card p-4">{children}</View>
    </Animated.View>
  );
}

export default function InsightsScreen() {
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [trendGrain, setTrendGrain] = useState<TrendGrain>("By week");
  const [spendView, setSpendView] = useState<(typeof SPEND_VIEWS)[number]>("Categories");
  const [timeView, setTimeView] = useState<(typeof TIME_VIEWS)[number]>("Calendar");
  const [trendIndex, setTrendIndex] = useState<number | null>(null);
  const [calendarKey, setCalendarKey] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const { data, breakdown, report, loading, error, retry } = useInsightsReport(
    period,
    customRange,
    "Spending",
    trendGrain,
  );

  const animatedTotal = useCountUp(report?.total ?? 0);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const range = data?.range ?? null;
  const hasData = Boolean(range) && (report?.total ?? 0) > 0;

  const analytics = useMemo(() => {
    if (!range) return null;
    return {
      cashFlow: buildCashFlow(rows, range),
      pace: buildSpendingPace(rows, range),
      movement: new Map(buildCategoryMovement(rows, range, 50).map((entry) => [entry.name, entry])),
      merchants: buildTopMerchants(rows, range),
      calendar: buildSpendingCalendar(rows, range),
      weekdays: buildWeekdayAverages(rows, range),
      largest: buildLargestPayments(rows, range),
      drivers: buildSpendingDrivers(rows, range),
    };
  }, [rows, range]);

  const highlights = useMemo(
    () =>
      analytics
        ? buildHighlights({
            total: report?.total ?? 0,
            pace: analytics.pace,
            weekdays: analytics.weekdays,
            merchants: analytics.merchants,
            largest: analytics.largest,
            cashFlow: analytics.cashFlow,
            money: formatRandWhole,
            dateLabel: shortDate,
          })
        : [],
    [analytics, report],
  );

  const categoryColors = [palette.primary, palette.blue, palette.accent, palette.success, palette.warning, palette.mutedForeground];
  const barColors = { up: palette.destructive, down: palette.success, neutral: palette.mutedForeground };
  const gridColor = withAlpha(palette.mutedForeground, 0.18);
  const slices = breakdown?.slices ?? [];

  const categoryItems: RankedBarItem[] = slices.map((slice, index) => {
    const change = analytics?.movement.get(slice.name)?.changePercent ?? null;
    const rounded = change === null ? null : Math.round(change);
    return {
      key: slice.name,
      label: slice.name,
      value: formatRandWhole(slice.amount),
      caption: `${formatPercent(slice.percent)} of spending`,
      detail: rounded === null || rounded === 0 ? undefined : `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}% vs before`,
      detailTone: rounded === null ? "neutral" : rounded > 0 ? "up" : "down",
      ratio: slice.amount / (slices[0]?.amount || 1),
      color: categoryColors[index % categoryColors.length],
    };
  });

  const topMerchantAmount = analytics?.merchants[0]?.amount || 1;
  const merchantItems: RankedBarItem[] = (analytics?.merchants ?? []).map((merchant) => ({
    key: merchant.name,
    label: merchant.name,
    value: formatRandWhole(merchant.amount),
    caption: `${merchant.count} ${merchant.count === 1 ? "payment" : "payments"}`,
    ratio: merchant.amount / topMerchantAmount,
    color: palette.primary,
  }));

  const trendPoints = report?.trend ?? [];
  const trendHasData = trendPoints.some((point) => point.current > 0 || point.previous > 0);
  const trendSelected = trendIndex !== null ? trendPoints[trendIndex] : null;

  const pace = analytics?.pace;
    const totalDays = (() => {
    if (!range || !pace?.projected) return pace?.current.length ?? 0;
    const [year, month] = range.startKey.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  })();

  const change = report?.changePercent ?? null;
  const spendingUp = change !== null && change > 0;
  const cashFlow = analytics?.cashFlow;
  const selectedDay = calendarKey ? analytics?.calendar.find((day) => day.key === calendarKey) : null;

  const handlePeriodChange = (next: Period) => {
    setPeriod(next);
    setTrendIndex(null);
    setCalendarKey(null);
    setCategoryKey(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2">
          <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">Insights</Text>
          <Text className="mt-1 text-[14px] text-muted-foreground">{periodSubtitle(range)}</Text>

          <View className="mt-5">
            <PeriodTabs active={period} onChange={handlePeriodChange} />
          </View>
          {period === "Custom" ? (
            <View className="mt-2 flex-row">
              <ChoiceMenu value={customRange} options={CUSTOM_RANGES} onChange={setCustomRange} accessibilityLabel="Custom range" />
            </View>
          ) : null}

          {data && range && (!data.isCurrent || data.truncated) ? (
            <View className="mt-3 rounded-2xl bg-muted px-3 py-2">
              <Text className="text-[12px] leading-[18px] text-muted-foreground">
                {!data.isCurrent && data.referenceDate
                  ? `Your latest statement activity is from ${data.referenceDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}, so periods are counted back from then. Add a newer statement to see this month. `
                  : ""}
                {data.truncated ? "This period has more transactions than could be loaded, so figures may be slightly low." : ""}
              </Text>
            </View>
          ) : null}

          {loading && !data ? (
            <View className="mt-6 gap-4">
              <SkeletonCard height={90} />
              <SkeletonCard height={180} />
              <SkeletonCard height={140} />
            </View>
          ) : error && !data ? (
            <Card>
              <Text className="text-[14px] font-semibold text-foreground">Insights unavailable</Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4" variant="secondary" onPress={retry}>
                Try again
              </Button>
            </Card>
          ) : !hasData || !analytics ? (
            <Card>
              <Text className="text-[14px] font-semibold text-foreground">
                {range ? "No spending in this period" : "No transactions yet"}
              </Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                {range
                  ? "Nothing in your imported statements falls in this period. Try another period, or add the statement that covers it."
                  : "Add a bank statement and your spending, habits and trends appear here."}
              </Text>
              {!range ? (
                <Button className="mt-4" onPress={() => router.push("/statements/coverage")}>
                  Add a statement
                </Button>
              ) : null}
            </Card>
          ) : (
            <View key={period}>
              <Card order={0}>
                <Text className="text-[13px] text-muted-foreground">Spent</Text>
                <Text className="mt-1 text-[36px] font-bold tracking-[-1px] text-foreground">
                  {formatRandWhole(animatedTotal)}
                </Text>
                <Text
                  className="mt-1 text-[13px] font-medium"
                  style={{ color: change === null ? palette.mutedForeground : spendingUp ? palette.destructive : palette.success }}
                >
                  {change === null
                    ? "No earlier period to compare"
                    : Math.round(change) === 0
                      ? `In line with the previous ${report?.days} days`
                      : `${spendingUp ? "Up" : "Down"} ${Math.abs(Math.round(change))}% on the previous ${report?.days} days`}
                </Text>

                {analytics.drivers.length > 0 ? (
                  <View className="mt-4 gap-2 border-t border-border/60 pt-4">
                    <Text className="text-[12px] text-muted-foreground">Biggest changes</Text>
                    {analytics.drivers.map((driver) => (
                      <View key={driver.name} className="flex-row items-center justify-between">
                        <Text className="text-[14px] text-foreground">{driver.name}</Text>
                        <Text className="text-[14px] font-semibold" style={{ color: driver.delta > 0 ? palette.destructive : palette.success }}>
                          {driver.delta > 0 ? "+" : "−"}
                          {formatRandWhole(Math.abs(driver.delta))}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {cashFlow && cashFlow.income > 0 ? (
                  <View className="mt-4 border-t border-border/60 pt-4">
                    <View className="flex-row justify-between gap-3">
                      <Text className="text-[12px] text-muted-foreground">Money in {formatRandWhole(cashFlow.income)}</Text>
                      <Text className="text-[12px] font-semibold" style={{ color: cashFlow.net >= 0 ? palette.success : palette.destructive }}>
                        {cashFlow.net >= 0
                          ? `${formatRandWhole(cashFlow.net)} left (${Math.round(cashFlow.savingsRate ?? 0)}%)`
                          : `${formatRandWhole(-cashFlow.net)} over`}
                      </Text>
                    </View>
                    <View className="mt-2">
                      <AnimatedBar
                        ratio={cashFlow.spending / cashFlow.income}
                        color={cashFlow.net >= 0 ? palette.primary : palette.destructive}
                        track={gridColor}
                        height={8}
                        delay={200}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>

              {highlights.length > 0 ? (
                <Card title="Worth knowing" order={1}>
                  <View className="gap-3.5">
                    {highlights.map((line) => (
                      <Text key={line.id} className="text-[14px] leading-[21px] text-muted-foreground">
                        {line.before}
                        <Text className="font-semibold text-foreground">{line.strong}</Text>
                        {line.after}
                      </Text>
                    ))}
                  </View>
                </Card>
              ) : null}

              {pace && pace.current.length > 1 ? (
                <Card title="Spending pace" order={2}>
                  <Text className="mb-1 text-[13px] text-muted-foreground">
                    {formatRandWhole(pace.current[pace.current.length - 1] ?? 0)} so far, against{" "}
                    {formatRandWhole(pace.previousAtSameDay)} by this day last time. Drag across the chart to read any day.
                  </Text>
                  <View className="mt-3">
                    <PaceChart
                      current={pace.current}
                      previous={pace.previous}
                      labels={pace.labels}
                      totalDays={totalDays}
                      projected={pace.projected}
                      colors={{
                        line: palette.primary,
                        previous: withAlpha(palette.mutedForeground, 0.7),
                        grid: gridColor,
                        label: palette.mutedForeground,
                        card: palette.card,
                        foreground: palette.foreground,
                      }}
                    />
                  </View>
                  <View className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-1">
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.primary }} />
                      <Text className="text-[12px] text-muted-foreground">This period</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-0.5 w-3" style={{ backgroundColor: withAlpha(palette.mutedForeground, 0.7) }} />
                      <Text className="text-[12px] text-muted-foreground">Previous</Text>
                    </View>
                    {pace.projected !== null ? (
                      <View className="flex-row items-center gap-1.5">
                        <View className="h-0.5 w-3" style={{ backgroundColor: palette.primary, opacity: 0.6 }} />
                        <Text className="text-[12px] text-muted-foreground">Projected</Text>
                      </View>
                    ) : null}
                  </View>
                </Card>
              ) : null}

              <Card title="Where it went" order={3} action={<SegmentToggle value={spendView} options={SPEND_VIEWS} onChange={setSpendView} />}>
                {spendView === "Categories" && slices.length > 0 ? (
                  <>
                    <View className="items-center">
                      <Donut
                        segments={slices.map((slice, index) => ({ color: categoryColors[index % categoryColors.length], value: slice.amount }))}
                        centerLabel="Total"
                        centerValue={formatRandWhole(breakdown?.total ?? 0)}
                        track={gridColor}
                        background={palette.card}
                        highlight={categoryKey ? slices.findIndex((slice) => slice.name === categoryKey) : null}
                      />
                    </View>
                    <View className="mt-5">
                      <RankedBars
                        items={categoryItems}
                        track={gridColor}
                        colors={barColors}
                        selectedKey={categoryKey}
                        onPress={(key) => setCategoryKey((current) => (current === key ? null : key))}
                      />
                    </View>
                  </>
                ) : spendView === "Merchants" && merchantItems.length > 0 ? (
                  <RankedBars items={merchantItems} track={gridColor} colors={barColors} />
                ) : (
                  <Text className="text-[13px] leading-5 text-muted-foreground">Nothing to show for this view yet.</Text>
                )}
              </Card>

              {analytics.calendar.length > 1 ? (
                <Card title="When you spend" order={4} action={<SegmentToggle value={timeView} options={TIME_VIEWS} onChange={setTimeView} />}>
                  {timeView === "Calendar" ? (
                    <>
                      <Text className="mb-3 text-[13px] text-muted-foreground">
                        {selectedDay
                          ? `${shortDate(selectedDay.key)} · ${selectedDay.amount > 0 ? formatRandWhole(selectedDay.amount) : "No spending"}`
                          : analytics.calendar.length >= 35
                            ? "The last five weeks. Tap a day; darker days cost more."
                            : "Tap a day. Darker days cost more."}
                      </Text>
                      <CalendarHeat
                        days={analytics.calendar}
                        selectedKey={calendarKey}
                        onSelect={setCalendarKey}
                        colors={{
                          hot: palette.primary,
                          empty: withAlpha(palette.mutedForeground, 0.1),
                          text: palette.foreground,
                          textOnHot: "#FFFFFF",
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <Text className="mb-4 text-[13px] text-muted-foreground">Average spend on each day of the week.</Text>
                      <WeekdayBars days={analytics.weekdays} colors={{ bar: withAlpha(palette.primary, 0.3), highlight: palette.primary, grid: gridColor, label: palette.mutedForeground }} />
                    </>
                  )}
                </Card>
              ) : null}

              {trendHasData ? (
                <Card
                  order={5}
                  title="Trend"
                  action={
                    <ChoiceMenu
                      value={trendGrain}
                      options={GRAINS}
                      accessibilityLabel="Group trend by"
                      onChange={(next) => {
                        setTrendIndex(null);
                        setTrendGrain(next);
                      }}
                    />
                  }
                >
                  <Text className="mb-3 text-[13px] text-muted-foreground">
                    {trendSelected
                      ? `${trendSelected.label}: ${formatRandWhole(trendSelected.current)} against ${formatRandWhole(trendSelected.previous)} before`
                      : "Each bar is compared with the same stretch before it."}
                  </Text>
                  <TrendBars
                    points={trendPoints}
                    selected={trendIndex}
                    onSelect={setTrendIndex}
                    colors={{
                      current: palette.primary,
                      previous: withAlpha(palette.primary, 0.25),
                      grid: gridColor,
                      label: palette.mutedForeground,
                    }}
                  />
                </Card>
              ) : null}
            </View>
          )}

        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
