import { useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";

import { hunterLogoUrl } from "../../features/accounts/account.constants";
import { resolveBrandIcon } from "../../features/brands/simple-brand-icons";
import { SimpleBrandLogo } from "./SimpleBrandLogo";

const FAVICON_BASE = "https://www.google.com/s2/favicons";

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
  // Hunter first, then the site's own favicon, then the initial.
  const sources = useMemo(() => {
    const domain = logoDomain.trim().toLowerCase();
    const list = [hunterLogoUrl(domain)];
    if (!domain.endsWith(".tracepay")) {
      list.push(`${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=128`);
    }
    return list;
  }, [logoDomain]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const uri = sources[sourceIndex];
  const radius = shape === "circle" ? size / 2 : Math.round(size * 0.35);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

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
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="contain"
          onError={() => setSourceIndex((index) => index + 1)}
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
