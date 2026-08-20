import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { COLORS, type ImpactTone, getImpactToneStyles } from "../../theme/colors";

export type TopLeakItem = {
  id: string;
  title: string;
  description: string;
  amount: string;
  percentLabel: string;
  impactLabel: string;
  impact: ImpactTone;
  Icon: LucideIcon;
};

type Props = {
  item: TopLeakItem;
  isLast?: boolean;
  onPress?: () => void;
};

export function TopLeakRow({ item, isLast, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const impact = getImpactToneStyles(scheme, item.impact);

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-75 ${
        !isLast ? "border-b border-border/60" : ""
      }`}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: impact.surface }}
      >
        <item.Icon color={impact.color} size={20} strokeWidth={2.2} />
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-[15px] font-semibold text-foreground">
            {item.title}
          </Text>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: impact.surface }}
          >
            <Text
              className="text-[10px] font-semibold"
              style={{ color: impact.color }}
            >
              {item.impactLabel}
            </Text>
          </View>
        </View>
        <Text className="mt-0.5 text-[12px] text-muted-foreground">
          {item.description}
        </Text>
      </View>

      <View className="items-end">
        <Text className="text-[15px] font-bold text-foreground">
          {item.amount}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground">
          {item.percentLabel}
        </Text>
      </View>

      <ChevronRight color={palette.placeholder} size={18} strokeWidth={2} />
    </Pressable>
  );
}
