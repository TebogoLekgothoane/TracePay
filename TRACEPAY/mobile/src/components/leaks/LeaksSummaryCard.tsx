import { LinearGradient } from "expo-linear-gradient";
import { Info } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { TRACEPAY, withAlpha } from "../../theme/colors";
import { Button } from "../ui/Button";
import { LeaksPipeIllustration } from "./LeaksPipeIllustration";

type Props = {
  total: string;
  changeLabel: string;
  spendingPercent: string;
  onHowWeCalculate?: () => void;
};

export function LeaksSummaryCard({
  total,
  changeLabel,
  spendingPercent,
  onHowWeCalculate,
}: Props) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <LinearGradient
      colors={[...trace.summaryGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 20,
        overflow: "hidden",
        minHeight: 168,
      }}
    >
      <View className="flex-row">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center gap-1.5">
            <Text style={{ color: trace.heroMuted }} className="text-[13px]">
              Total leaked this month
            </Text>
            <Info color={trace.heroMuted} size={14} strokeWidth={2} />
          </View>

          <Text
            style={{ color: trace.heroForeground }}
            className="mt-2 text-[32px] font-bold tracking-[-0.8px]"
          >
            {total}
          </Text>

          <View
            className="mt-2 self-start rounded-full px-3 py-1"
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
          <LeaksPipeIllustration
            accent={trace.splashAccentPink}
            primary={trace.primary}
            highlight={trace.splashPayStart}
          />
        </View>
      </View>

      <View className="mt-3 flex-row items-end justify-between">
        <Text
          style={{ color: trace.heroMuted }}
          className="flex-1 text-[13px] leading-5"
        >
          That&apos;s{" "}
          <Text
            style={{ color: trace.splashAccentPink }}
            className="font-bold"
          >
            {spendingPercent}
          </Text>{" "}
          of your total spending
        </Text>

        <Button
          onPress={onHowWeCalculate}
          size="sm"
          variant="ghost"
          className="ml-3 px-3 py-1.5"
          style={{ backgroundColor: trace.heroSubtle }}
        >
          <>
            <Info color={trace.heroForeground} size={13} strokeWidth={2} />
            <Text
              style={{ color: trace.heroForeground }}
              className="text-[11px] font-medium opacity-85"
            >
              How we calculate
            </Text>
          </>
        </Button>
      </View>
    </LinearGradient>
  );
}
