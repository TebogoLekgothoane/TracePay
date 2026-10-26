import { View } from "react-native";
import { BarChart } from "react-native-gifted-charts";

import { formatAxisRand, niceCeiling, useChartWidth } from "./chart-utils";

type Point = { label: string; current: number; previous: number };

type Props = {
  points: Point[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  colors: { current: string; previous: string; grid: string; label: string };
  height?: number;
};

const Y_AXIS_WIDTH = 40;

/** Grouped bars: this period beside the one before it. Tap a pair to read it. */
export function TrendBars({ points, selected, onSelect, colors, height = 190 }: Props) {
  const { width, onLayout } = useChartWidth();
  const max = niceCeiling(Math.max(1, ...points.flatMap((p) => [p.current, p.previous])));
  const chartWidth = Math.max(width - Y_AXIS_WIDTH - 8, 0);
  const slot = chartWidth / Math.max(points.length, 1);
  const barWidth = Math.max(Math.min(slot * 0.3, 18), 5);
  const pairGap = 3;
  const groupGap = Math.max(slot - barWidth * 2 - pairGap, 4);

  const fade = (color: string, index: number) => (selected === null || selected === index ? color : `${color}55`);

  const data = points.flatMap((point, index) => {
    const press = () => onSelect(selected === index ? null : index);
    return [
      {
        value: point.previous,
        frontColor: selected === null || selected === index ? colors.previous : `${colors.label}33`,
        spacing: pairGap,
        label: point.label,
        labelWidth: barWidth * 2 + pairGap + 14,
        labelTextStyle: { color: colors.label, fontSize: 10, textAlign: "center" as const },
        onPress: press,
      },
      {
        value: point.current,
        frontColor: fade(colors.current, index),
        spacing: groupGap,
        onPress: press,
      },
    ];
  });

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <BarChart
          data={data}
          width={chartWidth}
          height={height - 28}
          maxValue={max}
          noOfSections={3}
          barWidth={barWidth}
          initialSpacing={groupGap / 2}
          endSpacing={0}
          spacing={groupGap}
          barBorderTopLeftRadius={5}
          barBorderTopRightRadius={5}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          formatYLabel={(label: string) => formatAxisRand(Number(label))}
          yAxisTextStyle={{ color: colors.label, fontSize: 10 }}
          yAxisThickness={0}
          xAxisThickness={0}
          rulesColor={colors.grid}
          rulesType="solid"
          disableScroll
          isAnimated
          animationDuration={600}
        />
      ) : null}
    </View>
  );
}
