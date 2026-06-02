import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedProps,
  Easing,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

export default function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 10,
  color = "#7C3AED",
  trackColor = "#E5E7EB",
  label,
  sublabel,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const targetProgress = Math.min(value / max, 1);

  const strokeDashoffset = useSharedValue(circumference);

  useEffect(() => {
    strokeDashoffset.value = withTiming(
      circumference - targetProgress * circumference,
      { duration: 1200, easing: Easing.out(Easing.cubic) }
    );
  }, [targetProgress, circumference]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeDashoffset.value,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", position: "relative" },
  svg: { position: "absolute" },
  labelContainer: { alignItems: "center", justifyContent: "center" },
  label: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    lineHeight: 30,
  },
  sublabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
