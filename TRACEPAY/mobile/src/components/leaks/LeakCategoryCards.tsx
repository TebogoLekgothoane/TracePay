import { ChevronRight, CreditCard, Layers, Smartphone } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import type { LeakPreview } from "../dashboard/LeakSummary";
import { BrandLogo } from "../ui/BrandLogo";

/** Category without its own brand logo gets the title's glyph instead. */
function titleIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("subscription") || t.includes("recurring")) return Layers;
  if (t.includes("airtime") || t.includes("data")) return Smartphone;
  return CreditCard;
}

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
  const down = item.changeDirection === "down";
  const changeColor = down ? "#22C55E" : "#F43F5E";
  const Icon = item.Icon ?? titleIcon(item.title);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.amount}, ${item.change}`}
      onPress={() => onPress(item)}
      className="overflow-hidden rounded-[20px] bg-card px-4 pb-3 pt-3.5 active:opacity-80"
      style={{ width: 146, minHeight: 112 }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon color={palette.foreground} size={17} strokeWidth={1.8} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] text-foreground">
            {item.title}
          </Text>
        </View>
        <ChevronRight color={palette.foreground} size={16} strokeWidth={2} />
      </View>

      <Text className="mt-3 text-[26px] font-bold tracking-[-0.5px] text-foreground">
        {item.amount}
      </Text>
      <Text className="mt-0.5 text-[13px] font-semibold" style={{ color: changeColor }}>
        {down ? "↓" : "↑"} {item.change.replace(/^[^\d]+/, "")}
      </Text>

      <View className="mt-2 min-h-[28px] flex-row items-center gap-2">
        {item.merchants.slice(0, 3).map((merchant) => (
          <BrandLogo
            key={merchant.id}
            name={merchant.name}
            logoDomain={merchant.logoDomain}
            size={28}
          />
        ))}
        {(item.moreCount ?? 0) > 0 ? (
          <View className="h-[28px] items-center justify-center rounded-full bg-muted px-2.5">
            <Text className="text-[12px] font-semibold text-muted-foreground">+{item.moreCount}</Text>
          </View>
        ) : null}

      </View>
    </Pressable>
  );
}
