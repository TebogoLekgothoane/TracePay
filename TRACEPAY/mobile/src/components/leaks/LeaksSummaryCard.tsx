import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { TRACEPAY, withAlpha } from "../../theme/colors";
import { LeaksPipeIllustration } from "./LeaksPipeIllustration";

type Props = {
  label?: string;
  total: string;
  changeLabel: string;
};

const CARD_HEIGHT = 156;

export function LeaksSummaryCard({
  label = "Total leaked this month",
  total,
  changeLabel,
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
        paddingHorizontal: 20,
        paddingVertical: 18,
        overflow: "hidden",
        minHeight: CARD_HEIGHT,
        borderWidth: 1,
        borderColor: withAlpha("#A78BFA", 0.22),
      }}
    >
      {/* Background: glow behind the tap, layered waves, and floating droplets. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 340 156" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="tapGlow" cx="285" cy="70" rx="130" ry="110" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.55" />
            <Stop offset="0.55" stopColor="#6D3FE0" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#6D3FE0" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="pinkGlow" cx="60" cy="150" rx="140" ry="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={trace.splashAccentPink} stopOpacity="0.16" />
            <Stop offset="1" stopColor={trace.splashAccentPink} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx="285" cy="70" r="140" fill="url(#tapGlow)" />
        <Circle cx="60" cy="150" r="150" fill="url(#pinkGlow)" />

        <Path
          d="M0 128 C60 108 120 144 190 124 C250 106 300 118 340 100 L340 156 L0 156 Z"
          fill="#8B5CF6"
          fillOpacity={0.1}
        />
        <Path
          d="M0 142 C70 126 130 150 205 136 C265 124 305 134 340 120 L340 156 L0 156 Z"
          fill="#8B5CF6"
          fillOpacity={0.14}
        />
        <Path
          d="M0 128 C60 108 120 144 190 124 C250 106 300 118 340 100"
          stroke="#C4B5FD"
          strokeOpacity={0.22}
          strokeWidth={1}
          fill="none"
        />

        <Circle cx="206" cy="36" r="2" fill="#C4B5FD" fillOpacity={0.5} />
        <Circle cx="226" cy="112" r="1.5" fill="#C4B5FD" fillOpacity={0.4} />
        <Circle cx="168" cy="82" r="1.5" fill="#C4B5FD" fillOpacity={0.3} />
        <Circle cx="322" cy="30" r="1.5" fill="#C4B5FD" fillOpacity={0.45} />
      </Svg>
      </View>

      <View className="flex-row items-center">
        <View className="flex-1 pr-2">
          <Text style={{ color: trace.heroMuted }} className="text-[13px]">
            {label}
          </Text>

          <Text
            style={{ color: trace.heroForeground }}
            className="mt-1.5 text-[30px] font-bold tracking-[-0.8px]"
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

        <View className="items-center justify-center pr-1">
          <LeaksPipeIllustration size={84} />
        </View>
      </View>
    </LinearGradient>
  );
}
