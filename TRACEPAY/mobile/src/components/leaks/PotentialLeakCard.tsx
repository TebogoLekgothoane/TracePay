import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import type { PotentialLeak } from "../../features/leaks/potential-leaks";
import { COLORS, withAlpha } from "../../theme/colors";
import { REVIEW_STATUS_LABEL } from "../../features/leaks/potential-leaks";
import { LeakAmount } from "./LeakAmount";
import { ReviewIconTile, statusColor } from "./ReviewVisuals";

type Props = {
  leak: PotentialLeak;
  onPress: (id: string) => void;
};

export function PotentialLeakCard({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const badgeColor = statusColor(scheme, leak.status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${leak.title}, ${leak.listAmount ?? leak.amount}, ${leak.description}`}
      onPress={() => onPress(leak.id)}
      className="flex-row items-center gap-3 rounded-[20px] bg-card py-3 pl-3 pr-3.5 active:opacity-80"
    >
      <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
        <ReviewIconTile icon={leak.icon} color={palette.foreground} size={44} />
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-[16px] font-bold text-foreground">
            {leak.title}
          </Text>
          <View
            className="rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: withAlpha(badgeColor, 0.16) }}
          >
            <Text className="text-[12px] font-semibold" style={{ color: badgeColor }}>
              {REVIEW_STATUS_LABEL[leak.status]}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-[14px] text-muted-foreground">
          {leak.description}
        </Text>
      </View>

      <View className="h-10 w-px bg-border" />
      <LeakAmount amount={leak.listAmount ?? leak.amount} />
      <ChevronRight color={palette.foreground} size={20} />
    </Pressable>
  );
}
