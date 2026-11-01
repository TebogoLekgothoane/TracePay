import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  brandHex,
  isDarkBrandColor,
  resolveBrandIcon,
} from "../../features/brands/simple-brand-icons";

type Props = {
  name: string;
  /** Merchant / brand id (e.g. "netflix") or domain (e.g. "netflix.com"). */
  brandId: string;
  size?: number;
  fallbackColor?: string;
  shape?: "circle" | "squircle";
  /** When true, fill the glyph with the brand’s default Simple Icons color. */
  useBrandColor?: boolean;
};

export function SimpleBrandLogo({
  name,
  brandId,
  size = 22,
  fallbackColor = "#94A3B8",
  shape = "circle",
  useBrandColor = true,
}: Props) {
  const icon = resolveBrandIcon(brandId);
  const glyphSize = Math.round(size * 0.85);

  if (!icon) {
    return (
      <View
        className="items-center justify-center"
        style={{ width: size, height: size }}
        accessibilityLabel={`${name} logo`}
      >
        <Text
          style={{
            color: fallbackColor,
            fontSize: Math.max(9, Math.round(size * 0.42)),
            fontWeight: "700",
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
  }

  const fill = useBrandColor ? brandHex(icon) : "#0F172A";
  // Near-black glyphs (Cursor, X, GitHub) disappear on dark cards, so sit them on a light tile.
  const needsTile = useBrandColor && isDarkBrandColor(icon);
  const radius = shape === "circle" ? size / 2 : Math.round(size * 0.35);

  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        ...(needsTile ? { backgroundColor: "#FFFFFF", borderRadius: radius } : null),
      }}
      accessibilityLabel={`${name} logo`}
    >
      <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
        <Path d={icon.path} fill={fill} />
      </Svg>
    </View>
  );
}
