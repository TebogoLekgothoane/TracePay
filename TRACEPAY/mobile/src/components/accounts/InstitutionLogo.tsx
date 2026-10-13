import { Building2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { hunterLogoUrl } from "../../features/accounts/account.constants";
import { withAlpha } from "../../theme/colors";

type Props = {
  name: string;
  logoDomain: string | null;
  color: string;
  size?: number;
  /** Circle for list avatars; rounded square for institution headers. */
  shape?: "circle" | "rounded";
};

function sizeClassName(size: number): string {
  if (size <= 34) return "h-[34px] w-[34px]";
  if (size <= 40) return "h-10 w-10";
  return "h-11 w-11";
}

export function InstitutionLogo({
  name,
  logoDomain,
  color,
  size = 44,
  shape = "circle",
}: Props) {
  const [failed, setFailed] = useState(false);
  const uri = logoDomain ? hunterLogoUrl(logoDomain) : null;
  const showLogo = Boolean(uri) && !failed;
  const iconSize = Math.round(size * 0.42);
  const radiusClass = shape === "rounded" ? "rounded-[10px]" : "rounded-full";

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View
      accessibilityLabel={`${name} logo`}
      className={`items-center justify-center overflow-hidden ${radiusClass} ${sizeClassName(size)}`}
      style={showLogo ? undefined : { backgroundColor: withAlpha(color, 0.16) }}
    >
      {showLogo && uri ? (
        <Image
          className={`h-full w-full ${radiusClass}`}
          resizeMode="contain"
          source={{ uri }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2 color={color} size={iconSize} strokeWidth={2.2} />
      )}
    </View>
  );
}
