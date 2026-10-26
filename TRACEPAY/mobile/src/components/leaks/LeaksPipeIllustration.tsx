import { Image } from "react-native";

const LEAK_TAP = require("../../../assets/images/illustrations/leak tap.png");

// Source artwork is 465x640.
const ASPECT = 465 / 640;

type Props = {
  /** Rendered height; width follows the artwork's aspect ratio. */
  size?: number;
};

export function LeaksPipeIllustration({ size = 112 }: Props) {
  return (
    <Image
      source={LEAK_TAP}
      style={{ width: size * ASPECT, height: size }}
      resizeMode="contain"
      accessibilityLabel="Leaking tap illustration"
    />
  );
}
