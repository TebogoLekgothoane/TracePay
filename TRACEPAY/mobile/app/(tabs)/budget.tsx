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
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

const PERIODS = ["This month", "Last month", "3 months", "Custom"] as const;
type Period = (typeof PERIODS)[number];

const CATEGORIES = [
  { name: "Transport", amount: "R1,816.74", percent: "31%", colorKey: "primary" as const, Icon: Car },
  { name: "Food & Dining", amount: "R1,406.51", percent: "24%", colorKey: "accent" as const, Icon: UtensilsCrossed },
  { name: "Shopping", amount: "R879.07", percent: "15%", colorKey: "warning" as const, Icon: ShoppingBag },
  { name: "Bills & utilities", amount: "R761.86", percent: "13%", colorKey: "success" as const, Icon: Zap },
  { name: "Entertainment", amount: "R644.65", percent: "11%", colorKey: "blue" as const, Icon: Film },
  { name: "Other", amount: "R351.62", percent: "6%", colorKey: "destructive" as const, Icon: Receipt },
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
  },
  {
    id: "fees",
    text: "Bank fees are ",
    highlight: "18% higher",
    rest: " than your monthly average.",
    link: "Review bank fees",
    Icon: Receipt,
    tone: "accent" as const,
  },
  {
    id: "subs",
    text: "You could save ",
    highlight: "R430.00",
    rest: " by reviewing subscriptions.",
    link: "View subscriptions",
    Icon: Lightbulb,
    tone: "warning" as const,
  },
];

const WEEKLY_TRENDS = [
  { current: 920, previous: 780 },
  { current: 1040, previous: 890 },
  { current: 1180, previous: 960 },
  { current: 620, previous: 540 },
  { current: 1100, previous: 980 },
];

function toneColor(
  palette: {
    primary: string;
    accent: string;
    warning: string;
    success: string;
    blue: string;
    destructive: string;
  },
  key: (typeof CATEGORIES)[number]["colorKey"] | (typeof INSIGHT_ITEMS)[number]["tone"],
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

          if (selected) {
            return (
              <Pressable key={period} onPress={() => onChange(period)}>
                <LinearGradient
                  colors={[trace.splashPayStart, trace.primary, trace.splashPayEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Text
                    style={{ color: trace.primaryForeground }}
                    className="text-[13px] font-semibold"
                  >
                    {period}
                  </Text>
                </LinearGradient>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={period}
              onPress={() => onChange(period)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
            >
              <Text className="text-[13px] font-medium text-muted-foreground">
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
}: {
  currentColor: string;
  previousColor: string;
}) {
  const max = 1200;
  const barWidth = 10;
  const gap = 6;
  const groupGap = 18;
  const chartHeight = 120;

  return (
    <Svg width="100%" height={150} viewBox="0 0 320 150">
      {[0, 300, 600, 900, 1200].map((value, index) => {
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

      {WEEKLY_TRENDS.map((week, index) => {
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
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  const donutSegments = useMemo(() => {
    const total = CATEGORIES.reduce(
      (sum, item) => sum + Number(item.percent.replace("%", "")),
      0,
    );
    const circumference = 2 * Math.PI * 46;
    let offset = 0;

    return CATEGORIES.map((item) => {
      const share = Number(item.percent.replace("%", "")) / total;
      const length = circumference * share;
      const segment = { color: toneColor(palette, item.colorKey), offset, length };
      offset += length;
      return segment;
    });
  }, [palette]);

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
            <Pressable className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-card active:opacity-75">
              <SlidersHorizontal color={palette.primary} size={18} strokeWidth={2} />
            </Pressable>
          </View>

          <View className="mt-5">
            <PeriodTabs active={period} onChange={setPeriod} />
          </View>

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
                  You spent
                </Text>
                <Text
                  style={{ color: trace.heroForeground }}
                  className="mt-1 text-[34px] font-bold tracking-[-0.8px]"
                >
                  R5,860.45
                </Text>
                <View
                  className="mt-2 self-start rounded-full px-3 py-1"
                  style={{ backgroundColor: withAlpha(trace.splashAccentPink, 0.2) }}
                >
                  <Text
                    className="text-[12px] font-semibold"
                    style={{ color: trace.splashAccentPink }}
                  >
                    ↑ 14% vs last month
                  </Text>
                </View>
              </View>

              <Pressable
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: trace.heroSubtle }}
              >
                <Text
                  style={{ color: trace.heroForeground }}
                  className="text-[12px] font-medium"
                >
                  Spending
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
                  R195.35
                </Text>
              </View>
              <View
                className="w-px"
                style={{ backgroundColor: withAlpha(trace.heroForeground, 0.12) }}
              />
              <View className="flex-1 pl-3">
                <Text style={{ color: trace.heroMuted }} className="text-[11px]">
                  Highest spending day
                </Text>
                <Text
                  style={{ color: trace.heroForeground }}
                  className="mt-1 text-[15px] font-bold"
                >
                  18 May • R620.00
                </Text>
              </View>
            </View>
          </LinearGradient>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              Spending by category
            </Text>
            <Pressable className="active:opacity-70">
              <Text className="text-[13px] font-semibold text-primary">View all</Text>
            </Pressable>
          </View>
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-3">
              <DonutChart segments={donutSegments} total="R5,860.45" />
              <View className="min-w-0 flex-1 gap-3">
                {CATEGORIES.map((item) => {
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
            <Pressable
              onPress={() => router.push("/insights")}
              className="active:opacity-70"
            >
              <Text className="text-[13px] font-semibold text-primary">View all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {INSIGHT_ITEMS.map((item) => (
              <InsightMiniCard key={item.id} item={item} palette={palette} />
            ))}
          </ScrollView>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              Spending trends
            </Text>
            <Pressable className="active:opacity-70">
              <Text className="text-[13px] font-semibold text-primary">
                View full report
              </Text>
            </Pressable>
          </View>
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="mb-4 flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[13px] text-muted-foreground">
                  This month vs last month
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <Text className="text-[11px] text-muted-foreground">This month</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: withAlpha(palette.primary, 0.25) }}
                    />
                    <Text className="text-[11px] text-muted-foreground">Last month</Text>
                  </View>
                </View>
              </View>
              <Pressable className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5 active:opacity-75">
                <Text className="text-[12px] font-medium text-foreground">By week</Text>
                <ChevronDown color={palette.mutedForeground} size={14} strokeWidth={2} />
              </Pressable>
            </View>

            <TrendsChart
              currentColor={palette.primary}
              previousColor={withAlpha(palette.primary, 0.22)}
            />

            <View className="mt-1 flex-row justify-between px-2">
              {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map((label) => (
                <Text key={label} className="text-[10px] text-muted-foreground">
                  {label}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
