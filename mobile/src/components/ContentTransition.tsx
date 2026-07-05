import React, { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const CONTENT_DURATION = 340;
const SKELETON_DURATION = 220;

type SkeletonRevealProps = ViewProps & {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** Crossfades skeleton out while content fades and slides in. Use mode="overlay" for full-screen gates. */
export function SkeletonReveal({
  loading,
  skeleton,
  children,
  className,
  mode = "overlay",
  ...props
}: SkeletonRevealProps & { mode?: "overlay" | "inline" }) {
  const skeletonOpacity = useSharedValue(loading ? 1 : 0);
  const contentOpacity = useSharedValue(loading ? 0 : 1);
  const contentTranslateY = useSharedValue(loading ? 8 : 0);

  useEffect(() => {
    skeletonOpacity.value = withTiming(loading ? 1 : 0, { duration: SKELETON_DURATION });
    contentOpacity.value = withTiming(loading ? 0 : 1, {
      duration: CONTENT_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    contentTranslateY.value = withTiming(loading ? 8 : 0, {
      duration: CONTENT_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [loading, skeletonOpacity, contentOpacity, contentTranslateY]);

  const skeletonStyle = useAnimatedStyle(() => ({ opacity: skeletonOpacity.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  if (mode === "inline") {
    return (
      <View className={className} {...props}>
        {loading ? (
          <Animated.View style={skeletonStyle}>{skeleton}</Animated.View>
        ) : (
          <Animated.View style={contentStyle}>{children}</Animated.View>
        )}
      </View>
    );
  }

  return (
    <View className={className} {...props}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, skeletonStyle]}
        pointerEvents={loading ? "auto" : "none"}
      >
        {skeleton}
      </Animated.View>
      {!loading ? <Animated.View style={[{ flex: 1 }, contentStyle]}>{children}</Animated.View> : null}
    </View>
  );
}

type FadeInItemProps = ViewProps & {
  index?: number;
  children: React.ReactNode;
};

const ITEM_DELAY = 40;
const ITEM_MAX_DELAY = 240;

/** Staggered enter for list rows after skeleton clears. */
export function FadeInItem({ index = 0, children, className, ...props }: FadeInItemProps) {
  const delay = Math.min(index * ITEM_DELAY, ITEM_MAX_DELAY);

  return (
    <Animated.View
      entering={FadeInDown.duration(320).delay(delay).easing(Easing.out(Easing.cubic))}
      className={className}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

type FadeInViewProps = ViewProps & {
  children: React.ReactNode;
};

/** Simple fade-in for a whole screen or section. */
export function FadeInView({ children, className, ...props }: FadeInViewProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(360).easing(Easing.out(Easing.cubic))}
      className={className}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

/** Wrap skeleton placeholders so they fade out cleanly. */
export function SkeletonPlaceholder({ children, className, ...props }: ViewProps) {
  return (
    <Animated.View exiting={FadeOut.duration(SKELETON_DURATION)} className={className} {...props}>
      {children}
    </Animated.View>
  );
}
