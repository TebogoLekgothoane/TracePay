import type { LucideIcon } from "lucide-react-native";
import {
  ArrowLeftRight,
  Fuel,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wallet,
} from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";

import { resolveMerchantLogoDomain } from "../../features/transactions/merchant-logos";
import { BrandLogo } from "../ui/BrandLogo";

type CategoryStyle = {
  Icon: LucideIcon;
  tint: string;
  tintBg: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  groceries: { Icon: ShoppingCart, tint: "#16A34A", tintBg: "rgba(22, 163, 74, 0.16)" },
  shopping: { Icon: ShoppingCart, tint: "#2563EB", tintBg: "rgba(37, 99, 235, 0.14)" },
  transport: { Icon: Fuel, tint: "#2563EB", tintBg: "rgba(37, 99, 235, 0.14)" },
  fuel: { Icon: Fuel, tint: "#2563EB", tintBg: "rgba(37, 99, 235, 0.14)" },
  "airtime & data": { Icon: Smartphone, tint: "#CA8A04", tintBg: "rgba(250, 204, 21, 0.28)" },
  airtime: { Icon: Smartphone, tint: "#CA8A04", tintBg: "rgba(250, 204, 21, 0.28)" },
  subscriptions: { Icon: Wallet, tint: "#E50914", tintBg: "rgba(229, 9, 20, 0.14)" },
  "internal transfer": {
    Icon: ArrowLeftRight,
    tint: "#7C3AED",
    tintBg: "rgba(124, 58, 237, 0.14)",
  },
  transfer: {
    Icon: ArrowLeftRight,
    tint: "#7C3AED",
    tintBg: "rgba(124, 58, 237, 0.14)",
  },
  dining: { Icon: Utensils, tint: "#EA580C", tintBg: "rgba(234, 88, 12, 0.14)" },
  food: { Icon: Utensils, tint: "#EA580C", tintBg: "rgba(234, 88, 12, 0.14)" },
};

const DEFAULT_STYLE: CategoryStyle = {
  Icon: Wallet,
  tint: "#6366F1",
  tintBg: "rgba(99, 102, 241, 0.14)",
};

function styleForCategory(category: string | null | undefined): CategoryStyle {
  const key = category?.trim().toLowerCase() ?? "";
  if (!key) return DEFAULT_STYLE;
  return CATEGORY_STYLES[key] ?? DEFAULT_STYLE;
}

type Props = {
  description: string;
  category: string | null;
  size?: number;
};

export function TransactionListIcon({
  description,
  category,
  size = 44,
}: Props) {
  const logoDomain = useMemo(
    () => resolveMerchantLogoDomain(description),
    [description],
  );
  const style = styleForCategory(category);
  const iconSize = Math.round(size * 0.45);

  if (logoDomain) {
    return (
      <BrandLogo
        name={description}
        logoDomain={logoDomain}
        size={size}
        fallbackColor={style.tintBg}
        shape="circle"
      />
    );
  }

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: style.tintBg,
      }}
      accessibilityLabel={`${description} icon`}
    >
      <style.Icon color={style.tint} size={iconSize} strokeWidth={2.2} />
    </View>
  );
}
