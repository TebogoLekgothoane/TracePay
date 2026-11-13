import { Circle, Host, RoundedRectangle } from "@expo/ui/swift-ui";
import {
  animation,
  Animation,
  foregroundStyle,
  frame,
  opacity,
} from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";

import { COLORS, withAlpha } from "../../theme/colors";
import type { SkeletonProps } from "./Skeleton.types";

const PULSE = Animation.easeInOut({ duration: 0.9 }).repeat({
  repeatCount: 10000,
  autoreverses: true,
});

/** SwiftUI placeholder block that pulses while content loads. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  circle = false,
  onDark = false,
}: SkeletonProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [measured, setMeasured] = useState<number | null>(
    typeof width === "number" ? width : null,
  );
  const [dim, setDim] = useState(false);

  useEffect(() => {
    // Flip once after mount so SwiftUI animates between the two opacities.
    const id = requestAnimationFrame(() => setDim(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fill = onDark
    ? "rgba(255,255,255,0.28)"
    : withAlpha(palette.mutedForeground, 0.22);
  const w = measured ?? 0;
  const modifiers = [
    foregroundStyle(fill),
    frame({ width: w, height }),
    opacity(dim ? 0.45 : 1),
    animation(PULSE, dim),
  ];

  return (
    <View
      style={{ width, height }}
      onLayout={
        typeof width === "number"
          ? undefined
          : (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)
      }
    >
      {w > 0 ? (
        <Host
          colorScheme={colorScheme === "dark" ? "dark" : "light"}
          style={{ width: w, height }}
        >
          {circle ? (
            <Circle modifiers={modifiers} />
          ) : (
            <RoundedRectangle cornerRadius={radius} modifiers={modifiers} />
          )}
        </Host>
      ) : null}
    </View>
  );
}
