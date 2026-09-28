import { Image } from "react-native";

const LEAK_TAP = require("../../../assets/images/illustrations/leak tap.png");

type Props = {
  size?: number;
};

export function LeaksPipeIllustration({ size = 112 }: Props) {
  return (
    <Image
      source={LEAK_TAP}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Leaking tap illustration"
    />
  );
}
