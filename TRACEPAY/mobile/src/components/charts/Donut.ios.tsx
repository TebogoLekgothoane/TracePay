import { Chart, Host } from "@expo/ui/swift-ui";
import { Text, View } from "react-native";

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

/** Swift Charts ring with the total in the middle. */
export function Donut({ segments, size = 168, centerLabel, centerValue, highlight = null }: Props) {
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Host style={{ width: size, height: size }}>
        <Chart
          type="pie"
          animate
          data={segments.map((segment, index) => ({
            x: String(index),
            y: segment.value,
            color: highlight === null || highlight === index ? segment.color : withAlpha(segment.color, 0.3),
          }))}
          pieStyle={{ innerRadius: 0.66, angularInset: 2, cornerRadius: 4, opacity: 1 }}
        />
      </Host>
      <View className="absolute items-center px-6" pointerEvents="none">
        <Text className="text-[11px] text-muted-foreground">{centerLabel}</Text>
        <Text className="mt-0.5 text-[16px] font-bold tracking-[-0.3px] text-foreground" numberOfLines={1}>
          {centerValue}
        </Text>
      </View>
    </View>
  );
}
