import { ChevronRight, Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, View } from "react-native";

import type { LockedLeak } from "../../features/leaks/leak-paywall";
import { COLORS } from "../../theme/colors";
import { LeakAmount } from "./LeakAmount";
import { Smudge, usePulse } from "./Smudge";

type Props = {
  leak: LockedLeak;
  onPress: () => void;
};

/**
 * Same layout as PotentialLeakCard (icon tile, text, amount, chevron) with the
 * hidden text blurred. The real name and description are never passed in.
 */
export function LockedLeakRow({ leak, onPress }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const pulse = usePulse();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Locked leak, ${leak.monthlyAmount} per month. Unlock to see this leak.`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-[20px] bg-card py-3 pl-3 pr-3.5 active:opacity-80"
    >
      <View className="items-center justify-center" style={{ width: 48, height: 48 }}>
        <Lock color={palette.foreground} size={20} strokeWidth={2} />
      </View>

      <View className="min-w-0 flex-1 gap-2">
        <Smudge width={96} height={12} color={palette.foreground} pulse={pulse} />
        <Smudge width={132} height={10} color={palette.mutedForeground} pulse={pulse} />
      </View>

      <View className="h-10 w-px bg-border" />
      <LeakAmount amount={leak.monthlyAmount} />
      <ChevronRight color={palette.foreground} size={20} />
    </Pressable>
  );
}
