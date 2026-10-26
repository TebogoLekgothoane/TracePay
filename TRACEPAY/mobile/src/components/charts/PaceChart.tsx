import { Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";

import { formatAxisRand, formatRandWhole, niceCeiling, useChartWidth } from "./chart-utils";

type Props = {
  current: number[];
  previous: number[];
  labels: string[];
  /** Number of days the x-axis spans, so a projection has room to run. */
  totalDays: number;
  projected: number | null;
  colors: { line: string; previous: string; grid: string; label: string; card: string; foreground: string };
  height?: number;
};

const Y_AXIS_WIDTH = 40;

/** Cumulative spend against the previous period; drag across it to read any day. */
export function PaceChart({ current, previous, labels, totalDays, projected, colors, height = 210 }: Props) {
  const { width, onLayout } = useChartWidth();
  const days = Math.max(totalDays, current.length, 2);
  const lastIndex = current.length - 1;
  const max = niceCeiling(Math.max(...current, ...previous, projected ?? 0, 1));
  const labelEvery = Math.max(1, Math.ceil(current.length / 5));
  const chartWidth = Math.max(width - Y_AXIS_WIDTH - 12, 0);
  const spacing = chartWidth / (days - 1);

  const labelAt = (index: number) =>
    index % labelEvery === 0 || index === lastIndex ? (labels[index] ?? "") : "";

  const series = (values: number[]) =>
    Array.from({ length: days }, (_, index) => ({
      value: values[index] ?? values[values.length - 1] ?? 0,
      label: labelAt(index),
    }));

  const currentData = series(current);
  const previousData = series(previous);
  const projectedData =
    projected === null
      ? []
      : Array.from({ length: days }, (_, index) => {
          const start = current[lastIndex] ?? 0;
          const progress = days - 1 === lastIndex ? 1 : Math.max(index - lastIndex, 0) / (days - 1 - lastIndex);
          return { value: start + (projected - start) * progress, label: labelAt(index) };
        });

  const dataSet = [
    {
      data: previousData,
      endIndex: Math.min(previous.length, days) - 1,
      color: colors.previous,
      thickness: 2,
      strokeDashArray: [4, 4],
      hideDataPoints: true,
    },
    {
      data: currentData,
      endIndex: lastIndex,
      color: colors.line,
      thickness: 3,
      areaChart: true,
      startFillColor: colors.line,
      endFillColor: colors.line,
      startOpacity: 0.28,
      endOpacity: 0.02,
      hideDataPoints: true,
    },
    ...(projected !== null
      ? [
          {
            data: projectedData,
            startIndex: lastIndex,
            color: colors.line,
            thickness: 2,
            strokeDashArray: [2, 5],
            hideDataPoints: true,
          },
        ]
      : []),
  ];

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <LineChart
          dataSet={dataSet}
          width={chartWidth}
          height={height - 34}
          maxValue={max}
          noOfSections={3}
          spacing={spacing}
          initialSpacing={0}
          endSpacing={0}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          formatYLabel={(label: string) => formatAxisRand(Number(label))}
          yAxisTextStyle={{ color: colors.label, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.label, fontSize: 10, width: 44, textAlign: "center" }}
          yAxisThickness={0}
          xAxisThickness={0}
          rulesColor={colors.grid}
          rulesType="solid"
          hideDataPoints
          disableScroll
          isAnimated
          animationDuration={600}
          pointerConfig={{
            pointerStripColor: colors.label,
            pointerStripWidth: 1,
            pointerColor: colors.line,
            radius: 5,
            activatePointersInstantlyOnTouch: true,
            pointerVanishDelay: 800,
            autoAdjustPointerLabelPosition: true,
            pointerLabelWidth: 150,
            pointerLabelHeight: 56,
            pointerLabelComponent: (items: { value: number }[], _secondary: unknown, index: number) => (
              <View
                style={{
                  width: 150,
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  shadowColor: "#000",
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <Text style={{ color: colors.label, fontSize: 11 }}>
                  Day {labels[Math.min(index, lastIndex)] ?? ""}
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", marginTop: 2 }}>
                  {formatRandWhole(items[1]?.value ?? 0)}
                </Text>
                <Text style={{ color: colors.label, fontSize: 11, marginTop: 1 }}>
                  {formatRandWhole(items[0]?.value ?? 0)} before
                </Text>
              </View>
            ),
          }}
        />
      ) : null}
    </View>
  );
}
