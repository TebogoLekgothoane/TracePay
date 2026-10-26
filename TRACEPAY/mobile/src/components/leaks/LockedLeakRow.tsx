import { ChevronRight, Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { LockedLeak } from "../../features/leaks/leak-paywall";
import { COLORS } from "../../theme/colors";

type Props = {
  leak: LockedLeak;
  onPress: () => void;
};

export function LockedLeakRow({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Locked leak, ${leak.monthlyAmount} per month. Unlock to see this leak.`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-3xl bg-card px-4 py-3.5 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-muted">
        <Lock color={palette.mutedForeground} size={18} strokeWidth={2.2} />
      </View>

      {/* Stand-ins for the hidden leak name; the real name is never passed to this row. */}
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="h-2.5 w-24 rounded-full bg-muted-foreground/25" />
        <View className="h-2.5 w-16 rounded-full bg-muted-foreground/15" />
      </View>

      <Text className="text-[15px] font-bold text-foreground">
        {leak.monthlyAmount}
        <Text className="text-[13px] font-normal text-muted-foreground"> / mo</Text>
      </Text>
      <ChevronRight color={palette.mutedForeground} size={18} />
    </Pressable>
  );
}
