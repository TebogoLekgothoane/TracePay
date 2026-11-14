import { useEffect, useRef } from "react";
import { Image, StyleSheet, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TRACEPAY } from "../theme/colors";

export type Props = {
  onAnimationComplete: () => void;
};

export const TRACEPAY_SPLASH_BACKGROUNDS = {
  light: TRACEPAY.light.splashBackground,
  dark: TRACEPAY.dark.splashBackground,
} as const;

// The logo, cut into layers so the droplet can fall into the R. The dark set has the
// near-black ink lightened so the lockup stays readable on a dark background.
const ART = {
  light: {
    mark: require("../../assets/splash/mark-light.png"),
    droplet: require("../../assets/splash/droplet-light.png"),
  },
  dark: {
    mark: require("../../assets/splash/mark-dark.png"),
    droplet: require("../../assets/splash/droplet-dark.png"),
  },
} as const;

/** Pixel sizes of the layers, and where the droplet rests inside the mark. */
export const MARK = { width: 1214, height: 804 };
const DROPLET = { x: 807, y: 0, width: 340, height: 423 };

/** How far the camera dives into the R by the time the splash has faded out. */
const DIVE_TO = 7;
/**
 * The logo is laid out this many times larger than it first looks and starts scaled down.
 * Pictures soften when they are scaled up after layout and stay sharp when they only shrink.
 */
const LAYOUT_SCALE = 4;

export const DROPLET_EASING = Easing.in(Easing.quad);
// One easing for the whole dive, with no ease-out: it starts gently and is still gathering
// speed when the screen fades, so the camera never slows, stops or restarts.
const DIVE_EASING = Easing.in(Easing.quad);
const FADE_EASING = Easing.inOut(Easing.cubic);

/** The droplet's bounce: each swing is smaller than the last. + squashes, - stretches up. */
export const BOUNCE: readonly (readonly [value: number, duration: number])[] = [
  [1, 150],
  [-0.7, 190],
  [0.45, 150],
  [-0.28, 150],
  [0.14, 130],
  [-0.06, 110],
  [0, 100],
];
const BOUNCE_DURATION = BOUNCE.reduce((total, [, duration]) => total + duration, 0);

/**
 * Branded intro:
 * the mark is on screen without its droplet
 * the droplet falls into the R and bounces like jelly, then rests in the R
 * the camera dives into the R in one continuous move, speeding up the whole way, and the
 * droplet rises up and out of the frame with it, on the same move
 * the screen fades into the app while the dive is still going
 */
export const TRACEPAY_SPLASH_TIMING = {
  dropletStart: 700,
  dropletDuration: 1400,
  /** A beat on the finished logo, droplet still in place, then the dive starts and the droplet rises. */
  divePause: 450,
  diveDuration: 1800,
  /** Fraction of the dive at which the fade begins, so it ends with the dive. */
  fadeStartFraction: 0.7,
} as const;

/** The droplet's fall, bounce and rise. Shared with the in-app logo, so both move the same way. */
export function AnimatedDroplet({
  source,
  displayScale,
  progress,
  impact,
  dive,
  fallDistance,
  riseDistance,
}: {
  source: number;
  displayScale: number;
  progress: SharedValue<number>;
  /** The bounce: positive squashes the droplet, negative stretches it up and lifts it. */
  impact: SharedValue<number>;
  /** The camera's dive, 0 → 1. The droplet rises with it, on the same easing. */
  dive: SharedValue<number>;
  /** How far above its resting place the droplet starts, in px at this scale. */
  fallDistance: number;
  /** How far the droplet rises by the end of the dive, in px at this scale. */
  riseDistance: number;
}) {
  const pieceWidth = DROPLET.width * displayScale;
  const pieceHeight = DROPLET.height * displayScale;

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const hit = impact.value;
    const rise = dive.value;
    // Stretches while it speeds up and is back to true size by the time it lands.
    const fall = t < 0.9 ? t / 0.9 : (1 - t) / 0.1;
    const stretch = 1 + 0.25 * fall;
    const grow = 0.7 + 0.3 * t;
    const squashY = 1 - 0.38 * hit;
    const squashX = 1 + 0.26 * hit;
    // The base stays on the R while the top squashes down or stretches up, and a stretch
    // also lifts the whole droplet a little, so each bounce really leaves the surface.
    const anchor = (pieceHeight * (1 - squashY)) / 2;
    const lift = hit < 0 ? pieceHeight * 0.22 * hit : 0;

    return {
      opacity: Math.min(1, t * 8),
      transform: [
        // During the dive the droplet rises straight up, at the camera's own pace.
        { translateY: -fallDistance * (1 - t) + anchor + lift - rise * riseDistance },
        { scaleX: (grow * squashX) / Math.sqrt(stretch) },
        { scaleY: grow * stretch * squashY },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.droplet,
        {
          width: pieceWidth,
          height: pieceHeight,
          left: DROPLET.x * displayScale,
          top: DROPLET.y * displayScale,
        },
        animatedStyle,
      ]}
      testID="tracepay-icon-piece-droplet"
    >
      <Image source={source} style={{ width: pieceWidth, height: pieceHeight }} resizeMode="contain" />
    </Animated.View>
  );
}

export function TracePayAnimatedSplash({ onAnimationComplete }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = TRACEPAY[scheme];
  const art = ART[scheme];
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  // The mark as the viewer first sees it. It is sized from the screen, and kept small enough
  // to leave room around it.
  const lockupWidth = Math.min(width * 0.88, height * 0.55, 400);
  const baseMarkWidth = lockupWidth * 0.47;
  const baseMarkHeight = baseMarkWidth * (MARK.height / MARK.width);
  const baseScale = baseMarkWidth / MARK.width;

  // Everything is laid out at LAYOUT_SCALE times its first size.
  const markWidth = baseMarkWidth * LAYOUT_SCALE;
  const markHeight = baseMarkHeight * LAYOUT_SCALE;
  const displayScale = baseScale * LAYOUT_SCALE;

  // The middle of the R's opening (where the droplet rests), measured from the middle of the
  // screen in the first view. The dive heads for this point.
  const markTop = insets.top + (height - insets.top - insets.bottom - baseMarkHeight) / 2;
  const focus = {
    x: (width - baseMarkWidth) / 2 + (DROPLET.x + DROPLET.width / 2) * baseScale - width / 2,
    y: markTop + (DROPLET.y + DROPLET.height / 2) * baseScale - height / 2,
  };

  const reduceMotion = useReducedMotion();
  const droplet = useSharedValue(0);
  const impact = useSharedValue(0);
  const dive = useSharedValue(0);
  const screen = useSharedValue(1);
  const fallDistance = height * 0.7 * LAYOUT_SCALE;
  // The camera zooms in on the droplet's spot, so the droplet climbs far enough to be clear
  // of the screen's top edge by the time the screen has faded.
  const riseDistance = height * 0.25 * LAYOUT_SCALE;

  useEffect(() => {
    const t = TRACEPAY_SPLASH_TIMING;
    const landAt = t.dropletStart + t.dropletDuration;
    const bounceEnd = landAt + BOUNCE_DURATION;
    const diveStart = bounceEnd + t.divePause;
    const fadeStart = diveStart + t.diveDuration * t.fadeStartFraction;
    const fadeDuration = t.diveDuration * (1 - t.fadeStartFraction);

    const finish = () => {
      onCompleteRef.current();
    };

    droplet.value = withDelay(
      t.dropletStart,
      withTiming(1, { duration: t.dropletDuration, easing: DROPLET_EASING }),
    );

    // A bouncy landing: it squashes, springs up past its shape, and settles in a few
    // smaller and smaller bounces.
    impact.value = withDelay(
      landAt,
      withSequence(
        ...BOUNCE.map(([value, duration]) =>
          withTiming(value, { duration, easing: Easing.inOut(Easing.sin) }),
        ),
      ),
    );

    // For people who ask their phone for less motion, there is no dive: the logo just fades out.
    const quietFadeStart = reduceMotion ? diveStart : fadeStart;
    const quietFadeDuration = reduceMotion ? 500 : fadeDuration;
    if (!reduceMotion) {
      dive.value = withDelay(
        diveStart,
        withTiming(1, { duration: t.diveDuration, easing: DIVE_EASING }),
      );
    }

    // The fade starts mid-dive and ends with it, so the camera is still speeding up as the
    // splash disappears into the app.
    screen.value = withDelay(
      quietFadeStart,
      withTiming(0, { duration: quietFadeDuration, easing: FADE_EASING }, (finished) => {
        if (finished) {
          runOnJS(finish)();
        }
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // The camera: one move, driven by one value. It zooms about the middle of the R's opening
  // and slides that point to the middle of the screen. The scale is exponential, which looks
  // like a steady rush, and nothing else touches it, so there is no pause and no restart.
  const cameraStyle = useAnimatedStyle(() => {
    const p = dive.value;
    const scale = Math.pow(DIVE_TO, p);
    const pan = scale - 1 + p;
    return {
      transform: [
        { translateX: -pan * focus.x },
        { translateY: -pan * focus.y },
        // The content is laid out LAYOUT_SCALE times larger, so it starts scaled back down.
        { scale: scale / LAYOUT_SCALE },
      ],
    };
  });

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screen.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 z-[1000]"
      style={[styles.screen, { backgroundColor: palette.splashBackground }, screenStyle]}
      testID="tracepay-animated-splash"
    >
      <Animated.View
        style={[
          styles.camera,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
          cameraStyle,
        ]}
      >
        <Animated.View
          accessibilityLabel="TracePay icon"
          style={[styles.iconStage, { width: markWidth, height: markHeight }]}
        >
          <Image source={art.mark} style={{ width: markWidth, height: markHeight }} resizeMode="contain" />
          <AnimatedDroplet
            source={art.droplet}
            displayScale={displayScale}
            progress={droplet}
            impact={impact}
            dive={dive}
            fallDistance={fallDistance}
            riseDistance={riseDistance}
          />
        </Animated.View>
      </Animated.View>
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
    overflow: "hidden",
  },
  camera: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  iconStage: {
    position: "relative",
    overflow: "visible",
  },
  droplet: {
    position: "absolute",
    zIndex: 2,
  },
});
