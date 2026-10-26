import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { COLORS, withAlpha } from "../../theme/colors";
import type { SkeletonProps } from "./Skeleton.types";

/** Pulsing placeholder block (non-iOS fallback for the SwiftUI skeleton). */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  circle = false,
  onDark = false,
}: SkeletonProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: circle ? height / 2 : radius,
          backgroundColor: onDark
            ? "rgba(255,255,255,0.28)"
            : withAlpha(palette.mutedForeground, 0.22),
        },
        style,
      ]}
    />
  );
}
