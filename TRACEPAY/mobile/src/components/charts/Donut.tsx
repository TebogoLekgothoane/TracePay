import { Text, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";

import { withAlpha } from "../../theme/colors";

type Props = {
  segments: { color: string; value: number }[];
  size?: number;
  centerLabel: string;
  centerValue: string;
  track: string;
  background: string;
  /** Index of the highlighted segment; others are dimmed. */
  highlight?: number | null;
};

/** Ring chart (Gifted Charts) with the total in the middle. */
export function Donut({ segments, size = 168, centerLabel, centerValue, background, highlight = null }: Props) {
  const radius = size / 2;
  return (
    <PieChart
      donut
      radius={radius}
      innerRadius={radius * 0.66}
      innerCircleColor={background}
      isAnimated
      animationDuration={700}
      data={segments.map((segment, index) => ({
        value: segment.value,
        color: highlight === null || highlight === index ? segment.color : withAlpha(segment.color, 0.3),
      }))}
      centerLabelComponent={() => (
        <View className="items-center">
          <Text className="text-[11px] text-muted-foreground">{centerLabel}</Text>
          <Text className="mt-0.5 text-[16px] font-bold tracking-[-0.3px] text-foreground" numberOfLines={1}>
            {centerValue}
          </Text>
        </View>
      )}
    />
  );
}
