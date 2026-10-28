import {
  BackdropBlur,
  Blur,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RoundedRect,
  Shadow,
  Skia,
  rect,
  rrect,
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
const TILE_R = 20;
const PILL_W = 176;
const PILL_H = 50;

const BAR_W = 22;
const BAR_GAP = 10;
const BAR_HEIGHTS = [36, 56, 80, 106] as const;
const BAR_BASELINE = HEIGHT - 30;

const VIOLET_TOP = "#8B5CF6";
const VIOLET_BOTTOM = "#1B0F40";
const VIOLET_LINE = "#C4B0FF";

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

/** Frosted glass surface: blurs whatever is drawn beneath it, with a lit edge and soft shadow. */
function Glass({
  x,
  y,
  width,
  height,
  radius,
  isDark,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  isDark: boolean;
}) {
  const shape = rrect(rect(x, y, width, height), radius, radius);
  // Dark: violet-tinted smoked glass. Light: frosted white with a lilac cast. Both keep a
  // clearly visible edge, because a white edge on a light page (or none on a dark one) vanishes.
  const body = isDark
    ? ["rgba(150,112,255,0.22)", "rgba(34,22,78,0.42)"]
    : ["rgba(255,255,255,0.94)", "rgba(238,230,255,0.80)"];
  const sheen = isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.85)";
  const edge = isDark
    ? ["rgba(196,176,255,0.50)", "rgba(139,92,246,0.10)", "rgba(139,92,246,0.34)"]
    : ["rgba(124,92,230,0.38)", "rgba(124,92,230,0.12)", "rgba(124,92,230,0.28)"];

  return (
    <>
      <BackdropBlur blur={18} clip={shape}>
        <RoundedRect x={x} y={y} width={width} height={height} r={radius}>
          <LinearGradient start={vec(x, y)} end={vec(x + width, y + height)} colors={body} />
        </RoundedRect>
      </BackdropBlur>
      {/* Soft sheen across the top. */}
      <Group clip={shape}>
        <RoundedRect x={x} y={y} width={width} height={height * 0.45} r={radius}>
          <LinearGradient
            start={vec(x, y)}
            end={vec(x, y + height * 0.45)}
            colors={[sheen, "rgba(255,255,255,0)"]}
          />
        </RoundedRect>
      </Group>
      <RoundedRect x={x + 0.5} y={y + 0.5} width={width - 1} height={height - 1} r={radius} style="stroke" strokeWidth={1}>
        <LinearGradient start={vec(x, y)} end={vec(x + width, y + height)} colors={edge} positions={[0, 0.55, 1]} />
      </RoundedRect>
    </>
  );
}

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
 * Paywall illustration drawn with Skia: dark gradient bars and a trend line, with frosted-glass
 * tiles and a pill that genuinely blur the artwork behind them. Icons and text sit on top as
 * regular views so they stay crisp and accessible.
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
              <Group key={height}>
                <RoundedRect x={x} y={y} width={BAR_W} height={height} r={9}>
                  <LinearGradient start={vec(x, y)} end={vec(x, BAR_BASELINE)} colors={[VIOLET_TOP, VIOLET_BOTTOM]} />
                  <Shadow dx={0} dy={4} blur={10} color="rgba(139,92,246,0.55)" />
                </RoundedRect>
                <RoundedRect x={x + 0.5} y={y + 0.5} width={BAR_W - 1} height={height - 1} r={9} style="stroke" strokeWidth={1}>
                  <LinearGradient
                    start={vec(x, y)}
                    end={vec(x, y + height)}
                    colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                  />
                </RoundedRect>
              </Group>
            );
          })}
        </Group>

        {/* Trend line: a blurred copy for glow, then the crisp stroke. */}
        <Path path={path} style="stroke" strokeWidth={5} strokeCap="round" end={line} opacity={0.7}>
          <LinearGradient start={vec(left, 0)} end={vec(end.x, 0)} colors={["#8B5CF6", VIOLET_LINE]} />
          <Blur blur={5} />
        </Path>
        <Path path={path} style="stroke" strokeWidth={2.4} strokeCap="round" end={line}>
          <LinearGradient start={vec(left, 0)} end={vec(end.x, 0)} colors={["#A78BFA", "#FFFFFF"]} />
        </Path>
        <Group opacity={line}>
          <Circle cx={end.x} cy={end.y} r={7} color="rgba(196,176,255,0.35)" />
          <Circle cx={end.x} cy={end.y} r={4} color="#FFFFFF" />
        </Group>

        {/* Glass. */}
        {TILES.map((tile) => (
          <Glass key={tile.key} x={tile.x(width)} y={tile.y} width={TILE_W} height={TILE_H} radius={TILE_R} isDark={isDark} />
        ))}
        <Glass x={pillX} y={pillY} width={PILL_W} height={PILL_H} radius={PILL_H / 2} isDark={isDark} />
      </Canvas>

      {/* Content over the glass. */}
      {TILES.map(({ key, Icon, label, badge, x, y }) => (
        <View
          key={key}
          pointerEvents="none"
          className="absolute items-center justify-center"
          style={{ left: x(width), top: y, width: TILE_W, height: TILE_H, gap: 5 }}
        >
          <Icon color={palette.foreground} size={20} strokeWidth={1.7} />
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
