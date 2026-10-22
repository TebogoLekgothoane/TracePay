import { Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { LockedLeak } from "../../features/leaks/leak-paywall";
import { COLORS } from "../../theme/colors";
import { ReviewIconTile, reviewIconColor } from "./ReviewVisuals";

type Props = {
  leak: LockedLeak;
  onPress: () => void;
};

export function LockedLeakRow({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Locked leak, ${leak.monthlyAmount} per month. Unlock to see this leak.`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-3xl border border-border bg-card px-4 py-3 active:opacity-80"
    >
      <ReviewIconTile icon={leak.icon} color={reviewIconColor(scheme, leak.icon)} size={40} />
      <View className="min-w-0 flex-1">
        {/* Stand-in for the hidden leak name; the real name is never passed to this row. */}
        <View className="h-2.5 w-28 rounded-full bg-muted-foreground/25" />
        <View className="mt-2 flex-row items-center gap-1.5">
          <Lock color={palette.mutedForeground} size={14} strokeWidth={2.2} />
          <Text className="text-[13px] font-medium text-foreground">Unlock to see this leak</Text>
        </View>
      </View>
      <Text className="text-[15px] font-bold text-foreground">
        {leak.monthlyAmount}
        <Text className="text-[13px] font-normal text-muted-foreground"> / month</Text>
      </Text>
    </Pressable>
  );
}
