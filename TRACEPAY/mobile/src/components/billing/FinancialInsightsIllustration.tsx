import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { CircleAlert, FileText, Landmark, Settings, ShoppingCart, type LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../../theme/colors";

const HEIGHT = 196;
const MAX_WIDTH = 340;
const SIDE_GUTTER = 40;

const TILE_W = 78;
const TILE_H = 68;
const TILE_R = 18;
const PILL_W = 176;
const PILL_H = 50;

const BAR_W = 22;
const BAR_GAP = 10;
const BAR_HEIGHTS = [36, 56, 80, 106] as const;
const BAR_BASELINE = HEIGHT - 30;

// Muted violet: the bars and line sit quietly behind the content instead of glowing.
const VIOLET = "#8B5CF6";
const BAR_TOP = "rgba(139,92,246,0.42)";
const BAR_BOTTOM = "rgba(139,92,246,0.08)";

type Tile = {
  key: string;
  Icon: LucideIcon;
  label: string;
  badge?: boolean;
  x: (width: number) => number;
  y: number;
};

const TILES: Tile[] = [
  { key: "fees", Icon: FileText, label: "Hidden fees", badge: true, x: () => 6, y: 4 },
  { key: "bank", Icon: Landmark, label: "Bank charges", x: (w) => w - TILE_W - 6, y: 0 },
  { key: "subs", Icon: ShoppingCart, label: "Subscriptions", x: () => 0, y: 88 },
  { key: "recurring", Icon: Settings, label: "Recurring payments", x: (w) => w - TILE_W, y: 84 },
];

function trendPath(centreX: number) {
  const left = centreX - (BAR_HEIGHTS.length * BAR_W + (BAR_HEIGHTS.length - 1) * BAR_GAP) / 2;
  const points = BAR_HEIGHTS.map((height, index) => ({
    x: left + index * (BAR_W + BAR_GAP) + BAR_W / 2,
    y: BAR_BASELINE - height - 14,
  }));
  let svg = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    const midX = (prev.x + next.x) / 2;
    svg += ` C ${midX} ${prev.y} ${midX} ${next.y} ${next.x} ${next.y}`;
  }
  const path = Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.MakeFromSVGString("M 0 0")!;
  return { path, left, end: points[points.length - 1]! };
}

type Props = {
  /** Estimated monthly leak total, already formatted (for example "R3 240"). */
  total: string;
};

/**
 * Paywall illustration drawn with Skia: soft violet bars and a trend line behind flat,
 * bordered tiles and a pill. Icons and text sit on top as regular views so they stay crisp.
 */
export function FinancialInsightsIllustration({ total }: Props) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(MAX_WIDTH, screenWidth - SIDE_GUTTER);
  const centreX = width / 2;
  const { path, left, end } = useMemo(() => trendPath(centreX), [centreX]);

  const grow = useSharedValue(0);
  const line = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    grow.value = withDelay(120, withSpring(1, { damping: 18, stiffness: 110 }));
    line.value = withDelay(520, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [enter, grow, line]);

  const barTransform = useDerivedValue(() => [{ scaleY: grow.value }]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: 10 * (1 - enter.value) }],
  }));

  const pillX = centreX - PILL_W / 2;
  const pillY = HEIGHT - PILL_H - 2;

  return (
    <Animated.View style={[{ height: HEIGHT, width, alignSelf: "center" }, enterStyle]} accessibilityElementsHidden>
      <Canvas style={{ width, height: HEIGHT }}>
        {/* Bars. */}
        <Group transform={barTransform} origin={vec(centreX, BAR_BASELINE)}>
          {BAR_HEIGHTS.map((height, index) => {
            const x = left + index * (BAR_W + BAR_GAP);
            const y = BAR_BASELINE - height;
            return (
              <RoundedRect key={height} x={x} y={y} width={BAR_W} height={height} r={9}>
                <LinearGradient start={vec(x, y)} end={vec(x, BAR_BASELINE)} colors={[BAR_TOP, BAR_BOTTOM]} />
              </RoundedRect>
            );
          })}
        </Group>

        {/* Trend line. */}
        <Path path={path} style="stroke" strokeWidth={2} strokeCap="round" end={line} color={VIOLET} opacity={0.75} />
        <Group opacity={line}>
          <Circle cx={end.x} cy={end.y} r={6} color="rgba(139,92,246,0.18)" />
          <Circle cx={end.x} cy={end.y} r={3.5} color={VIOLET} />
        </Group>

        {/* Flat tiles and pill. */}
        {TILES.map((tile) => (
          <Surface key={tile.key} x={tile.x(width)} y={tile.y} width={TILE_W} height={TILE_H} radius={TILE_R} fill={palette.card} stroke={palette.border} />
        ))}
        <Surface x={pillX} y={pillY} width={PILL_W} height={PILL_H} radius={PILL_H / 2} fill={palette.card} stroke={palette.border} />
      </Canvas>

      {/* Content over the surfaces. */}
      {TILES.map(({ key, Icon, label, badge, x, y }) => (
        <View
          key={key}
          pointerEvents="none"
          className="absolute items-center justify-center"
          style={{ left: x(width), top: y, width: TILE_W, height: TILE_H, gap: 5 }}
        >
          <Icon color={palette.mutedForeground} size={20} strokeWidth={1.7} />
          <Text
            className="px-1.5 text-center text-[9.5px] font-semibold leading-[11px] text-foreground"
            numberOfLines={2}
          >
            {label}
          </Text>
          {badge ? (
            <View
              className="absolute h-[18px] w-[18px] items-center justify-center rounded-full border-2"
              style={{ right: -5, top: -5, backgroundColor: palette.destructive, borderColor: palette.background }}
            >
              <Text className="text-[11px] font-bold leading-[13px] text-white">!</Text>
            </View>
          ) : null}
        </View>
      ))}
      <View
        pointerEvents="none"
        className="absolute flex-row items-center gap-2.5 px-4"
        style={{ left: pillX, top: pillY, width: PILL_W, height: PILL_H }}
      >
        <CircleAlert color={palette.primary} size={22} strokeWidth={2} />
        <View>
          <Text className="text-[16px] font-bold leading-[20px] text-foreground">{total}</Text>
          <Text className="text-[11px] font-medium text-muted-foreground">in potential leaks</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** A flat card surface with a hairline border. */
function Surface({
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
  stroke: string;
}) {
  return (
    <>
      <RoundedRect x={x} y={y} width={width} height={height} r={radius} color={fill} />
      <RoundedRect
        x={x + 0.5}
        y={y + 0.5}
        width={width - 1}
        height={height - 1}
        r={radius}
        style="stroke"
        strokeWidth={1}
        color={stroke}
      />
    </>
  );
}
