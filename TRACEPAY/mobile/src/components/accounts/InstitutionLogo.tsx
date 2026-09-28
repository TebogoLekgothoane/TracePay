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
};

export function InstitutionLogo({
  name,
  logoDomain,
  color,
  size = 44,
}: Props) {
  const [failed, setFailed] = useState(false);
  const uri = logoDomain ? hunterLogoUrl(logoDomain) : null;
  const showLogo = Boolean(uri) && !failed;
  const iconSize = Math.round(size * 0.42);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: showLogo ? "transparent" : withAlpha(color, 0.16),
      }}
      accessibilityLabel={`${name} logo`}
    >
      {showLogo && uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Building2 color={color} size={iconSize} strokeWidth={2.2} />
      )}
    </View>
  );
}
