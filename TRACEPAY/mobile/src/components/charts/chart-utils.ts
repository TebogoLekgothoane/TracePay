import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";

/** Measured width of a chart container, so SVG draws at real pixels. */
export function useChartWidth(initial = 0) {
  const [width, setWidth] = useState(initial);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);
  return { width, onLayout };
}

/** Round a maximum up to a tidy axis ceiling: 1 840 -> 2 000, 76 -> 80. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Compact axis label in rand: 1500 -> "R1.5k", 800 -> "R800". */
export function formatAxisRand(value: number): string {
  if (value >= 1_000_000) return `R${trimZero(value / 1_000_000)}m`;
  if (value >= 1_000) return `R${trimZero(value / 1_000)}k`;
  return `R${Math.round(value)}`;
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Whole-rand amount for readouts, e.g. "R1 234". */
export function formatRandWhole(value: number): string {
  return `R${Math.round(value).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
