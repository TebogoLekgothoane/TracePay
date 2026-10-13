import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { TRACEPAY, withAlpha } from "../../theme/colors";
import { LeaksPipeIllustration } from "./LeaksPipeIllustration";

type Props = {
  total: string;
  changeLabel: string;
};

export function LeaksSummaryCard({ total, changeLabel }: Props) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <LinearGradient
      colors={[...trace.summaryGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 16,
        overflow: "hidden",
        minHeight: 136,
      }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-2">
          <Text style={{ color: trace.heroMuted }} className="text-[13px]">
            Total leaked this month
          </Text>

          <Text
            style={{ color: trace.heroForeground }}
            className="mt-1.5 text-[28px] font-bold tracking-[-0.8px]"
          >
            {total}
          </Text>

          <View
            className="mt-1.5 self-start rounded-full px-3 py-1"
            style={{ backgroundColor: withAlpha(trace.splashAccentPink, 0.2) }}
          >
            <Text
              style={{ color: trace.splashAccentPink }}
              className="text-[12px] font-semibold"
            >
              {changeLabel}
            </Text>
          </View>
        </View>

        <View className="items-center justify-center">
          <LeaksPipeIllustration size={96} />
        </View>
      </View>
    </LinearGradient>
  );
}
