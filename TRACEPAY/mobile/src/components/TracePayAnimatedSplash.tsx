import { useEffect, useRef, type FunctionComponent } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaskedView } from "./ui/MaskedView";
import { LinearGradient } from "expo-linear-gradient";
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
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SvgProps } from "react-native-svg";

import PayWordmark from "../../assets/wordmark/pay-mono.svg";
import { TracePayDroplet as Droplet, TracePayMark as AssembledTracePayIcon } from "./ui/TracePayMark";
import TraceWordmark from "../../assets/wordmark/trace white wordmark.svg";
import { TRACEPAY, withAlpha } from "../theme/colors";
import { PAY_VIEWBOX, TRACE_VIEWBOX, wordmarkLayout } from "./wordmarkLayout";
import {
  TRACEPAY_DROPLET,
  TRACEPAY_ICON_COMPOSITION,
} from "./tracePayIconComposition";

export type Props = {
  onAnimationComplete: () => void;
};

export const TRACEPAY_SPLASH_BACKGROUNDS = {
  light: TRACEPAY.light.splashBackground,
  dark: TRACEPAY.dark.splashBackground,
} as const;

// Soft landing glow in the brand purple.
const GLOW_VIOLET = "#6D3FE0";

const ENTER_EASING = Easing.out(Easing.cubic);
const DROPLET_EASING = Easing.in(Easing.quad);
const EXIT_EASING = Easing.inOut(Easing.cubic);

/**
 * Branded intro:
 * assembled lockup is visible immediately
 * droplet drops into the mark
 * tagline reveals
 * fade to onboarding
 */
export const TRACEPAY_SPLASH_TIMING = {
  dropletStart: 700,
  dropletDuration: 1400,
  rippleDuration: 2400,
  revealDelay: 40,
  revealDuration: 1100,
  taglineStart: 3300,
  taglineDuration: 1600,
  exitStart: 7400,
  exitDuration: 500,
} as const;

type BrandPieceProps = {
  width: number;
  height: number;
  animatedStyle: object;
  frameStyle?: object;
  preserveAspectRatio?: string;
  color?: string;
  viewBox?: string;
  Piece: FunctionComponent<SvgProps>;
};

function LockupPiece({
  width,
  height,
  animatedStyle,
  frameStyle,
  preserveAspectRatio = "xMidYMid meet",
  color,
  viewBox,
  Piece,
}: BrandPieceProps) {
  return (
    <Animated.View
      style={[styles.lockupPiece, { width, height }, frameStyle, animatedStyle]}
    >
      <Piece
        width={width}
        height={height}
        color={color}
        viewBox={viewBox}
        preserveAspectRatio={preserveAspectRatio}
      />
    </Animated.View>
  );
}

/** One expanding, fading ring of light; stack a few for a neon-glow burst. */
function GlowRing({
  progress,
  delay,
  size,
  color,
  borderWidth,
  fillAlpha,
}: {
  progress: SharedValue<number>;
  delay: number;
  size: number;
  color: string;
  borderWidth: number;
  fillAlpha: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (progress.value - delay) / (1 - delay)));
    return {
      opacity: p > 0 ? 0.7 * (1 - p) * (1 - p) : 0,
      transform: [{ scale: 0.1 + 1.1 * p }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: color,
          backgroundColor: withAlpha(color, fillAlpha),
          shadowColor: color,
          shadowOpacity: 0.5,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 12,
        },
        style,
      ]}
    />
  );
}

function AnimatedDroplet({
  displayScale,
  progress,
  impact,
  fallDistance,
  color,
}: {
  displayScale: number;
  progress: SharedValue<number>;
  /** 0 → 1 → 0 pulse at the moment the droplet lands; drives the squash. */
  impact: SharedValue<number>;
  /** How far above its resting place the droplet starts, in screen px. */
  fallDistance: number;
  color: string;
}) {
  const { final, viewWidth, viewHeight } = TRACEPAY_DROPLET;
  const pieceWidth = viewWidth * final.scale * displayScale;
  const pieceHeight = viewHeight * final.scale * displayScale;

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const hit = impact.value;
    // Stretches while it speeds up, is back to true size by the time it lands,
    // then squashes flat on impact and springs back.
    const fall = t < 0.9 ? t / 0.9 : (1 - t) / 0.1;
    const stretch = 1 + 0.3 * fall;
    const grow = 0.7 + 0.3 * t;
    const squashY = 1 - 0.22 * hit;
    const squashX = 1 + 0.16 * hit;

    return {
      opacity: Math.min(1, t * 8),
      left: final.x * displayScale,
      top: final.y * displayScale,
      transform: [
        { translateY: -fallDistance * (1 - t) + pieceHeight * 0.14 * hit },
        { scaleX: (grow * squashX) / Math.sqrt(stretch) },
        { scaleY: grow * stretch * squashY },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.composedPiece,
        { width: pieceWidth, height: pieceHeight, zIndex: 2 },
        animatedStyle,
      ]}
      testID="tracepay-icon-piece-droplet"
    >
      <Droplet
        width={pieceWidth}
        height={pieceHeight}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMinYMin meet"
        color={color}
      />
    </Animated.View>
  );
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
  const iconHeight =
    iconSize * (TRACEPAY_ICON_COMPOSITION.height / TRACEPAY_ICON_COMPOSITION.width);
  const displayScale = iconSize / TRACEPAY_ICON_COMPOSITION.width;

  const wordmarkWidth = Math.min(contentWidth * 0.94, 380);
  const wordmark = wordmarkLayout(wordmarkWidth);
  const wordmarkHeight = wordmark.height;
  const taglineStageHeight = 16;
  const accentWidth = 16;
  const accentHeight = 2;
  const taglineGap = 14;
  const taglineWidth = Math.min(width - 32, 440);
  const taglineTextWidth = taglineWidth - accentWidth * 2 - 16;

  const dropletCoverWidth =
    TRACEPAY_DROPLET.viewWidth * TRACEPAY_DROPLET.final.scale * displayScale;
  const dropletCoverHeight =
    TRACEPAY_DROPLET.viewHeight * TRACEPAY_DROPLET.final.scale * displayScale;

  const droplet = useSharedValue(0);
  const impact = useSharedValue(0);
  const ripple = useSharedValue(0);
  const reveal = useSharedValue(0);
  const tagline = useSharedValue(0);
  const fallDistance = height * 0.7;
  const landAt = TRACEPAY_SPLASH_TIMING.dropletStart + TRACEPAY_SPLASH_TIMING.dropletDuration;
  const screen = useSharedValue(1);

  useEffect(() => {
    const finish = () => {
      onCompleteRef.current();
    };

    droplet.value = withDelay(
      TRACEPAY_SPLASH_TIMING.dropletStart,
      withTiming(1, {
        duration: TRACEPAY_SPLASH_TIMING.dropletDuration,
        easing: DROPLET_EASING,
      }),
    );

    impact.value = withDelay(
      landAt,
      withSequence(
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 6, stiffness: 220, mass: 0.7 }),
      ),
    );

    ripple.value = withDelay(
      landAt,
      withTiming(1, { duration: TRACEPAY_SPLASH_TIMING.rippleDuration, easing: ENTER_EASING }),
    );

    reveal.value = withDelay(
      landAt + TRACEPAY_SPLASH_TIMING.revealDelay,
      withTiming(1, { duration: TRACEPAY_SPLASH_TIMING.revealDuration, easing: ENTER_EASING }),
    );

    tagline.value = withDelay(
      TRACEPAY_SPLASH_TIMING.taglineStart,
      withTiming(1, {
        duration: TRACEPAY_SPLASH_TIMING.taglineDuration,
        easing: ENTER_EASING,
      }),
    );

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

  // The whole mark gives a little kick when the droplet lands.
  const iconPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.06 * impact.value }],
  }));

  const glowSize = iconSize * 2.6;

  const wordmarkRevealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 22 }, { scale: 0.94 + 0.06 * reveal.value }],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screen.value,
  }));

  const leftAccentStyle = useAnimatedStyle(() => ({ opacity: tagline.value }));
  const rightAccentStyle = useAnimatedStyle(() => ({ opacity: tagline.value }));

  // Pure fade, no slide: it appears once the droplet has landed and settled.
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
  }));

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
      <View style={styles.lockup}>
        <Animated.View
          accessibilityLabel="TracePay icon"
          style={[
            styles.iconStage,
            { width: iconSize, height: iconHeight },
            iconPulseStyle,
          ]}
        >
          {/* Burst of neon light from the landing point. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: iconSize / 2,
              top: iconHeight / 2,
              width: 0,
              height: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GlowRing progress={ripple} delay={0} size={glowSize} color={GLOW_VIOLET} borderWidth={0} fillAlpha={0.1} />
            <GlowRing progress={ripple} delay={0.05} size={glowSize * 0.85} color={GLOW_VIOLET} borderWidth={2} fillAlpha={0} />
            <GlowRing progress={ripple} delay={0.18} size={glowSize * 0.7} color={GLOW_VIOLET} borderWidth={1.5} fillAlpha={0} />
          </View>
          <AssembledTracePayIcon
            width={iconSize}
            height={iconHeight}
            color={palette.primary}
            preserveAspectRatio="xMidYMid meet"
          />
          <View
            pointerEvents="none"
            style={[
              styles.dropletCover,
              {
                width: dropletCoverWidth,
                height: dropletCoverHeight,
                left: TRACEPAY_DROPLET.final.x * displayScale,
                top: TRACEPAY_DROPLET.final.y * displayScale,
                backgroundColor: palette.splashBackground,
              },
            ]}
          />
          <AnimatedDroplet
            displayScale={displayScale}
            progress={droplet}
            impact={impact}
            fallDistance={fallDistance}
            color={palette.primary}
          />
        </Animated.View>

        <Animated.View
          accessibilityLabel="TRACEPAY. Find the leaks. Save your money."
          style={[styles.lockupStage, wordmarkRevealStyle]}
        >
          <View
            style={[
              styles.wordmarkRow,
              { width: wordmarkWidth, height: wordmarkHeight },
            ]}
          >
            <LockupPiece
              width={wordmark.traceWidth}
              height={wordmark.height}
              animatedStyle={{}}
              frameStyle={{ left: 0 }}
              color={palette.splashForeground}
              viewBox={TRACE_VIEWBOX}
              Piece={TraceWordmark}
            />
            <LockupPiece
              width={wordmark.payWidth}
              height={wordmark.height}
              animatedStyle={{}}
              frameStyle={{ left: wordmark.payLeft }}
              color={palette.splashForeground}
              viewBox={PAY_VIEWBOX}
              Piece={PayWordmark}
            />
          </View>

          <View
            style={[
              styles.taglineRow,
              {
                width: taglineWidth,
                height: taglineStageHeight,
                marginTop: taglineGap,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.taglineAccentWrap,
                { width: accentWidth, height: taglineStageHeight },
                leftAccentStyle,
              ]}
            >
              <LinearGradient
                colors={[palette.primary, "transparent"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: accentWidth, height: accentHeight, borderRadius: 1 }}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.taglineTextWrap,
                { width: taglineTextWidth, height: taglineStageHeight },
                taglineStyle,
              ]}
            >
              <MaskedView
                style={{ width: taglineTextWidth, height: taglineStageHeight }}
                maskElement={
                  <View style={styles.taglineMask}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                      style={styles.taglineText}
                    >
                      FIND THE LEAKS. SAVE YOUR MONEY.
                    </Text>
                  </View>
                }
              >
                <LinearGradient
                  colors={[palette.primary, palette.primary]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ width: taglineTextWidth, height: taglineStageHeight }}
                />
              </MaskedView>
            </Animated.View>
            <Animated.View
              style={[
                styles.taglineAccentWrap,
                { width: accentWidth, height: taglineStageHeight },
                rightAccentStyle,
              ]}
            >
              <LinearGradient
                colors={["transparent", palette.primary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: accentWidth, height: accentHeight, borderRadius: 1 }}
              />
            </Animated.View>
          </View>
        </Animated.View>
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
    overflow: "visible",
  },
  dropletCover: {
    position: "absolute",
    zIndex: 1,
  },
  composedPiece: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "visible",
  },
  lockupStage: {
    marginTop: 8,
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  wordmarkRow: {
    position: "relative",
  },
  taglineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    gap: 8,
  },
  lockupPiece: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  taglineTextWrap: {
    justifyContent: "center",
  },
  taglineAccentWrap: {
    justifyContent: "center",
  },
  taglineMask: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  taglineText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.4,
    textAlign: "center",
    includeFontPadding: false,
  },
});
