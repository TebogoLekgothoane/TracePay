import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedProps,
  Easing,
} from "react-native-reanimated";

import { AppText } from "@/components/Typography";

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
  const center = size / 2;

  const strokeDashoffset = useSharedValue(circumference);

  useEffect(() => {
    strokeDashoffset.value = withTiming(
      circumference - targetProgress * circumference,
      { duration: 1200, easing: Easing.out(Easing.cubic) },
    );
  }, [targetProgress, circumference, strokeDashoffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeDashoffset.value,
  }));

  const labelSize = Math.round(size * 0.26);
  const sublabelSize = Math.max(9, Math.round(size * 0.1));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      <View style={StyleSheet.absoluteFill} className="items-center justify-center px-2">
        {label ? (
          <AppText
            className="font-bold text-foreground"
            style={{ fontSize: labelSize, lineHeight: labelSize + 2 }}
          >
            {label}
          </AppText>
        ) : null}
        {sublabel ? (
          <AppText
            variant="caption"
            className="mt-0.5 text-center font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ fontSize: sublabelSize, lineHeight: sublabelSize + 2 }}
          >
            {sublabel}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
