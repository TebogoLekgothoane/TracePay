import { View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { TrendPoint } from "../../features/insights/insights-report";
import { formatAxisRand, niceCeiling, useChartWidth } from "./chart-utils";

type Props = {
  points: TrendPoint[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  colors: {
    up: string;
    down: string;
    previous: string;
    current: string;
    grid: string;
    label: string;
    average: string;
  };
  height?: number;
};

const PAD = { left: 42, right: 8, top: 18, bottom: 34 };
const SECTIONS = 4;

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Grouped bars with average guide, richer labels, and a clear current-vs-previous pair. */
export function TrendBars({ points, selected, onSelect, colors, height = 220 }: Props) {
  const { width, onLayout } = useChartWidth();
  const count = points.length;

  if (width === 0 || count === 0) {
    return <View onLayout={onLayout} style={{ height: width === 0 ? height : 0 }} />;
  }

  const values = points.flatMap((point) => [safe(point.current), safe(point.previous)]);
  const max = niceCeiling(Math.max(1, ...values));
  const average =
    points.reduce((sum, point) => sum + safe(point.current), 0) / Math.max(points.length, 1);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = Math.max(height - PAD.top - PAD.bottom, 1);
  const slot = plotWidth / count;
  const barWidth = Math.max(Math.min(slot * 0.32, 18), 5);
  const gap = Math.max(Math.min(slot * 0.08, 5), 2);
  const baseline = PAD.top + plotHeight;
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(Math.floor(plotWidth / 52), 1)));
  const y = (value: number) => baseline - (safe(value) / max) * plotHeight;
  const averageY = y(average);

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="trend-up" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.up} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.up} stopOpacity={0.72} />
          </LinearGradient>
          <LinearGradient id="trend-down" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.down} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.down} stopOpacity={0.72} />
          </LinearGradient>
          <LinearGradient id="trend-current" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.current} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.current} stopOpacity={0.75} />
          </LinearGradient>
        </Defs>

        {Array.from({ length: SECTIONS + 1 }, (_, step) => {
          const value = (max / SECTIONS) * step;
          const lineY = y(value);
          return (
            <G key={step}>
              <Line
                x1={PAD.left}
                y1={lineY}
                x2={width - PAD.right}
                y2={lineY}
                stroke={colors.grid}
                strokeWidth={1}
              />
              <SvgText
                x={PAD.left - 8}
                y={lineY + 3.5}
                fontSize={10}
                fill={colors.label}
                textAnchor="end"
              >
                {formatAxisRand(value)}
              </SvgText>
            </G>
          );
        })}

        {/* Average spend guide for the current buckets. */}
        <Line
          x1={PAD.left}
          y1={averageY}
          x2={width - PAD.right}
          y2={averageY}
          stroke={colors.average}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.9}
        />
        <SvgText
          x={width - PAD.right}
          y={averageY - 6}
          fontSize={10}
          fill={colors.average}
          textAnchor="end"
        >
          avg {formatAxisRand(average)}
        </SvgText>

        {points.map((point, index) => {
          const centre = PAD.left + slot * (index + 0.5);
          const dimmed = selected !== null && selected !== index;
          const active = selected === index;
          const previousTop = y(point.previous);
          const currentTop = y(point.current);
          const rose = point.current > point.previous;
          const currentFill = rose ? "url(#trend-up)" : "url(#trend-down)";
          const opacity = dimmed ? 0.28 : 1;

          return (
            <G key={`${point.label}-${index}`} opacity={opacity}>
              {active ? (
                <Rect
                  x={PAD.left + slot * index + 2}
                  y={PAD.top - 6}
                  width={Math.max(slot - 4, 1)}
                  height={plotHeight + PAD.bottom + 4}
                  rx={10}
                  fill={colors.current}
                  opacity={0.08}
                />
              ) : null}

              <Rect
                x={centre - barWidth - gap / 2}
                y={previousTop}
                width={barWidth}
                height={Math.max(baseline - previousTop, 1)}
                rx={5}
                fill={colors.previous}
              />
              <Rect
                x={centre + gap / 2}
                y={currentTop}
                width={barWidth}
                height={Math.max(baseline - currentTop, 1)}
                rx={5}
                fill={currentFill}
              />

              {active && safe(point.current) > 0 ? (
                <>
                  <Circle
                    cx={centre + gap / 2 + barWidth / 2}
                    cy={currentTop}
                    r={3.5}
                    fill={rose ? colors.up : colors.down}
                  />
                  <SvgText
                    x={centre}
                    y={Math.max(currentTop - 8, PAD.top + 8)}
                    fontSize={10}
                    fontWeight="700"
                    fill={rose ? colors.up : colors.down}
                    textAnchor="middle"
                  >
                    {formatAxisRand(point.current)}
                  </SvgText>
                </>
              ) : null}

              {index % labelEvery === 0 || index === count - 1 ? (
                <>
                  <SvgText
                    x={centre}
                    y={height - 18}
                    fontSize={11}
                    fontWeight="600"
                    fill={colors.label}
                    textAnchor="middle"
                  >
                    {point.label}
                  </SvgText>
                  {count <= 8 ? (
                    <SvgText
                      x={centre}
                      y={height - 5}
                      fontSize={9}
                      fill={colors.label}
                      opacity={0.75}
                      textAnchor="middle"
                    >
                      {point.detailLabel}
                    </SvgText>
                  ) : null}
                </>
              ) : null}

              <Rect
                x={PAD.left + slot * index}
                y={PAD.top - 8}
                width={slot}
                height={plotHeight + PAD.bottom + 12}
                fill="transparent"
                onPress={() => onSelect(selected === index ? null : index)}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
