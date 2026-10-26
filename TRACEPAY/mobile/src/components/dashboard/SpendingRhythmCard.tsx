import { router } from "expo-router";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import {
  formatAxisAmount,
  type RhythmPoint,
  type RhythmSpan,
  type SpendingRhythm,
} from "../../features/dashboard/spending-rhythm";
import { COLORS, withAlpha } from "../../theme/colors";
import { Skeleton } from "../ui/Skeleton";
import { formatRandAmount } from "../../utils/currency";
import { RhythmSpanMenu } from "./RhythmSpanMenu";

type Props = {
  span: RhythmSpan;
  onSpanChange: (span: RhythmSpan) => void;
  rhythm: SpendingRhythm | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** False when the newest statement is old, so the last month is not this month. */
  isCurrent: boolean;
  referenceDate: Date | null;
};

const HEIGHT = 176;
const PAD = { left: 42, right: 14, top: 30, bottom: 26 };

/** Smooth line through the points (Catmull-Rom converted to cubic Béziers). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let path = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

function Chart({
  rhythm,
  selected,
  onSelect,
  palette,
}: {
  rhythm: SpendingRhythm;
  selected: number;
  onSelect: (index: number) => void;
  palette: typeof COLORS.light | typeof COLORS.dark;
}) {
  const [width, setWidth] = useState(320);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const { points, axisMax } = rhythm;

  const geometry = useMemo(() => {
    const x = (index: number) =>
      PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => PAD.top + plotHeight - (value / axisMax) * plotHeight;
    const current = points.map((point, index) => ({ x: x(index), y: y(point.current) }));
    const previous = points.map((point, index) => ({ x: x(index), y: y(point.previous) }));
    return { current, previous };
  }, [axisMax, plotHeight, plotWidth, points]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * axisMax);
  const chosen: RhythmPoint = points[selected] ?? points[points.length - 1];
  const anchor = geometry.current[selected] ?? geometry.current[geometry.current.length - 1];
  const tipWidth = 92;
  const tipX = Math.min(Math.max(anchor.x - tipWidth / 2, PAD.left - 30), width - tipWidth - 4);
  const areaPath = `${smoothPath(geometry.current)} L${geometry.current[geometry.current.length - 1].x.toFixed(1)} ${(PAD.top + plotHeight).toFixed(1)} L${geometry.current[0].x.toFixed(1)} ${(PAD.top + plotHeight).toFixed(1)} Z`;

  return (
    <Pressable
      onLayout={onLayout}
      accessibilityLabel="Spending by month. Tap a month for its total."
      onPress={(event) => {
        const touchX = event.nativeEvent.locationX;
        let nearest = 0;
        geometry.current.forEach((point, index) => {
          if (Math.abs(point.x - touchX) < Math.abs(geometry.current[nearest].x - touchX)) {
            nearest = index;
          }
        });
        onSelect(nearest);
      }}
    >
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <Defs>
          <LinearGradient id="rhythmArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.primary} stopOpacity={0.22} />
            <Stop offset="1" stopColor={palette.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {ticks.map((tick) => {
          const y = PAD.top + plotHeight - (tick / axisMax) * plotHeight;
          return (
            <G key={tick}>
              <Line
                x1={PAD.left}
                y1={y}
                x2={width - PAD.right}
                y2={y}
                stroke={withAlpha(palette.mutedForeground, 0.18)}
                strokeWidth={1}
              />
              <SvgText
                x={PAD.left - 8}
                y={y + 3.5}
                fontSize={10}
                fill={palette.mutedForeground}
                textAnchor="end"
              >
                {formatAxisAmount(tick)}
              </SvgText>
            </G>
          );
        })}

        <Path d={areaPath} fill="url(#rhythmArea)" />
        <Path
          d={smoothPath(geometry.previous)}
          stroke={withAlpha(palette.mutedForeground, 0.7)}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={smoothPath(geometry.current)}
          stroke={palette.primary}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />

        {geometry.current.map((point, index) => (
          <Circle
            key={points[index].monthKey}
            cx={point.x}
            cy={point.y}
            r={index === selected ? 6 : 3.5}
            fill={index === selected ? palette.primary : palette.card}
            stroke={palette.primary}
            strokeWidth={2}
          />
        ))}

        {points.map((point, index) => (
          <SvgText
            key={`x-${point.monthKey}`}
            x={geometry.current[index].x}
            y={HEIGHT - 8}
            fontSize={10}
            fill={index === selected ? palette.foreground : palette.mutedForeground}
            fontWeight={index === selected ? "700" : "400"}
            textAnchor="middle"
          >
            {point.label}
          </SvgText>
        ))}

        <Line
          x1={anchor.x}
          y1={PAD.top - 6}
          x2={anchor.x}
          y2={anchor.y - 8}
          stroke={withAlpha(palette.primary, 0.35)}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <Rect
          x={tipX}
          y={2}
          width={tipWidth}
          height={34}
          rx={10}
          fill={palette.foreground}
        />
        <SvgText
          x={tipX + tipWidth / 2}
          y={15}
          fontSize={10}
          fill={palette.background}
          textAnchor="middle"
          opacity={0.75}
        >
          {chosen.label} {chosen.monthKey.slice(0, 4)}
        </SvgText>
        <SvgText
          x={tipX + tipWidth / 2}
          y={29}
          fontSize={12}
          fontWeight="700"
          fill={palette.background}
          textAnchor="middle"
        >
          {formatRandAmount(chosen.current)}
        </SvgText>
      </Svg>
    </Pressable>
  );
}

export function SpendingRhythmCard({
  span,
  onSpanChange,
  rhythm,
  loading,
  error,
  onRetry,
  isCurrent,
  referenceDate,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [picked, setPicked] = useState<number | null>(null);

  const hasSpending = rhythm?.points.some((point) => point.current > 0 || point.previous > 0);
  const selected = Math.min(picked ?? (rhythm ? rhythm.points.length - 1 : 0), (rhythm?.points.length ?? 1) - 1);
  const comparison = rhythm?.comparison;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">Spending rhythm</Text>
        <RhythmSpanMenu
          span={span}
          onSpanChange={(next) => {
            setPicked(null);
            onSpanChange(next);
          }}
        />
      </View>

      <View className="rounded-3xl bg-card p-4">
        {loading && !rhythm ? (
          <View className="gap-3 py-1">
            <Skeleton width="45%" height={22} radius={8} />
            <Skeleton width="100%" height={HEIGHT - 40} radius={14} />
          </View>
        ) : error && !rhythm ? (
          <View>
            <Text className="text-[14px] font-semibold text-foreground">
              Spending rhythm unavailable
            </Text>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{error}</Text>
            <Pressable className="mt-3 self-start active:opacity-70" onPress={onRetry}>
              <Text className="text-[13px] font-semibold text-primary">Try again</Text>
            </Pressable>
          </View>
        ) : !rhythm || !hasSpending ? (
          <View>
            <Text className="text-[14px] font-semibold text-foreground">
              No spending to chart yet
            </Text>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
              Add a bank statement and your month-by-month spending appears here, set beside the
              months before it.
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-3 self-start active:opacity-70"
              onPress={() => router.push("/statements/coverage")}
            >
              <Text className="text-[13px] font-semibold text-primary">Add a statement</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!isCurrent && referenceDate ? (
              <Text className="mb-2 text-[12px] leading-[18px] text-muted-foreground">
                Your latest statement activity is from{" "}
                {referenceDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}.
                The chart ends there.
              </Text>
            ) : null}
            <Chart rhythm={rhythm} selected={selected} onSelect={setPicked} palette={palette} />

            <View className="mt-3 flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.primary }} />
                  <Text className="text-[12px] text-muted-foreground">This period</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: withAlpha(palette.mutedForeground, 0.7) }}
                  />
                  <Text className="text-[12px] text-muted-foreground">Last period</Text>
                </View>
              </View>
            </View>

            <View className="mt-3 flex-row items-center gap-3 border-t border-border/60 pt-3">
              {comparison && comparison.changePercent !== null ? (
                <>
                  <View
                    className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                    style={{
                      backgroundColor: withAlpha(
                        comparison.difference <= 0 ? palette.success : palette.destructive,
                        0.14,
                      ),
                    }}
                  >
                    {comparison.difference <= 0 ? (
                      <ArrowDown color={palette.success} size={13} strokeWidth={2.6} />
                    ) : (
                      <ArrowUp color={palette.destructive} size={13} strokeWidth={2.6} />
                    )}
                    <Text
                      className="text-[12px] font-bold"
                      style={{
                        color: comparison.difference <= 0 ? palette.success : palette.destructive,
                      }}
                    >
                      {Math.round(Math.abs(comparison.changePercent))}%
                    </Text>
                  </View>
                  <Text className="flex-1 text-[12px] leading-[18px] text-muted-foreground">
                    <Text className="font-semibold text-foreground">
                      {formatRandAmount(Math.abs(comparison.difference))}{" "}
                      {comparison.difference <= 0 ? "less" : "more"}
                    </Text>{" "}
                    than the same days last month
                  </Text>
                </>
              ) : (
                <Text className="flex-1 text-[12px] leading-[18px] text-muted-foreground">
                  No earlier month to compare with yet.
                </Text>
              )}
            </View>
          </>
        )}
      </View>

    </View>
  );
}
