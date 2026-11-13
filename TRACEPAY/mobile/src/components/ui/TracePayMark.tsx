import { Image } from "react-native";
import { useColorScheme } from "nativewind";

import { LOGO } from "../../theme/logo";

type Props = {
  width: number;
  height: number;
  /** Accepted so existing call sites keep working; the logo keeps its own colours. */
  color?: string;
  preserveAspectRatio?: string;
};

/** The TracePay mark (the R with the droplet), in the light or dark version for the theme. */
export function TracePayMark({ width, height }: Props) {
  const { colorScheme } = useColorScheme();
  const art = LOGO[colorScheme === "dark" ? "dark" : "light"];
  return (
    <Image
      accessibilityLabel="TracePay"
      source={art.mark}
      style={{ width, height }}
      resizeMode="contain"
    />
  );
}
