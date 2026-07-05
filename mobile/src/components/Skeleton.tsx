import React, { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cn } from "@/lib/cn";

function useSkeletonPulse() {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export type SkeletonProps = ViewProps & {
  className?: string;
  width?: number | `${number}%`;
  height?: number;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
};

const roundedClasses: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
  full: "rounded-full",
};

export function Skeleton({
  className,
  width,
  height,
  rounded = "md",
  style,
  ...props
}: SkeletonProps) {
  const animatedStyle = useSkeletonPulse();

  return (
    <Animated.View
      className={cn("bg-muted dark:bg-white/10", roundedClasses[rounded], className)}
      style={[width != null || height != null ? { width, height } : undefined, animatedStyle, style]}
      {...props}
    />
  );
}
