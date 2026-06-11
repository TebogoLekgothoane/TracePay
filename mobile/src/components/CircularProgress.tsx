import React, { useEffect } from "react";
import { View, Text } from "react-native";
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
  }, [targetProgress, circumference, strokeDashoffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeDashoffset.value,
  }));

  return (
    <View
      className="items-center justify-center relative"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} className="absolute">
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
      <View className="items-center justify-center">
        {label ? (
          <Text className="text-[26px] font-bold text-gray-900 leading-[30px]">{label}</Text>
        ) : null}
        {sublabel ? (
          <Text className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
