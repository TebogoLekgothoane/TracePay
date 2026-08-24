import { useEffect, useRef, type FunctionComponent } from "react";
import {
  StyleSheet,
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
import type { SvgProps } from "react-native-svg";

import AssembledTracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import DiagonalRLeg from "../../assets/icons/diagonal R leg.svg";
import Droplet from "../../assets/icons/droplet.svg";
import InnerCurve from "../../assets/icons/inner curve.svg";
import OuterRStroke from "../../assets/icons/outer R stroke.svg";
import TopStroke from "../../assets/icons/top stroke.svg";
import VerticalTStroke from "../../assets/icons/vertical T stroke.svg";
import LeftPinkAccent from "../../assets/tagline/left pink accent line.svg";
import RightBlueAccent from "../../assets/tagline/right blue accent line.svg";
import Tagline from "../../assets/tagline/tagline.svg";
import PayWordmark from "../../assets/wordmark/PAY.svg";
import TraceWordmark from "../../assets/wordmark/trace white wordmark.svg";
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
 * Branded intro (~8.3s):
 * 0.0–0.9s   upper-left top stroke
 * 0.9–1.8s   upper/right arc
 * 1.8–3.1s   diagonal ribbon (vertical + leg)
 * 3.1–4.0s   lower curves + droplet
 * 3.8–4.3s   wordmark + tagline
 * 4.3–4.8s   crossfade settle onto assembled reference
 * 4.8–8.3s   hold, then exit
 */
export const TRACEPAY_SPLASH_TIMING = {
  pointStart: 0,
  topStart: 120,
  topDuration: 720,
  outerStart: 900,
  outerDuration: 800,
  verticalStart: 1750,
  verticalDuration: 760,
  legStart: 2280,
  legDuration: 740,
  innerStart: 3100,
  innerDuration: 700,
  dropletStart: 3520,
  dropletDuration: 680,
  convergeStart: 4300,
  convergeDuration: 380,
  finalSpringStart: 4380,
  traceStart: 3800,
  payStart: 3960,
  accentsStart: 4160,
  taglineStart: 4280,
  holdUntil: 8320,
  exitStart: 8320,
  exitDuration: 520,
} as const;

type IconProps = {
  size: number;
};

type BrandPieceProps = {
  width: number;
  height: number;
  animatedStyle: object;
  frameStyle?: object;
  preserveAspectRatio?: string;
  Piece: FunctionComponent<SvgProps>;
};

type IconPieceProps = {
  size: number;
  animatedStyle: object;
  Piece: FunctionComponent<SvgProps>;
};

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

function IconPiece({ size, animatedStyle, Piece }: IconPieceProps) {
  const height = size * (ICON_SOURCE_HEIGHT / ICON_SOURCE_WIDTH);

  return (
    <Animated.View style={[styles.iconPiece, animatedStyle]}>
      <Piece
        width={size}
        height={height}
        viewBox={ICON_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
      />
    </Animated.View>
  );
}

function LockupPiece({
  width,
  height,
  animatedStyle,
  frameStyle,
  preserveAspectRatio = "xMidYMid meet",
  Piece,
}: BrandPieceProps) {
  return (
    <Animated.View
      style={[styles.lockupPiece, { width, height }, frameStyle, animatedStyle]}
    >
      <Piece
        width={width}
        height={height}
        preserveAspectRatio={preserveAspectRatio}
      />
    </Animated.View>
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
  const wordmarkWidth = Math.min(contentWidth * 0.94, 380);
  const wordmarkHeight = wordmarkWidth * (632 / 1897);
  const wordmarkColumnWidth = (wordmarkWidth - 8) / 2;
  const taglineStageHeight = 50;
  const accentWidth = 42;
  const taglineTextWidth = wordmarkWidth - accentWidth * 2 - 12;
  const lockupHeight = wordmarkHeight + 12 + taglineStageHeight;

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

    // A. Upper-left top stroke
    top.value = withDelay(
      TRACEPAY_SPLASH_TIMING.topStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.topDuration)),
    );

    // B. Upper/right arc
    outer.value = withDelay(
      TRACEPAY_SPLASH_TIMING.outerStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.outerDuration)),
    );

    // C. Diagonal ribbon — vertical stem, then leg
    vertical.value = withDelay(
      TRACEPAY_SPLASH_TIMING.verticalStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.verticalDuration)),
    );

    leg.value = withDelay(
      TRACEPAY_SPLASH_TIMING.legStart,
      withTiming(1, {
        duration: TRACEPAY_SPLASH_TIMING.legDuration,
        easing: SETTLE_EASING,
      }),
    );

    // D. Lower curves + droplet accent
    inner.value = withDelay(
      TRACEPAY_SPLASH_TIMING.innerStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.innerDuration)),
    );

    droplet.value = withDelay(
      TRACEPAY_SPLASH_TIMING.dropletStart,
      withTiming(1, enterTiming(TRACEPAY_SPLASH_TIMING.dropletDuration)),
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

  // Pieces start slightly offset, then slide into the shared canvas coordinates.
  const topStyle = useAnimatedStyle(() => {
    const t = top.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * -flyX * 0.35 },
        { translateY: (1 - t) * -flyY * 0.45 },
        { rotate: `${(1 - t) * -4}deg` },
      ],
    };
  });

  const outerStyle = useAnimatedStyle(() => {
    const t = outer.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * flyX * 0.4 },
        { translateY: (1 - t) * -flyY * 0.35 },
        { rotate: `${(1 - t) * 5}deg` },
      ],
    };
  });

  const verticalStyle = useAnimatedStyle(() => {
    const t = vertical.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * -flyX * 0.5 },
        { translateY: (1 - t) * -flyY * 0.12 },
        { rotate: `${(1 - t) * -3}deg` },
      ],
    };
  });

  const legStyle = useAnimatedStyle(() => {
    const t = leg.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * flyX * 0.45 },
        { translateY: (1 - t) * flyY * 0.42 },
        { rotate: `${(1 - t) * 6}deg` },
      ],
    };
  });

  const innerStyle = useAnimatedStyle(() => {
    const t = inner.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * -flyX * 0.18 },
        { translateY: (1 - t) * flyY * 0.32 },
        { rotate: `${(1 - t) * -4}deg` },
      ],
    };
  });

  const dropletStyle = useAnimatedStyle(() => {
    const t = droplet.value;
    return {
      opacity: t * piecesVisible.value,
      transform: [
        { translateX: (1 - t) * flyX * 0.12 },
        { translateY: (1 - t) * flyY * 0.28 },
        { rotate: `${(1 - t) * 3}deg` },
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

  const leftAccentStyle = useAnimatedStyle(() => {
    const t = accents.value;
    return {
      opacity: t,
      transform: [{ translateX: (1 - t) * -28 }],
    };
  });

  const rightAccentStyle = useAnimatedStyle(() => {
    const t = accents.value;
    return {
      opacity: t,
      transform: [{ translateX: (1 - t) * 28 }],
    };
  });

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

          <IconPiece size={iconSize} animatedStyle={verticalStyle} Piece={VerticalTStroke} />
          <IconPiece size={iconSize} animatedStyle={outerStyle} Piece={OuterRStroke} />
          <IconPiece size={iconSize} animatedStyle={legStyle} Piece={DiagonalRLeg} />
          <IconPiece size={iconSize} animatedStyle={innerStyle} Piece={InnerCurve} />
          <IconPiece size={iconSize} animatedStyle={dropletStyle} Piece={Droplet} />
          <IconPiece size={iconSize} animatedStyle={topStyle} Piece={TopStroke} />

          <Animated.View style={[StyleSheet.absoluteFill, finalIconStyle]}>
            <TracePayIcon size={iconSize} />
          </Animated.View>
        </Animated.View>

        <View
          accessibilityLabel="TRACEPAY. Find the leaks. Save your money."
          style={[
            styles.lockupStage,
            { width: wordmarkWidth, height: lockupHeight },
          ]}
        >
          <View style={[styles.wordmarkRow, { width: wordmarkWidth, height: wordmarkHeight }]}>
            <LockupPiece
              width={wordmarkColumnWidth}
              height={wordmarkHeight}
              animatedStyle={traceStyle}
              frameStyle={{ left: 0 }}
              Piece={TraceWordmark}
            />
            <LockupPiece
              width={wordmarkColumnWidth}
              height={wordmarkHeight}
              animatedStyle={payStyle}
              frameStyle={{ left: wordmarkColumnWidth - 12 }}
              Piece={PayWordmark}
            />
          </View>

          <View
            style={[
              styles.taglineRow,
              { top: wordmarkHeight + 12, width: wordmarkWidth, height: taglineStageHeight },
            ]}
          >
            <LockupPiece
              width={accentWidth}
              height={taglineStageHeight}
              animatedStyle={leftAccentStyle}
              frameStyle={{ left: 0 }}
              Piece={LeftPinkAccent}
            />
            <LockupPiece
              width={taglineTextWidth}
              height={taglineStageHeight}
              animatedStyle={taglineStyle}
              frameStyle={{ left: accentWidth + 6 }}
              preserveAspectRatio="none"
              Piece={Tagline}
            />
            <LockupPiece
              width={accentWidth}
              height={taglineStageHeight}
              animatedStyle={rightAccentStyle}
              frameStyle={{ left: accentWidth + 6 + taglineTextWidth + 6 }}
              Piece={RightBlueAccent}
            />
          </View>
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
    overflow: "hidden",
  },
  iconPiece: {
    ...StyleSheet.absoluteFillObject,
  },
  lockupStage: {
    position: "relative",
    marginTop: 8,
  },
  wordmarkRow: {
    position: "relative",
  },
  taglineRow: {
    position: "absolute",
    left: 0,
  },
  lockupPiece: {
    position: "absolute",
    top: 0,
    left: 0,
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
});
