import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { useColorScheme } from "@/hooks/useColorScheme";
import { CATEGORY_ICONS } from "@/constants/category-icons";
import { resolveTransactionLogo } from "@/lib/merchant-logos";
import { cn } from "@/lib/cn";
import { ParsedTransaction } from "@/services/sms/sms.types";

type TransactionIconProps = {
  tx: ParsedTransaction;
  size?: number;
  className?: string;
};

export function TransactionIcon({ tx, size = 40, className }: TransactionIconProps) {
  const { colors } = useColorScheme();
  const [imageFailed, setImageFailed] = useState(false);

  const source = useMemo(() => resolveTransactionLogo(tx), [tx]);
  const iconSize = Math.round(size * 0.45);
  const showImage = source.kind === "hunter" && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [tx.id, source.kind === "hunter" ? source.uri : null]);

  const iconName =
    source.kind === "icon" ? source.name : CATEGORY_ICONS[tx.category];
  const iconColor = colors.mutedForeground;

  return (
    <View
      className={cn(
        "items-center justify-center overflow-hidden rounded-xl",
        !showImage && "bg-muted dark:bg-white/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <Image
          source={{ uri: source.uri }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          contentFit="contain"
          cachePolicy="disk"
          recyclingKey={source.domain}
          onError={() => setImageFailed(true)}
          accessibilityLabel={tx.merchant ?? tx.bank}
        />
      ) : (
        <MaterialCommunityIcons name={iconName as any} size={iconSize} color={iconColor} />
      )}
    </View>
  );
}
