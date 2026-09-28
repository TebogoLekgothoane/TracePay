import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  PiggyBank,
  Shirt,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import {
  PERIODS_WITHOUT_CUSTOM,
  type PeriodWithoutCustom,
} from "../../src/features/insights/period";
import { COLORS, TRACEPAY } from "../../src/theme/colors";

type Period = PeriodWithoutCustom;

type InsightTone = "primary" | "success" | "accent";

type InsightItem = {
  id: string;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: InsightTone;
};

const INSIGHTS_BY_PERIOD: Record<Period, InsightItem[]> = {
  "This month": [
    {
      id: "transport",
      title: "You spent more on transport",
      subtitle: "R320 more than last month",
      Icon: Lightbulb,
      tone: "primary",
    },
    {
      id: "entertainment",
      title: "You spent less on entertainment",
      subtitle: "R80 less than last month",
      Icon: Shirt,
      tone: "success",
    },
    {
      id: "savings",
      title: "You are saving more 🎉",
      subtitle: "R430 more than last month",
      Icon: PiggyBank,
      tone: "accent",
    },
    {
      id: "biggest",
      title: "Your biggest expense was",
      subtitle: "Shopping (R1,880)",
      Icon: Lightbulb,
      tone: "primary",
    },
  ],
  "Last month": [
    {
      id: "fees-last",
      title: "Bank fees spiked last month",
      subtitle: "R180 above your average",
      Icon: Lightbulb,
      tone: "primary",
    },
    {
      id: "food-last",
      title: "Food & dining cooled off",
      subtitle: "R210 less than the month before",
      Icon: Shirt,
      tone: "success",
    },
    {
      id: "subs-last",
      title: "Two unused subscriptions billed",
      subtitle: "R258 you could reclaim",
      Icon: PiggyBank,
      tone: "accent",
    },
    {
      id: "biggest-last",
      title: "Your biggest expense was",
      subtitle: "Transport (R1,640)",
      Icon: Lightbulb,
      tone: "primary",
    },
  ],
  "3 months": [
    {
      id: "trend-3m",
      title: "Transport rose for 3 months",
      subtitle: "Up 22% across the quarter",
      Icon: Lightbulb,
      tone: "primary",
    },
    {
      id: "save-3m",
      title: "You saved R1,120 this quarter",
      subtitle: "Mostly from fewer cash withdrawals",
      Icon: PiggyBank,
      tone: "accent",
    },
    {
      id: "ent-3m",
      title: "Entertainment stayed steady",
      subtitle: "Within 4% of your usual spend",
      Icon: Shirt,
      tone: "success",
    },
    {
      id: "biggest-3m",
      title: "Top category this quarter",
      subtitle: "Transport (R5,120)",
      Icon: Lightbulb,
      tone: "primary",
    },
    {
      id: "fees-3m",
      title: "Fees added up over 3 months",
      subtitle: "R1,980 in avoidable charges",
      Icon: Lightbulb,
      tone: "primary",
    },
  ],
};

function toneColor(
  palette: { primary: string; success: string; accent: string },
  tone: InsightTone,
) {
  if (tone === "success") return palette.success;
  if (tone === "accent") return palette.accent;
  return palette.primary;
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
    <View className="rounded-full bg-muted p-1.5">
      <View className="flex-row gap-1.5">
        {PERIODS_WITHOUT_CUSTOM.map((period) => {
          const selected = period === active;

          return (
            <Pressable
              key={period}
              onPress={() => onChange(period)}
              className="flex-1 items-center rounded-full py-2.5 active:opacity-75"
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
      </View>
    </View>
  );
}

export default function AllInsightsScreen() {
  const [period, setPeriod] = useState<Period>("This month");
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const insights = useMemo(() => INSIGHTS_BY_PERIOD[period], [period]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-5 flex-row items-center">
            <IconButton
              accessibilityLabel="Go back"
              className="mr-3"
              variant="outline"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <Text className="flex-1 text-center text-[18px] font-bold text-foreground">
              All insights
            </Text>
            <View className="h-10 w-10" />
          </View>

          <PeriodTabs active={period} onChange={setPeriod} />

          <View className="mt-5 gap-3">
            {insights.map((item) => {
              const color = toneColor(palette, item.tone);

              return (
                <Pressable
                  key={item.id}
                  className="flex-row items-center gap-3 rounded-3xl border border-border bg-card px-4 py-4 active:opacity-80"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-full">
                    <item.Icon color={color} size={20} strokeWidth={2.2} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {item.title}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-muted-foreground">
                      {item.subtitle}
                    </Text>
                  </View>
                  <ChevronRight
                    color={palette.placeholder}
                    size={18}
                    strokeWidth={2}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
