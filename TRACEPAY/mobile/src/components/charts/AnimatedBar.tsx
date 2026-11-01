import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

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
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: safe,
      duration: 650,
      delay,
      easing: Easing.out(Easing.cubic),
      // Width can't run on the native driver.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [safe, delay, progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: color, width }} />
    </View>
  );
}
