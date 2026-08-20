import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient,
  Line,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import AssembledTracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import { TRACEPAY } from "../theme/colors";

export type Props = {
  onAnimationComplete: () => void;
};

export const TRACEPAY_SPLASH_BACKGROUNDS = {
  light: TRACEPAY.light.splashBackground,
  dark: TRACEPAY.dark.splashBackground,
} as const;

const ICON_VIEWBOX = "150 30 1030 820";
const ICON_SOURCE_WIDTH = 1030;
const ICON_SOURCE_HEIGHT = 820;

const ENTER_EASING = Easing.out(Easing.cubic);
const SETTLE_EASING = Easing.out(Easing.back(1.4));
const EXIT_EASING = Easing.inOut(Easing.cubic);

/**
 * Full branded intro (~5.3s):
 * 0.0–1.0s  first strokes enter dramatically
 * 1.0–2.3s  more pieces fly in from different directions
 * 2.3–3.2s  remaining pieces settle / interact
 * 3.2–4.0s  converge into final logo + wordmark
 * 4.0–4.8s  logo holds with spring settle + tagline
 * 4.8–5.3s  exit fade, then navigate
 */
export const TRACEPAY_SPLASH_TIMING = {
  pointStart: 0,
  topStart: 120,
  topDuration: 780,
  verticalStart: 480,
  verticalDuration: 820,
  outerStart: 900,
  outerDuration: 860,
  innerStart: 1680,
  innerDuration: 720,
  legStart: 2100,
  legDuration: 760,
  dropletStart: 2480,
  dropletDuration: 780,
  convergeStart: 3180,
  convergeDuration: 520,
  finalSpringStart: 3320,
  traceStart: 3680,
  payStart: 3880,
  accentsStart: 4100,
  taglineStart: 4180,
  holdUntil: 4800,
  exitStart: 4800,
  exitDuration: 520,
} as const;

type IconProps = {
  size: number;
};

type SourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ICON_REGIONS = {
  top: { x: 0, y: 0, width: 680, height: 180 },
  vertical: { x: 180, y: 150, width: 260, height: 670 },
  outer: { x: 390, y: 0, width: 640, height: 650 },
  inner: { x: 340, y: 250, width: 400, height: 360 },
  leg: { x: 570, y: 500, width: 460, height: 320 },
  droplet: { x: 350, y: 270, width: 230, height: 300 },
} satisfies Record<string, SourceRect>;

function TracePayIcon({ size }: IconProps) {
  const height = size * (ICON_SOURCE_HEIGHT / ICON_SOURCE_WIDTH);

  return (
    <AssembledTracePayIcon
      width={size}
      height={height}
      viewBox={ICON_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function IconRegion({
  size,
  region,
  animatedStyle,
}: {
  size: number;
  region: SourceRect;
  animatedStyle: object;
}) {
  const scale = size / ICON_SOURCE_WIDTH;
  const iconHeight = size * (ICON_SOURCE_HEIGHT / ICON_SOURCE_WIDTH);

  return (
    <Animated.View
      style={[
        styles.iconRegion,
        {
          left: region.x * scale,
          top: region.y * scale,
          width: region.width * scale,
          height: region.height * scale,
        },
        animatedStyle,
      ]}
    >
      <View
        style={{
          position: "absolute",
          left: -region.x * scale,
          top: -region.y * scale,
          width: size,
          height: iconHeight,
        }}
      >
        <TracePayIcon size={size} />
      </View>
    </Animated.View>
  );
}

function TraceWordmark({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 225 80"
      preserveAspectRatio="xMidYMid meet"
    >
      <SvgText
        x={0}
        y={66}
        fill={color}
        fontFamily="sans-serif"
        fontSize={68}
        fontWeight="800"
        letterSpacing={-2}
      >
        TRACE
      </SvgText>
    </Svg>
  );
}

function PayWordmark({
  width,
  height,
  startColor,
  endColor,
}: {
  width: number;
  height: number;
  startColor: string;
  endColor: string;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 132 80"
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs>
        <LinearGradient id="payGradient" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={startColor} />
          <Stop offset="1" stopColor={endColor} />
        </LinearGradient>
      </Defs>
      <SvgText
        x={0}
        y={66}
        fill="url(#payGradient)"
        fontFamily="sans-serif"
        fontSize={68}
        fontWeight="800"
        letterSpacing={-2}
      >
        PAY
      </SvgText>
    </Svg>
  );
}

function AccentLine({ color, width }: { color: string; width: number }) {
  return (
    <Svg width={width} height={8} viewBox="0 0 100 8">
      <Line
        x1={2}
        y1={4}
        x2={98}
        y2={4}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function enterTiming(duration: number) {
  return { duration, easing: ENTER_EASING };
}

export function TracePayAnimatedSplash({ onAnimationComplete }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const contentWidth = Math.min(width * 0.9, 410);
  const iconSize = Math.min(width * 0.56, height * 0.257, 235);
  const iconHeight = iconSize * (ICON_SOURCE_HEIGHT / ICON_SOURCE_WIDTH);
  const wordmarkWidth = Math.min(contentWidth * 0.88, 350);
  const wordmarkHeight = wordmarkWidth * (80 / 357);
  const traceWidth = wordmarkWidth * (225 / 357);
  const payWidth = wordmarkWidth * (132 / 357);
  const accentWidth = Math.max(34, contentWidth * 0.16);

  // Motion distance scales with screen so large moves stay visible on all devices
  const flyX = Math.min(width * 0.42, 180);
  const flyY = Math.min(height * 0.28, 160);

  const point = useSharedValue(0);
  const top = useSharedValue(0);
  const vertical = useSharedValue(0);
  const outer = useSharedValue(0);
  const inner = useSharedValue(0);
  const leg = useSharedValue(0);
  const droplet = useSharedValue(0);
  const piecesVisible = useSharedValue(1);
  const finalIcon = useSharedValue(0);
  const logoSpring = useSharedValue(0);
  const trace = useSharedValue(0);
  const pay = useSharedValue(0);
  const accents = useSharedValue(0);
  const tagline = useSharedValue(0);
  const screen = useSharedValue(1);

  useEffect(() => {
    const finish = () => {
      onCompleteRef.current();
    };

    // ── Phase 1: spark + first strokes ──────────────────────────────
    point.value = withSequence(
      withTiming(1, { duration: 160, easing: ENTER_EASING }),
      withDelay(420, withTiming(0, { duration: 220, easing: EXIT_EASING })),
    );

    // Top stroke: drops from above with slight rotation
    top.value = withDelay(
      TRACEPAY_SPLASH_TIMING.topStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.topDuration)),
    );

    // Vertical T: slides in from the left while rotating upright
    vertical.value = withDelay(
      TRACEPAY_SPLASH_TIMING.verticalStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.verticalDuration)),
    );

    // Outer R: flies in from the right with counter-rotation
    outer.value = withDelay(
      TRACEPAY_SPLASH_TIMING.outerStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.outerDuration)),
    );

    // ── Phase 2: pause, then inner / leg / droplet ──────────────────
    // Inner curve: scales up from centre with overshoot
    inner.value = withDelay(
      TRACEPAY_SPLASH_TIMING.innerStart,
      withSpring(1, { damping: 11, stiffness: 96, mass: 0.75 }),
    );

    // Diagonal leg: sweeps up from bottom-right
    leg.value = withDelay(
      TRACEPAY_SPLASH_TIMING.legStart,
      withTiming(1, {
        duration: TRACEPAY_SPLASH_TIMING.legDuration,
        easing: SETTLE_EASING,
      }),
    );

    // Droplet: falls from above and bounces into place
    droplet.value = withDelay(
      TRACEPAY_SPLASH_TIMING.dropletStart,
      withSpring(1, { damping: 9, stiffness: 110, mass: 0.7 }),
    );

    // ── Phase 3: converge into final assembled logo ─────────────────
    piecesVisible.value = withDelay(
      TRACEPAY_SPLASH_TIMING.convergeStart,
      withTiming(0, {
        duration: TRACEPAY_SPLASH_TIMING.convergeDuration,
        easing: EXIT_EASING,
      }),
    );

    finalIcon.value = withDelay(
      TRACEPAY_SPLASH_TIMING.convergeStart + 80,
      withTiming(1, {
        duration: TRACEPAY_SPLASH_TIMING.convergeDuration,
        easing: ENTER_EASING,
      }),
    );

    // Final logo: scale up with spring overshoot, then settle
    logoSpring.value = withDelay(
      TRACEPAY_SPLASH_TIMING.finalSpringStart,
      withSpring(1, { damping: 8, stiffness: 120, mass: 0.6 }),
    );

    // ── Phase 4: wordmark + tagline ─────────────────────────────────
    trace.value = withDelay(
      TRACEPAY_SPLASH_TIMING.traceStart,
      withTiming(1, { duration: 560, easing: SETTLE_EASING }),
    );

    pay.value = withDelay(
      TRACEPAY_SPLASH_TIMING.payStart,
      withTiming(1, { duration: 540, easing: SETTLE_EASING }),
    );

    accents.value = withDelay(
      TRACEPAY_SPLASH_TIMING.accentsStart,
      withTiming(1, { duration: 520, easing: ENTER_EASING }),
    );

    tagline.value = withDelay(
      TRACEPAY_SPLASH_TIMING.taglineStart,
      withTiming(1, { duration: 500, easing: ENTER_EASING }),
    );

    // ── Phase 5: hold final lockup, then exit ───────────────────────
    screen.value = withDelay(
      TRACEPAY_SPLASH_TIMING.exitStart,
      withTiming(
        0,
        {
          duration: TRACEPAY_SPLASH_TIMING.exitDuration,
          easing: EXIT_EASING,
        },
        (finished) => {
          if (finished) {
            runOnJS(finish)();
          }
        },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screen.value,
  }));

  const pointStyle = useAnimatedStyle(() => ({
    opacity: point.value,
    transform: [{ scale: 0.4 + point.value * 1.1 }],
  }));

  // Top: from above, slight clockwise tip
  const topStyle = useAnimatedStyle(() => {
    const t = top.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateY: (1 - t) * -flyY },
        { translateX: (1 - t) * -24 },
        { rotate: `${(1 - t) * -18}deg` },
        { scale: 0.55 + t * 0.45 },
      ],
    };
  });

  // Vertical: from far left, rotates into upright
  const verticalStyle = useAnimatedStyle(() => {
    const t = vertical.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * -flyX },
        { translateY: (1 - t) * 36 },
        { rotate: `${(1 - t) * 28}deg` },
        { scale: 0.5 + t * 0.5 },
      ],
    };
  });

  // Outer R: from far right, counter-rotates in
  const outerStyle = useAnimatedStyle(() => {
    const t = outer.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * flyX },
        { translateY: (1 - t) * -28 },
        { rotate: `${(1 - t) * -32}deg` },
        { scale: 0.45 + t * 0.55 },
      ],
    };
  });

  // Inner: scale burst from centre with overshoot baked into spring
  const innerStyle = useAnimatedStyle(() => {
    const t = Math.min(1, inner.value);
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { scale: 0.15 + inner.value * 0.85 },
        { rotate: `${(1 - t) * 40}deg` },
      ],
    };
  });

  // Leg: sweeps up from bottom-right
  const legStyle = useAnimatedStyle(() => {
    const t = leg.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * flyX * 0.85 },
        { translateY: (1 - t) * flyY },
        { rotate: `${(1 - t) * 42}deg` },
        { scale: 0.4 + t * 0.6 },
      ],
    };
  });

  // Droplet: drops from above, spring overshoots
  const dropletStyle = useAnimatedStyle(() => {
    const t = Math.min(1, droplet.value);
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateY: (1 - t) * -flyY * 1.15 },
        { scale: 0.2 + droplet.value * 0.8 },
        { rotate: `${(1 - t) * -12}deg` },
      ],
    };
  });

  const finalIconStyle = useAnimatedStyle(() => {
    // Starts small, springs through ~1.04–1.06 on overshoot, settles at 1.02
    const scale = 0.82 + logoSpring.value * 0.2;
    return {
      opacity: finalIcon.value,
      transform: [{ scale }],
    };
  });

  const iconStageStyle = useAnimatedStyle(() => {
    const settle = logoSpring.value;
    return {
      transform: [{ translateY: (1 - settle) * -10 }],
    };
  });

  // TRACE: slides in from the left
  const traceStyle = useAnimatedStyle(() => {
    const t = trace.value;
    return {
      opacity: t,
      transform: [
        { translateX: (1 - t) * -56 },
        { translateY: (1 - t) * 18 },
        { scale: 0.85 + t * 0.15 },
      ],
    };
  });

  // PAY: slides in from the right with slight rise
  const payStyle = useAnimatedStyle(() => {
    const t = pay.value;
    return {
      opacity: t,
      transform: [
        { translateX: (1 - t) * 56 },
        { translateY: (1 - t) * 18 },
        { scale: 0.85 + t * 0.15 },
      ],
    };
  });

  const leftAccentStyle = useAnimatedStyle(() => ({
    width: accentWidth * accents.value,
    opacity: accents.value,
    transform: [{ translateX: (1 - accents.value) * -20 }],
  }));

  const rightAccentStyle = useAnimatedStyle(() => ({
    width: accentWidth * accents.value,
    opacity: accents.value,
    transform: [{ translateX: (1 - accents.value) * 20 }],
  }));

  const taglineStyle = useAnimatedStyle(() => {
    const t = tagline.value;
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * 22 },
        { scale: 0.92 + t * 0.08 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 z-[1000] items-center justify-center"
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: palette.splashBackground,
        },
        screenStyle,
      ]}
      testID="tracepay-animated-splash"
    >
      <View style={[styles.lockup, { width: contentWidth }]}>
        <Animated.View
          accessibilityLabel="TracePay icon"
          style={[
            styles.iconStage,
            { width: iconSize, height: iconHeight },
            iconStageStyle,
          ]}
        >
          <Animated.View
            style={[
              styles.tracePoint,
              { backgroundColor: palette.splashPoint },
              pointStyle,
            ]}
          />

          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.top}
            animatedStyle={topStyle}
          />
          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.vertical}
            animatedStyle={verticalStyle}
          />
          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.outer}
            animatedStyle={outerStyle}
          />
          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.inner}
            animatedStyle={innerStyle}
          />
          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.leg}
            animatedStyle={legStyle}
          />
          <IconRegion
            size={iconSize}
            region={ICON_REGIONS.droplet}
            animatedStyle={dropletStyle}
          />

          <Animated.View style={[StyleSheet.absoluteFill, finalIconStyle]}>
            <TracePayIcon size={iconSize} />
          </Animated.View>
        </Animated.View>

        <View
          accessibilityLabel="TRACEPAY"
          style={[
            styles.wordmark,
            { width: wordmarkWidth, height: wordmarkHeight },
          ]}
        >
          <Animated.View style={traceStyle}>
            <TraceWordmark
              color={palette.splashForeground}
              width={traceWidth}
              height={wordmarkHeight}
            />
          </Animated.View>
          <Animated.View style={payStyle}>
            <PayWordmark
              endColor={palette.splashPayEnd}
              startColor={palette.splashPayStart}
              width={payWidth}
              height={wordmarkHeight}
            />
          </Animated.View>
        </View>

        <View style={styles.taglineRow}>
          <Animated.View
            style={[
              styles.leftAccentReveal,
              { maxWidth: accentWidth },
              leftAccentStyle,
            ]}
          >
            <View style={{ position: "absolute", right: 0 }}>
              <AccentLine
                color={palette.splashAccentPink}
                width={accentWidth}
              />
            </View>
          </Animated.View>

          <Animated.View style={taglineStyle}>
            <Text
              numberOfLines={1}
              style={[styles.tagline, { color: palette.splashMuted }]}
            >
              FIND THE LEAKS. SAVE YOUR MONEY.
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.rightAccentReveal,
              { maxWidth: accentWidth },
              rightAccentStyle,
            ]}
          >
            <AccentLine
              color={palette.splashAccentBlue}
              width={accentWidth}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  lockup: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconStage: {
    position: "relative",
  },
  iconRegion: {
    position: "absolute",
    overflow: "hidden",
  },
  tracePoint: {
    position: "absolute",
    zIndex: 20,
    top: "7%",
    left: "4%",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginTop: 16,
  },
  taglineRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 22,
  },
  leftAccentReveal: {
    height: 8,
    alignItems: "flex-end",
    overflow: "hidden",
  },
  rightAccentReveal: {
    height: 8,
    alignItems: "flex-start",
    overflow: "hidden",
  },
  tagline: {
    fontFamily: "sans-serif",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.45,
    lineHeight: 16,
    textAlign: "center",
  },
});
