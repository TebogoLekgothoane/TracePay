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
 * Same layout as PotentialLeakCard (text, amount, chevron) with the hidden
 * text blurred. The real name and description are never passed in.
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
      className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-2.5 active:opacity-80"
    >
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Smudge width={96} height={11} color={palette.foreground} pulse={pulse} />
          <Lock color={palette.mutedForeground} size={14} strokeWidth={2.4} />
        </View>
        <Smudge width={132} height={9} color={palette.mutedForeground} pulse={pulse} />
      </View>

      <LeakAmount amount={leak.monthlyAmount} />
      <ChevronRight color={palette.mutedForeground} size={18} />
    </Pressable>
  );
}
