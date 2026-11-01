import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

import { withAlpha } from "../../theme/colors";

/** Looping 0↔1 value that drives the pulsing blur on hidden content. */
export function usePulse(): Animated.Value {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const step = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return pulse;
}

/** A soft, slowly pulsing smudge that stands in for hidden text. */
export function Smudge({
  width,
  height,
  color,
  pulse,
}: {
  width: number;
  height: number;
  color: string;
  pulse: Animated.Value;
}) {
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {/* Wide faint halo + tighter core read as a blur without a native blur view. */}
      <Animated.View
        style={{
          position: "absolute",
          left: -4,
          right: -4,
          height: height + 8,
          borderRadius: height,
          backgroundColor: withAlpha(color, 0.1),
          opacity,
        }}
      />
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: withAlpha(color, 0.28),
          opacity,
        }}
      />
    </View>
  );
}
