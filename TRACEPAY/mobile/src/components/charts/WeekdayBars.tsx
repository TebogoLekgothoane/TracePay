import { View } from "react-native";
import { BarChart } from "react-native-gifted-charts";

import type { WeekdayAverage } from "../../features/insights/insights-analytics";
import { formatAxisRand, niceCeiling, useChartWidth } from "./chart-utils";

type Props = {
  days: WeekdayAverage[];
  colors: { bar: string; highlight: string; grid: string; label: string };
  height?: number;
};

const Y_AXIS_WIDTH = 40;

/** Average spend for each day of the week; the heaviest day is emphasised. */
export function WeekdayBars({ days, colors, height = 170 }: Props) {
  const { width, onLayout } = useChartWidth();
  const max = niceCeiling(Math.max(...days.map((day) => day.average), 1));
  const top = days.reduce((best, day) => (day.average > best.average ? day : best), days[0]);
  const chartWidth = Math.max(width - Y_AXIS_WIDTH - 8, 0);
  const slot = chartWidth / days.length;
  const barWidth = Math.max(Math.min(slot * 0.55, 28), 8);

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <BarChart
          data={days.map((day) => ({
            value: day.average,
            label: day.label,
            frontColor: day.weekday === top.weekday && day.average > 0 ? colors.highlight : colors.bar,
            labelTextStyle: { color: colors.label, fontSize: 10 },
          }))}
          width={chartWidth}
          height={height - 28}
          maxValue={max}
          noOfSections={3}
          barWidth={barWidth}
          spacing={slot - barWidth}
          initialSpacing={(slot - barWidth) / 2}
          endSpacing={0}
          barBorderTopLeftRadius={6}
          barBorderTopRightRadius={6}
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
