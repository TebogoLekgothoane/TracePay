import { Canvas, LinearGradient, RoundedRect, vec } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { COLORS, withAlpha } from "../../theme/colors";
import type { SkeletonProps } from "./Skeleton.types";

/** Placeholder block with a light sweep across it (non-iOS; iOS uses the SwiftUI skeleton). */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  circle = false,
  onDark = false,
}: SkeletonProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [measured, setMeasured] = useState<number>(typeof width === "number" ? width : 0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [sweep]);

  const base = onDark ? "rgba(255,255,255,0.22)" : withAlpha(palette.mutedForeground, 0.2);
  const shine = onDark ? "rgba(255,255,255,0.45)" : withAlpha(palette.mutedForeground, 0.38);
  const w = measured;
  const corner = circle ? height / 2 : radius;

  const start = useDerivedValue(() => vec(-w + sweep.value * w * 2, 0));
  const end = useDerivedValue(() => vec(sweep.value * w * 2, 0));

  return (
    <View
      style={{ width, height }}
      onLayout={
        typeof width === "number"
          ? undefined
          : (event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)
      }
    >
      {w > 0 ? (
        <Canvas style={{ width: w, height }}>
          <RoundedRect x={0} y={0} width={w} height={height} r={corner}>
            <LinearGradient start={start} end={end} colors={[base, shine, base]} positions={[0, 0.5, 1]} />
          </RoundedRect>
        </Canvas>
      ) : null}
    </View>
  );
}
