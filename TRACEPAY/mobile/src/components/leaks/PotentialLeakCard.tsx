import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import type { PotentialLeak } from "../../features/leaks/potential-leaks";
import { COLORS, withAlpha } from "../../theme/colors";
import { REVIEW_STATUS_LABEL } from "../../features/leaks/potential-leaks";
import { ReviewIconTile, reviewIconColor, statusColor } from "./ReviewVisuals";

type Props = {
  leak: PotentialLeak;
  onPress: (id: string) => void;
};

export function PotentialLeakCard({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const badgeColor = statusColor(scheme, leak.status);
  const iconColor = reviewIconColor(scheme, leak.icon);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${leak.title}, ${leak.listAmount ?? leak.amount}, ${leak.description}`}
      onPress={() => onPress(leak.id)}
      className="flex-row items-center gap-3 rounded-3xl bg-card px-4 py-4 active:opacity-80"
    >
      <View
        className="rounded-2xl"
        style={{ backgroundColor: withAlpha(iconColor, 0.14) }}
      >
        <ReviewIconTile icon={leak.icon} color={iconColor} size={48} />
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-foreground">
            {leak.title}
          </Text>
          <View
            className="rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: withAlpha(badgeColor, 0.16) }}
          >
            <Text className="text-[11px] font-semibold" style={{ color: badgeColor }}>
              {REVIEW_STATUS_LABEL[leak.status]}
            </Text>
          </View>
        </View>
        <Text className="mt-0.5 text-[17px] font-bold text-foreground">
          {leak.listAmount ?? leak.amount}
        </Text>
        <Text numberOfLines={2} className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
          {leak.description}
        </Text>
        <Text className="mt-1 text-[12px] font-medium text-muted-foreground">
          {/^\d/.test(leak.nextCharge) ? `Next charge · ${leak.nextCharge}` : leak.nextCharge}
        </Text>
      </View>

      <ChevronRight color={palette.mutedForeground} size={18} />
    </Pressable>
  );
}
