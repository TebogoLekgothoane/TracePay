import { Pressable, Text, View } from "react-native";

import type { LockedLeak } from "../../features/leaks/leak-paywall";

type Props = {
  leak: LockedLeak;
  onPress: () => void;
};

export function LockedLeakRow({ leak, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Locked leak, ${leak.monthlyAmount} per month. Unlock to see this leak.`}
      onPress={onPress}
      className="flex-row items-center justify-between gap-3 rounded-3xl bg-card px-4 py-3 active:opacity-80"
    >
      <View className="min-w-0 flex-1">
        {/* Stand-in for the hidden leak name; the real name is never passed to this row. */}
        <View className="h-2.5 w-28 rounded-full bg-muted-foreground/25" />
        <Text className="mt-2 text-[13px] font-medium text-foreground">Unlock to see this leak</Text>
      </View>
      <Text className="text-[15px] font-bold text-foreground">
        {leak.monthlyAmount}
        <Text className="text-[13px] font-normal text-muted-foreground"> / month</Text>
      </Text>
    </Pressable>
  );
}
