import { Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import type { PotentialLeak } from "../../features/leaks/potential-leaks";
import { ReviewIconTile, ReviewStatusBadge, reviewIconColor, statusColor } from "./ReviewVisuals";

type Props = {
  leak: PotentialLeak;
  onPress: (id: string) => void;
};

export function PotentialLeakCard({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const iconColor = reviewIconColor(scheme, leak.icon);
  const badgeColor = statusColor(scheme, leak.status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${leak.title}, ${leak.listAmount ?? leak.amount}, ${leak.description}`}
      onPress={() => onPress(leak.id)}
      className="flex-row items-start gap-3 rounded-3xl border border-border bg-card px-4 py-4 active:opacity-80"
    >
      <ReviewIconTile icon={leak.icon} color={iconColor} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-[15px] font-semibold text-foreground">
            {leak.title}
          </Text>
          <ReviewStatusBadge status={leak.status} color={badgeColor} />
        </View>
        <Text className="mt-1 text-[15px] font-bold text-foreground">
          {leak.listAmount ?? leak.amount}
        </Text>
        <Text className="mt-0.5 text-[13px] text-muted-foreground">{leak.description}</Text>
        <Text className="mt-1 text-[12px] font-medium text-foreground">
          {/^\d/.test(leak.nextCharge) ? `Next charge · ${leak.nextCharge}` : leak.nextCharge}
        </Text>
      </View>
    </Pressable>
  );
}
