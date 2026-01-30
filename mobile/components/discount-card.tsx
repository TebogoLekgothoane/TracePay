import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { Colors } from "@/constants/theme";
import type { UserDiscount } from "@/types/discount";

const NAVY = "#1e40af";

function formatExpiry(expiresAt?: string): string {
  if (!expiresAt) return "No expiry";
  const d = new Date(expiresAt);
  return `Expires ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function DiscountCard({
  discount,
  onCopyCode,
}: {
  discount: UserDiscount;
  onCopyCode?: (code: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (discount.code) {
      if (onCopyCode) onCopyCode(discount.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View
      className="w-full rounded-2xl px-4 py-4 mb-3"
      style={{
        backgroundColor: theme.backgroundDefault,
        borderLeftWidth: 4,
        borderLeftColor: NAVY,
      }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-2">
          <ThemedText type="h4" className="text-text">
            {discount.retailer}
          </ThemedText>
          <ThemedText type="body" className="mt-0.5" style={{ color: theme.textSecondary }}>
            {discount.title}
          </ThemedText>
        </View>
        <View
          className="px-2 py-1 rounded-lg"
          style={{ backgroundColor: NAVY + "20" }}
        >
          <ThemedText type="small" style={{ color: NAVY, fontWeight: "600" }}>
            {discount.discountValue}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" className="mt-2" style={{ color: theme.textSecondary }}>
        {discount.description}
      </ThemedText>
      <ThemedText type="small" className="mt-1" style={{ color: theme.textSecondary }}>
        {discount.earnedFrom}
      </ThemedText>
      {discount.expiresAt ? (
        <ThemedText type="small" className="mt-0.5" style={{ color: theme.textSecondary }}>
          {formatExpiry(discount.expiresAt)}
        </ThemedText>
      ) : null}
      {discount.code ? (
        <Pressable
          onPress={handleCopy}
          className="mt-3 flex-row items-center rounded-lg py-2 px-3 self-start"
          style={{ backgroundColor: theme.backgroundTertiary }}
        >
          <Feather
            name={copied ? "check" : "copy"}
            size={16}
            color={isDark ? Colors.dark.success : Colors.light.success}
          />
          <ThemedText type="small" className="ml-2 font-mono">
            {copied ? "Copied!" : discount.code}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}
