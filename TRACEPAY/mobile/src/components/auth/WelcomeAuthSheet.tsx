import { useColorScheme } from "nativewind";
import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, withAlpha } from "../../theme/colors";

const OPEN_MS = 340;
const CLOSE_MS = 300;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_EASING = Easing.inOut(Easing.cubic);
const DISMISS_DISTANCE = 0.22;
const DISMISS_VELOCITY = 900;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 0 = fully closed / hero brand, 1 = fully open / compact brand. */
  progress: SharedValue<number>;
  dismissible?: boolean;
  heightRatio?: number;
};

/**
 * Auth bottom sheet with Reanimated progress so the welcome brand can scrub
 * in sync with open / drag / dismiss. Expo UI community sheets do not expose
 * animatedIndex/position.
 */
export function WelcomeAuthSheet({
  visible,
  onClose,
  children,
  progress,
  dismissible = true,
  heightRatio = 0.7,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const sheetHeight = Math.round(windowHeight * heightRatio);
  const translateY = useSharedValue(sheetHeight);
  const dragStartY = useSharedValue(0);
  const isClosing = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      isClosing.value = false;
      translateY.value = sheetHeight;
      progress.value = 0;
      translateY.value = withTiming(0, {
        duration: OPEN_MS,
        easing: OPEN_EASING,
      });
      progress.value = withTiming(1, {
        duration: OPEN_MS,
        easing: OPEN_EASING,
      });
      return;
    }

    if (isClosing.value) {
      return;
    }

    translateY.value = withTiming(sheetHeight, {
      duration: CLOSE_MS,
      easing: CLOSE_EASING,
    });
    progress.value = withTiming(0, {
      duration: CLOSE_MS,
      easing: CLOSE_EASING,
    });
  }, [isClosing, progress, sheetHeight, translateY, visible]);

  const finishDismiss = () => {
    isClosing.value = false;
    onClose();
  };

  const dismissToClosed = (duration: number) => {
    isClosing.value = true;
    translateY.value = withTiming(
      sheetHeight,
      { duration, easing: CLOSE_EASING },
      (finished) => {
        if (finished) {
          progress.value = 0;
          runOnJS(finishDismiss)();
        }
      },
    );
    progress.value = withTiming(0, { duration, easing: CLOSE_EASING });
  };

  const pan = Gesture.Pan()
    .enabled(dismissible && visible)
    .onBegin(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = Math.min(
        sheetHeight,
        Math.max(0, dragStartY.value + event.translationY),
      );
      translateY.value = next;
      progress.value = interpolate(
        next,
        [0, sheetHeight],
        [1, 0],
        Extrapolation.CLAMP,
      );
    })
    .onEnd((event) => {
      const shouldClose =
        translateY.value > sheetHeight * DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY;

      if (shouldClose) {
        const remaining = sheetHeight - translateY.value;
        const velocityDuration =
          (remaining / Math.max(Math.abs(event.velocityY), 400)) * 1000;
        dismissToClosed(Math.min(CLOSE_MS, Math.max(180, velocityDuration)));
        return;
      }

      translateY.value = withTiming(0, {
        duration: OPEN_MS * 0.7,
        easing: OPEN_EASING,
      });
      progress.value = withTiming(1, {
        duration: OPEN_MS * 0.7,
        easing: OPEN_EASING,
      });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: withAlpha("#000000", 0.45) },
          backdropStyle,
        ]}
      >
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          disabled={!dismissible}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!dismissible || isClosing.value) {
              return;
            }
            dismissToClosed(CLOSE_MS);
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            backgroundColor: palette.card,
            paddingBottom: Math.max(insets.bottom, 20),
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.handleHit}>
            <View style={[styles.handle, { backgroundColor: palette.border }]} />
          </View>
        </GestureDetector>
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </Animated.ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  handleHit: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
