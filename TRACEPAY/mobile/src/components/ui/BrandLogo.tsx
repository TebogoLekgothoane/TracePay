import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { hunterLogoUrl } from "../../features/accounts/account.constants";
import { resolveBrandIcon } from "../../features/brands/simple-brand-icons";
import { SimpleBrandLogo } from "./SimpleBrandLogo";

type Props = {
  name: string;
  logoDomain: string;
  size?: number;
  fallbackColor?: string;
  shape?: "circle" | "squircle";
};

export function BrandLogo({
  name,
  logoDomain,
  size = 22,
  fallbackColor = "#94A3B8",
  shape = "circle",
}: Props) {
  const simpleIcon = resolveBrandIcon(logoDomain);
  if (simpleIcon) {
    return (
      <SimpleBrandLogo
        name={name}
        brandId={logoDomain}
        size={size}
        fallbackColor={fallbackColor}
        shape={shape}
      />
    );
  }

  return (
    <HunterBrandLogo
      name={name}
      logoDomain={logoDomain}
      size={size}
      fallbackColor={fallbackColor}
      shape={shape}
    />
  );
}

function HunterBrandLogo({
  name,
  logoDomain,
  size = 22,
  fallbackColor = "#94A3B8",
  shape = "circle",
}: Props) {
  const [failed, setFailed] = useState(false);
  const uri = hunterLogoUrl(logoDomain);
  const radius = shape === "circle" ? size / 2 : Math.round(size * 0.35);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
      }}
      accessibilityLabel={`${name} logo`}
    >
      {!failed ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          style={{
            color: fallbackColor,
            fontSize: Math.max(9, Math.round(size * 0.42)),
            fontWeight: "700",
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
