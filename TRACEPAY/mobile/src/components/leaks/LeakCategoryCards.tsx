import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import type { LeakPreview } from "../dashboard/LeakSummary";
import { BrandLogo } from "../ui/BrandLogo";

/** A leak category tile; the Leaks tab scrolls them sideways. */
export function LeakCategoryCard({
  item,
  onPress,
}: {
  item: LeakPreview;
  onPress: (item: LeakPreview) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const changeColor = item.changeDirection === "down" ? "#22C55E" : "#F43F5E";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.amount}, ${item.change}`}
      onPress={() => onPress(item)}
      className="rounded-2xl bg-card p-3.5 active:opacity-80"
      style={{ width: 156 }}
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 text-[12px] font-medium text-muted-foreground"
        >
          {item.title}
        </Text>
        <ChevronRight color={palette.mutedForeground} size={16} strokeWidth={2} />
      </View>

      <View>
        <Text className="mt-3 text-[19px] font-bold tracking-[-0.3px] text-foreground">
          {item.amount}
        </Text>
        <Text className="mt-0.5 text-[11px] font-semibold" style={{ color: changeColor }}>
          {item.change}
        </Text>

        <View className="mt-2 min-h-[20px] flex-row items-center gap-1.5">
          {item.merchants.slice(0, 3).map((merchant) => (
            <BrandLogo
              key={merchant.id}
              name={merchant.name}
              logoDomain={merchant.logoDomain}
              size={20}
            />
          ))}
          {(item.moreCount ?? 0) > 0 ? (
            <View className="h-[20px] w-[20px] items-center justify-center rounded-full bg-muted">
              <Text className="text-[9px] font-bold text-muted-foreground">+{item.moreCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}