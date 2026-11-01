import { View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import { formatAxisRand, niceCeiling, useChartWidth } from "./chart-utils";

type Point = { label: string; current: number; previous: number };

type Props = {
  points: Point[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  colors: { current: string; previous: string; grid: string; label: string };
  height?: number;
};

const PAD = { left: 40, right: 4, top: 8, bottom: 22 };
const SECTIONS = 3;

const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Grouped bars: this period beside the one before it. Tap a pair to read it. */
export function TrendBars({ points, selected, onSelect, colors, height = 190 }: Props) {
  const { width, onLayout } = useChartWidth();
  const count = points.length;

  if (width === 0 || count === 0) {
    return <View onLayout={onLayout} style={{ height: width === 0 ? height : 0 }} />;
  }

  const max = niceCeiling(Math.max(1, ...points.flatMap((p) => [safe(p.current), safe(p.previous)])));
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = Math.max(height - PAD.top - PAD.bottom, 1);
  const slot = plotWidth / count;
  const barWidth = Math.max(Math.min(slot * 0.26, 14), 4);
  const gap = 3;
  const baseline = PAD.top + plotHeight;
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(Math.floor(plotWidth / 46), 1)));
  const y = (value: number) => baseline - (safe(value) / max) * plotHeight;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        {Array.from({ length: SECTIONS + 1 }, (_, step) => {
          const value = (max / SECTIONS) * step;
          const lineY = y(value);
          return (
            <G key={step}>
              <Line x1={PAD.left} y1={lineY} x2={width - PAD.right} y2={lineY} stroke={colors.grid} strokeWidth={1} />
              <SvgText x={PAD.left - 8} y={lineY + 3.5} fontSize={10} fill={colors.label} textAnchor="end">
                {formatAxisRand(value)}
              </SvgText>
            </G>
          );
        })}

        {points.map((point, index) => {
          const centre = PAD.left + slot * (index + 0.5);
          const dimmed = selected !== null && selected !== index;
          const previousTop = y(point.previous);
          const currentTop = y(point.current);
          return (
            <G key={`${point.label}-${index}`}>
              <Rect
                x={centre - barWidth - gap / 2}
                y={previousTop}
                width={barWidth}
                height={Math.max(baseline - previousTop, 0)}
                rx={2.5}
                fill={colors.previous}
                opacity={dimmed ? 0.35 : 1}
              />
              <Rect
                x={centre + gap / 2}
                y={currentTop}
                width={barWidth}
                height={Math.max(baseline - currentTop, 0)}
                rx={2.5}
                fill={colors.current}
                opacity={dimmed ? 0.35 : 1}
              />
              {index % labelEvery === 0 ? (
                <SvgText x={centre} y={height - 6} fontSize={10} fill={colors.label} textAnchor="middle">
                  {point.label}
                </SvgText>
              ) : null}
              {/* A wide, invisible target so a pair is easy to tap. */}
              <Rect
                x={PAD.left + slot * index}
                y={PAD.top}
                width={slot}
                height={plotHeight + PAD.bottom}
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
