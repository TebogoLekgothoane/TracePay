import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";

export type LeakMerchantPreview = {
  id: string;
  name: string;
  logoDomain: string;
};

export type LeakPreview = {
  id: string;
  title: string;
  amount: string;
  change: string;
  changeDirection: "up" | "down";
  Icon?: LucideIcon;
  iconTone: "gradient" | "solid" | "logo";
  tint: string;
  tintBg: string;
  gradientColors?: readonly [string, string];
  logoDomain?: string;
  merchants: LeakMerchantPreview[];
  moreCount?: number;
};

type Props = {
  items: LeakPreview[];
  onItemPress?: (item: LeakPreview) => void;
};

function CategoryIcon({ item }: { item: LeakPreview }) {
  const iconSize = 22;

  if (item.iconTone === "logo" && item.logoDomain) {
    return (
      <View className="mb-3">
        <BrandLogo
          name={item.title}
          logoDomain={item.logoDomain}
          size={40}
          fallbackColor={item.tintBg}
          shape="squircle"
        />
      </View>
    );
  }

  if (!item.Icon) {
    return <View className="mb-3 h-10 w-10" />;
  }

  return (
    <View className="mb-3 h-10 w-10 items-center justify-center">
      <item.Icon color={item.tint} size={iconSize} strokeWidth={2.2} />
    </View>
  );
}

export function LeakSummary({ items, onItemPress }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingRight: 8 }}
    >
      {items.map((item) => {
        const changeColor =
          item.changeDirection === "down" ? "#22C55E" : "#F43F5E";
        const showMerchants = item.merchants.length > 0 || (item.moreCount ?? 0) > 0;

        return (
          <Pressable
            key={item.id}
            onPress={() => onItemPress?.(item)}
            className="w-[152px] rounded-2xl border border-border/70 bg-card p-3.5 active:opacity-80"
          >
            <CategoryIcon item={item} />

            <Text className="text-[13px] font-medium text-muted-foreground">
              {item.title}
            </Text>
            <Text className="mt-1 text-[18px] font-bold tracking-[-0.3px] text-foreground">
              {item.amount}
            </Text>
            <Text
              className="mt-1 text-[12px] font-semibold"
              style={{ color: changeColor }}
            >
              {item.change}
            </Text>

            <View className="mt-3 min-h-[22px] flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                {showMerchants
                  ? item.merchants.map((merchant) => (
                      <BrandLogo
                        key={merchant.id}
                        name={merchant.name}
                        logoDomain={merchant.logoDomain}
                        size={22}
                      />
                    ))
                  : null}
                {(item.moreCount ?? 0) > 0 ? (
                  <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-muted">
                    <Text className="text-[9px] font-bold text-muted-foreground">
                      +{item.moreCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <ChevronRight
                color={palette.mutedForeground}
                size={16}
                strokeWidth={2}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
