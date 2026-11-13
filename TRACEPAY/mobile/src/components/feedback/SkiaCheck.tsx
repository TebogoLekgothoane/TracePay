import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { useEffect } from "react";
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

type Props = {
  size?: number;
  color: string;
  /** Colour of the tick, drawn over the filled circle. */
  tickColor?: string;
};

/** A filled circle that pops in, then a tick that draws itself. Rendered with Skia. */
export function SkiaCheck({ size = 72, color, tickColor = "#FFFFFF" }: Props) {
  const scale = useSharedValue(0.6);
  const draw = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.6)) });
    draw.value = withDelay(180, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [scale, draw]);

  const transform = useDerivedValue(() => [{ scale: scale.value }]);

  const tick = Skia.Path.MakeFromSVGString(
    `M ${size * 0.3} ${size * 0.52} L ${size * 0.44} ${size * 0.66} L ${size * 0.71} ${size * 0.36}`,
  );

  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={size / 2} cy={size / 2} r={(size / 2) * 0.96} color={color} transform={transform} origin={{ x: size / 2, y: size / 2 }} />
      {tick ? (
      <Path
        path={tick}
        style="stroke"
        strokeWidth={size * 0.08}
        strokeCap="round"
        strokeJoin="round"
        color={tickColor}
        start={0}
        end={draw}
      />
      ) : null}
    </Canvas>
  );
}
