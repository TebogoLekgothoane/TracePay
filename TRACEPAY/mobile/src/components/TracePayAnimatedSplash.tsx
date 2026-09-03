import { useEffect, useRef, type FunctionComponent } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SvgProps } from "react-native-svg";

import AssembledTracePayIcon from "../../assets/icons/assembled TracePay icon.svg";
import Droplet from "../../assets/icons/droplet.svg";
import PayWordmark from "../../assets/wordmark/PAY.svg";
import TraceWordmark from "../../assets/wordmark/trace white wordmark.svg";
import { TRACEPAY } from "../theme/colors";
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

const ENTER_EASING = Easing.out(Easing.cubic);
const DROPLET_EASING = Easing.inOut(Easing.cubic);
const EXIT_EASING = Easing.inOut(Easing.cubic);

/**
 * Branded intro:
 * assembled lockup is visible immediately
 * droplet drops into the mark
 * tagline reveals
 * fade to onboarding
 */
export const TRACEPAY_SPLASH_TIMING = {
  dropletStart: 500,
  dropletDuration: 2000,
  taglineStart: 2700,
  taglineDuration: 500,
  exitStart: 6200,
  exitDuration: 500,
} as const;

type BrandPieceProps = {
  width: number;
  height: number;
  animatedStyle: object;
  frameStyle?: object;
  preserveAspectRatio?: string;
  color?: string;
  Piece: FunctionComponent<SvgProps>;
};

function LockupPiece({
  width,
  height,
  animatedStyle,
  frameStyle,
  preserveAspectRatio = "xMidYMid meet",
  color,
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
        preserveAspectRatio={preserveAspectRatio}
      />
    </Animated.View>
  );
}

function AnimatedDroplet({
  displayScale,
  progress,
}: {
  displayScale: number;
  progress: SharedValue<number>;
}) {
  const { start, final, viewWidth, viewHeight } = TRACEPAY_DROPLET;
  const pieceWidth = viewWidth * final.scale * displayScale;
  const pieceHeight = viewHeight * final.scale * displayScale;

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = start.x + (final.x - start.x) * t;
    const y = start.y + (final.y - start.y) * t;
    const rotation = start.rotation + (final.rotation - start.rotation) * t;

    return {
      opacity: t,
      left: x * displayScale,
      top: y * displayScale,
      transform: [{ rotate: `${rotation}deg` }],
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
  const wordmarkHeight = wordmarkWidth * (632 / 1897);
  const wordmarkColumnWidth = (wordmarkWidth - 8) / 2;
  const taglineStageHeight = 42;
  const accentWidth = 22;
  const accentHeight = 2;
  const taglineGap = 18;
  const taglineWidth = Math.min(width - 32, 440);
  const taglineTextWidth = taglineWidth - accentWidth * 2 - 16;

  const dropletCoverWidth =
    TRACEPAY_DROPLET.viewWidth * TRACEPAY_DROPLET.final.scale * displayScale;
  const dropletCoverHeight =
    TRACEPAY_DROPLET.viewHeight * TRACEPAY_DROPLET.final.scale * displayScale;

  const droplet = useSharedValue(0);
  const tagline = useSharedValue(0);
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

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screen.value,
  }));

  const leftAccentStyle = useAnimatedStyle(() => {
    const t = tagline.value;
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 6 }],
    };
  });

  const rightAccentStyle = useAnimatedStyle(() => {
    const t = tagline.value;
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 6 }],
    };
  });

  const taglineStyle = useAnimatedStyle(() => {
    const t = tagline.value;
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 6 }],
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
      <View style={styles.lockup}>
        <View
          accessibilityLabel="TracePay icon"
          style={[
            styles.iconStage,
            { width: iconSize, height: iconHeight },
          ]}
        >
          <AssembledTracePayIcon
            width={iconSize}
            height={iconHeight}
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
          <AnimatedDroplet displayScale={displayScale} progress={droplet} />
        </View>

        <View
          accessibilityLabel="TRACEPAY. Find the leaks. Save your money."
          style={styles.lockupStage}
        >
          <View
            style={[
              styles.wordmarkRow,
              { width: wordmarkWidth, height: wordmarkHeight },
            ]}
          >
            <LockupPiece
              width={wordmarkColumnWidth}
              height={wordmarkHeight}
              animatedStyle={{}}
              frameStyle={{ left: 0 }}
              color={palette.splashForeground}
              Piece={TraceWordmark}
            />
            <LockupPiece
              width={wordmarkColumnWidth}
              height={wordmarkHeight}
              animatedStyle={{}}
              frameStyle={{ left: wordmarkColumnWidth - 12 }}
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
                colors={[palette.splashAccentPink, "transparent"]}
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
                  colors={[palette.splashAccentPink, palette.splashAccentBlue]}
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
                colors={["transparent", palette.splashAccentBlue]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: accentWidth, height: accentHeight, borderRadius: 1 }}
              />
            </Animated.View>
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
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.4,
    textAlign: "center",
    includeFontPadding: false,
  },
});
