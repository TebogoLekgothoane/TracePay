import { router } from "expo-router";
import { ChevronRight, Lightbulb, Receipt, TrendingUp } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import { COLORS, withAlpha } from "../../theme/colors";

const INSIGHT_ITEMS = [
  {
    id: "transport",
    text: "You spent ",
    highlight: "14% more",
    rest: " on transport than last month.",
    link: "View transport insights",
    route: "/insights" as const,
    Icon: TrendingUp,
    tone: "primary" as const,
  },
  {
    id: "fees",
    text: "Bank fees are ",
    highlight: "18% higher",
    rest: " than your monthly average.",
    link: "Review bank fees",
    route: "/leak/fees" as const,
    Icon: Receipt,
    tone: "accent" as const,
  },
  {
    id: "subs",
    text: "You could save ",
    highlight: "R430.00",
    rest: " by reviewing subscriptions.",
    link: "View subscriptions",
    route: "/leak/subs" as const,
    Icon: Lightbulb,
    tone: "warning" as const,
  },
] as const;

function toneColor(
  palette: {
    primary: string;
    accent: string;
    warning: string;
  },
  tone: (typeof INSIGHT_ITEMS)[number]["tone"],
) {
  if (tone === "accent") return palette.accent;
  if (tone === "warning") return palette.warning;
  return palette.primary;
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
    placeholder: string;
  };
}) {
  const color = toneColor(palette, item.tone);

  return (
    <View className="mr-3 w-[248px] rounded-3xl border border-border bg-card p-4">
      <View
        className="mb-3 h-10 w-10 items-center justify-center rounded-full"
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
      <Pressable
        className="mt-3 flex-row items-center gap-1 active:opacity-75"
        onPress={() => router.push(item.route)}
      >
        <Text className="text-[12px] font-semibold text-primary">{item.link}</Text>
        <ChevronRight color={palette.primary} size={14} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

export function InsightsForYouSection({
  onViewAll,
}: {
  onViewAll?: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          Insights for you
        </Text>
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-0.5 active:opacity-70"
          onPress={onViewAll}
        >
          <Text className="text-[14px] font-semibold text-primary">View all</Text>
          <ChevronRight color={palette.primary} size={16} strokeWidth={2.4} />
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
    </View>
  );
}
