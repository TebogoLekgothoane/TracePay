import type { LucideIcon } from "lucide-react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Fuel,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wallet,
} from "lucide-react-native";
import { useMemo } from "react";
import { Text, View } from "react-native";

import {
  looksLikeBankTransfer,
  resolveTransactionLogo,
} from "../../features/transactions/merchant-logos";
import type { TransactionType } from "../../features/transactions/transaction.types";
import { BrandLogo } from "../ui/BrandLogo";

type CategoryStyle = {
  Icon: LucideIcon;
  tint: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  groceries: { Icon: ShoppingCart, tint: "#16A34A" },
  shopping: { Icon: ShoppingCart, tint: "#2563EB" },
  transport: { Icon: Fuel, tint: "#2563EB" },
  fuel: { Icon: Fuel, tint: "#2563EB" },
  "airtime & data": { Icon: Smartphone, tint: "#CA8A04" },
  airtime: { Icon: Smartphone, tint: "#CA8A04" },
  subscriptions: { Icon: Wallet, tint: "#E50914" },
  dining: { Icon: Utensils, tint: "#EA580C" },
  food: { Icon: Utensils, tint: "#EA580C" },
};

const TRANSFER_OUT: CategoryStyle = {
  Icon: ArrowUpRight,
  tint: "#6D3FE0",
};

const TRANSFER_IN: CategoryStyle = {
  Icon: ArrowDownLeft,
  tint: "#0D9488",
};

const TRANSFER_BANK: CategoryStyle = {
  Icon: Building2,
  tint: "#6366F1",
};

const DEFAULT_STYLE: CategoryStyle = {
  Icon: Wallet,
  tint: "#6D3FE0",
};

function styleForTransaction(input: {
  category: string | null | undefined;
  description: string;
  transactionClass: string | null | undefined;
  type: TransactionType | null | undefined;
}): CategoryStyle {
  const isTransfer = looksLikeBankTransfer(
    input.description,
    input.category,
    input.transactionClass,
  );
  if (isTransfer) {
    if (input.type === "credit") return TRANSFER_IN;
    if (input.type === "debit") return TRANSFER_OUT;
    return TRANSFER_BANK;
  }

  const key = input.category?.trim().toLowerCase() ?? "";
  if (!key) return DEFAULT_STYLE;
  return CATEGORY_STYLES[key] ?? DEFAULT_STYLE;
}

type Props = {
  description: string;
  category: string | null;
  merchantName?: string | null;
  transactionClass?: string | null;
  type?: TransactionType | null;
  accountInstitution?: string | null;
  size?: number;
};

export function TransactionListIcon({
  description,
  category,
  merchantName = null,
  transactionClass = null,
  type = null,
  accountInstitution = null,
  size = 44,
}: Props) {
  const resolution = useMemo(
    () =>
      resolveTransactionLogo({
        description,
        merchantName,
        category,
        transactionClass,
        accountInstitution,
        type,
      }),
    [accountInstitution, category, description, merchantName, transactionClass, type],
  );
  const style = styleForTransaction({
    category,
    description,
    transactionClass,
    type,
  });
  const iconSize = Math.round(size * 0.45);

  if (resolution.domain) {
    return (
      <BrandLogo
        name={merchantName?.trim() || description}
        logoDomain={resolution.domain}
        size={size}
        fallbackColor="transparent"
        shape="circle"
      />
    );
  }

  if (resolution.initials) {
    return (
      <View
        className="items-center justify-center overflow-hidden rounded-full"
        style={{ width: size, height: size }}
        accessibilityLabel={`${description} icon`}
      >
        <Text
          style={{
            color: style.tint,
            fontSize: Math.max(11, Math.round(size * 0.32)),
            fontWeight: "700",
          }}
        >
          {resolution.initials}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
      accessibilityLabel={`${description} icon`}
    >
      <style.Icon color={style.tint} size={iconSize} strokeWidth={2.2} />
    </View>
  );
}
