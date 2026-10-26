import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

type Props = {
  /** 0–1 share of the track that is filled. */
  ratio: number;
  color: string;
  track: string;
  height?: number;
  /** Milliseconds to wait before growing, for staggering a list. */
  delay?: number;
};

/** A progress bar that grows from empty to its value whenever the value changes. */
export function AnimatedBar({ ratio, color, track, height = 6, delay = 0 }: Props) {
  const safe = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(safe, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [safe, delay, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
    </Animated.View>
  );
}
