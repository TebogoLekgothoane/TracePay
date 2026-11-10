import {
  CalendarDays,
  ChevronRight,
  Coins,
  Lightbulb,
  Repeat,
  ShoppingBag,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { SpendingPatternInsight } from "../../features/insights/spending-patterns";
import { SkeletonRows } from "../ui/SkeletonGroups";
import { COLORS } from "../../theme/colors";

type Props = {
  insights: SpendingPatternInsight[];
  loading: boolean;
  /** True when there are no transactions at all. */
  noData: boolean;
  onSeeAll: () => void;
};

type InsightIcon = { Icon: LucideIcon; color: string };

const INSIGHT_ICONS: [string, InsightIcon][] = [
  ["takeaway", { Icon: UtensilsCrossed, color: "#F97316" }],
  ["category", { Icon: ShoppingBag, color: "#8B5CF6" }],
  ["small", { Icon: Coins, color: "#EAB308" }],
  ["day", { Icon: CalendarDays, color: "#3B82F6" }],
  ["weekend", { Icon: CalendarDays, color: "#3B82F6" }],
  ["repeat", { Icon: Repeat, color: "#14B8A6" }],
];

const FALLBACK_ICONS: InsightIcon[] = [
  { Icon: Lightbulb, color: "#F59E0B" },
  { Icon: Coins, color: "#EC4899" },
  { Icon: Repeat, color: "#22C55E" },
  { Icon: CalendarDays, color: "#06B6D4" },
];

function iconForInsight(id: string, index: number): InsightIcon {
  const match = INSIGHT_ICONS.find(([key]) => id.includes(key));
  return match ? match[1] : FALLBACK_ICONS[index % FALLBACK_ICONS.length];
}

/** "Insights for you" from the user's real recent spending. */
export function HomeInsights({ insights, loading, noData, onSeeAll }: Props) {
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
          {insights.map((insight, index) => {
            const { Icon, color } = iconForInsight(insight.id, index);
            return (
            <View
              key={insight.id}
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
            >
              <View className="h-10 w-10 items-center justify-center">
                <Icon color={color} size={22} strokeWidth={2.2} />
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
            </View>
            );
          })}
        </View>
      ) : loading ? (
        <SkeletonRows count={2} />
      ) : (
        <View className="rounded-2xl bg-card px-4 py-4">
          <Text className="text-[13px] leading-5 text-muted-foreground">
            {noData
              ? "Add a bank statement to get insights about your own spending."
              : "Nothing unusual in your recent spending."}
          </Text>
        </View>
      )}
    </View>
  );
}
