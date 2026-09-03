import { LinearGradient } from "expo-linear-gradient";
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
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";
import { IconButton } from "../../src/components/ui/IconButton";

const PERIODS = ["This month", "Last month", "3 months"] as const;
type Period = (typeof PERIODS)[number];

type InsightTone = "primary" | "success" | "accent";

type InsightItem = {
  id: string;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: InsightTone;
};

const INSIGHTS: InsightItem[] = [
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
];

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
    <View className="rounded-2xl bg-muted p-1.5">
      <View className="flex-row gap-1.5">
        {PERIODS.map((period) => {
          const selected = period === active;

          if (selected) {
            return (
              <Pressable
                key={period}
                onPress={() => onChange(period)}
                className="flex-1 active:opacity-85"
              >
                <LinearGradient
                  colors={[trace.splashPayStart, trace.primary, trace.splashPayEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 10,
                    alignItems: "center",
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
              className="flex-1 items-center rounded-full py-2.5 active:opacity-75"
            >
              <Text className="text-[13px] font-medium text-muted-foreground">
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
            {INSIGHTS.map((item) => {
              const color = toneColor(palette, item.tone);

              return (
                <Pressable
                  key={item.id}
                  className="flex-row items-center gap-3 rounded-3xl border border-border bg-card px-4 py-4 active:opacity-80"
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: withAlpha(color, 0.14) }}
                  >
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
                  <ChevronRight color={palette.placeholder} size={18} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
