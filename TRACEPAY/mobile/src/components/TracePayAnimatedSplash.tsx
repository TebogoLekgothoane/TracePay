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
    wordmark: require("../../assets/splash/wordmark-light.png"),
    tagline: require("../../assets/splash/tagline-light.png"),
  },
  dark: {
    mark: require("../../assets/splash/mark-dark.png"),
    droplet: require("../../assets/splash/droplet-dark.png"),
    wordmark: require("../../assets/splash/wordmark-dark.png"),
    tagline: require("../../assets/splash/tagline-dark.png"),
  },
} as const;

/** Pixel sizes of the layers, and where the droplet rests inside the mark. */
const MARK = { width: 1120, height: 922 };
const DROPLET = { x: 552, y: 316, width: 184, height: 248 };
const WORDMARK = { width: 1313, height: 156 };
const TAGLINE = { width: 1313, height: 41 };

/** How far the camera dives into the R by the time the splash has faded out. */
const DIVE_TO = 7;
/**
 * The logo is laid out this many times larger than it first looks and starts scaled down.
 * Pictures soften when they are scaled up after layout and stay sharp when they only shrink.
 */
const LAYOUT_SCALE = 4;

const ENTER_EASING = Easing.out(Easing.cubic);
const DROPLET_EASING = Easing.in(Easing.quad);
// One easing for the whole dive, with no ease-out: it starts gently and is still gathering
// speed when the screen fades, so the camera never slows, stops or restarts.
const DIVE_EASING = Easing.in(Easing.quad);
const FADE_EASING = Easing.inOut(Easing.cubic);

/** The droplet's bounce: each swing is smaller than the last. + squashes, - stretches up. */
const BOUNCE: readonly (readonly [value: number, duration: number])[] = [
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
 * after a pause the wordmark rises in slowly, then the tagline fades in
 * the droplet disappears once the name and tagline are showing, just before the dive
 * the camera dives into the R in one continuous move, speeding up the whole way
 * the screen fades into the app while the dive is still going
 */
export const TRACEPAY_SPLASH_TIMING = {
  dropletStart: 700,
  dropletDuration: 1400,
  /** The droplet's disappearance, which ends as the dive begins. */
  vanishDuration: 200,
  /** A pause after the bounce is over before the name shows. */
  wordmarkPause: 450,
  wordmarkDuration: 1500,
  /** The tagline starts while the name is still arriving. */
  taglineAfterWordmark: 1000,
  taglineDuration: 1300,
  /** A beat on the finished logo, droplet still in place, then the droplet goes and the dive starts. */
  divePause: 450,
  diveDuration: 1800,
  /** Fraction of the dive at which the fade begins, so it ends with the dive. */
  fadeStartFraction: 0.7,
} as const;

const clamp01 = (value: number) => {
  "worklet";
  return Math.min(1, Math.max(0, value));
};

function AnimatedDroplet({
  source,
  displayScale,
  progress,
  impact,
  vanish,
  fallDistance,
}: {
  source: number;
  displayScale: number;
  progress: SharedValue<number>;
  /** The bounce: positive squashes the droplet, negative stretches it up and lifts it. */
  impact: SharedValue<number>;
  /** 0 → 1 just before the dive: the droplet disappears. */
  vanish: SharedValue<number>;
  /** How far above its resting place the droplet starts, in px at this scale. */
  fallDistance: number;
}) {
  const pieceWidth = DROPLET.width * displayScale;
  const pieceHeight = DROPLET.height * displayScale;

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const hit = impact.value;
    const gone = vanish.value;
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
      opacity: Math.min(1, t * 8) * (1 - gone),
      transform: [
        { translateY: -fallDistance * (1 - t) + anchor + lift },
        { scaleX: (grow * squashX * (1 - 0.5 * gone)) / Math.sqrt(stretch) },
        { scaleY: grow * stretch * squashY * (1 - 0.5 * gone) },
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

  // The lockup as the viewer first sees it. The mark is under half the wordmark's width,
  // as in the logo itself.
  const lockupWidth = Math.min(width * 0.88, height * 0.55, 400);
  const baseMarkWidth = lockupWidth * 0.47;
  const baseMarkHeight = baseMarkWidth * (MARK.height / MARK.width);
  const wordmarkHeightBase = lockupWidth * (WORDMARK.height / WORDMARK.width);
  const taglineHeightBase = lockupWidth * (TAGLINE.height / TAGLINE.width);
  const lockupHeight = baseMarkHeight + 4 + wordmarkHeightBase + 6 + taglineHeightBase;
  const baseScale = baseMarkWidth / MARK.width;

  // Everything is laid out at LAYOUT_SCALE times its first size.
  const markWidth = baseMarkWidth * LAYOUT_SCALE;
  const markHeight = baseMarkHeight * LAYOUT_SCALE;
  const displayScale = baseScale * LAYOUT_SCALE;
  const bigLockupWidth = lockupWidth * LAYOUT_SCALE;
  const wordmarkHeight = wordmarkHeightBase * LAYOUT_SCALE;
  const taglineHeight = taglineHeightBase * LAYOUT_SCALE;

  // The middle of the R's opening (where the droplet rests), measured from the middle of the
  // screen in the first view. The dive heads for this point.
  const lockupTop = insets.top + (height - insets.top - insets.bottom - lockupHeight) / 2;
  const focus = {
    x: (width - baseMarkWidth) / 2 + (DROPLET.x + DROPLET.width / 2) * baseScale - width / 2,
    y: lockupTop + (DROPLET.y + DROPLET.height / 2) * baseScale - height / 2,
  };

  const reduceMotion = useReducedMotion();
  const droplet = useSharedValue(0);
  const impact = useSharedValue(0);
  const vanish = useSharedValue(0);
  const reveal = useSharedValue(0);
  const tagline = useSharedValue(0);
  const dive = useSharedValue(0);
  const screen = useSharedValue(1);
  const fallDistance = height * 0.7 * LAYOUT_SCALE;

  useEffect(() => {
    const t = TRACEPAY_SPLASH_TIMING;
    const landAt = t.dropletStart + t.dropletDuration;
    const bounceEnd = landAt + BOUNCE_DURATION;
    const wordmarkStart = bounceEnd + t.wordmarkPause;
    const taglineStart = wordmarkStart + t.taglineAfterWordmark;
    const taglineEnd = taglineStart + t.taglineDuration;
    const diveStart = Math.max(taglineEnd, wordmarkStart + t.wordmarkDuration) + t.divePause;
    // The droplet stays in the R through the name and tagline and goes at the last moment.
    const vanishStart = diveStart - t.vanishDuration;
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

    // The droplet disappears just before the dive, so it never goes into the zoom.
    // (With reduced motion there is no dive, and it simply stays.)
    if (!reduceMotion) {
      vanish.value = withDelay(
        vanishStart,
        withTiming(1, { duration: t.vanishDuration, easing: Easing.in(Easing.cubic) }),
      );
    }

    reveal.value = withDelay(
      wordmarkStart,
      withTiming(1, { duration: t.wordmarkDuration, easing: ENTER_EASING }),
    );

    tagline.value = withDelay(
      taglineStart,
      withTiming(1, { duration: t.taglineDuration, easing: ENTER_EASING }),
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

  // The name and the tagline arrive slowly, with a long rise, and leave as the dive starts.
  const wordmarkRevealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value * (1 - clamp01(dive.value * 5)),
    transform: [
      { translateY: (1 - reveal.value) * 30 * LAYOUT_SCALE },
      { scale: 0.92 + 0.08 * reveal.value },
    ],
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screen.value,
  }));

  // Pure fade, no slide: it appears after the name has begun to settle.
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
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
        <Animated.View style={styles.lockup}>
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
              vanish={vanish}
              fallDistance={fallDistance}
            />
          </Animated.View>

          <Animated.View
            accessibilityLabel="TRACEPAY. Find the leaks. Save your money."
            style={[styles.lockupStage, { marginTop: 4 * LAYOUT_SCALE }, wordmarkRevealStyle]}
          >
            <Image
              source={art.wordmark}
              style={{ width: bigLockupWidth, height: wordmarkHeight }}
              resizeMode="contain"
            />
            <Animated.View style={[{ marginTop: 6 * LAYOUT_SCALE }, taglineStyle]}>
              <Image
                source={art.tagline}
                style={{ width: bigLockupWidth, height: taglineHeight }}
                resizeMode="contain"
              />
            </Animated.View>
          </Animated.View>
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
  lockup: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconStage: {
    position: "relative",
    overflow: "visible",
  },
  droplet: {
    position: "absolute",
    zIndex: 2,
  },
  lockupStage: {
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
});
