import { LinearGradient } from "expo-linear-gradient";
import type { ComponentType } from "react";
import { View } from "react-native";
import type { SvgProps } from "react-native-svg";

import DropletSvg from "../../../assets/icons/droplet-mono.svg";
import MonoIcon from "../../../assets/icons/tracepay-icon-mono.svg";
import PaySvg from "../../../assets/wordmark/pay-mono.svg";
import { MaskedView } from "./MaskedView";

type Size = { width: number; height: number };

// The summary card's purple → blue, deepened with darker violet and navy tones
// and without the card's magenta middle stop (it reads as pink at logo size).
const LOGO_GRADIENT = ["#6D3FE0", "#4A3CC8", "#1F3C9E"] as const;

/**
 * Paints a single-colour SVG with the same gradient as the home summary card,
 * by using the SVG as a mask over the gradient.
 */
function gradientSvg(Svg: ComponentType<SvgProps>) {
  return function GradientSvg({ width: w, height: h, ...rest }: SvgProps) {
    const { width, height }: Size = { width: Number(w), height: Number(h) };
    return (
      <MaskedView
        style={{ width, height }}
        maskElement={
          <View style={{ width, height, backgroundColor: "transparent" }}>
            <Svg width={width} height={height} color="#000" {...rest} />
          </View>
        }
      >
        <LinearGradient
          colors={[...LOGO_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width, height }}
        />
      </MaskedView>
    );
  };
}

/** The TracePay mark, filled with the app's summary-card gradient. */
export const TracePayMark = gradientSvg(MonoIcon);
export const TracePayPayWordmark = gradientSvg(PaySvg);
export const TracePayDroplet = gradientSvg(DropletSvg);
