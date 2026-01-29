import React from "react";
import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { TagPill, type TagPillVariant } from "@/components/tag-pill";

export type LeakTransaction = {
  id: string;
  date: string;
  merchant: string;
  description: string;
  channel: string;
  tag: TagPillVariant;
  amount: number;
};

function formatDisplayDate(value: string) {
  const date = new Date(value);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return { day, month };
}

function formatAmount(amount: number) {
  return `+R ${amount.toFixed(2)}`;
}

type LeakTransactionRowProps = {
  transaction: LeakTransaction;
};

export function LeakTransactionRow({ transaction }: LeakTransactionRowProps) {
  const { theme } = useTheme();
  const { day, month } = formatDisplayDate(transaction.date);

  return (
    <View
      className="flex-row items-center rounded-xl border border-border px-4 py-3 mb-1"
      style={{
        borderColor: theme.backgroundTertiary,
        backgroundColor: theme.backgroundDefault,
      }}
    >
      <View className="w-[52px] items-start">
        <ThemedText type="small" className="text-xs mt-0" style={{ color: theme.textSecondary }}>
          {month}
        </ThemedText>
        <ThemedText type="h3" className="mt-0.5">
          {day}
        </ThemedText>
      </View>

      <View className="flex-1 px-3">
        <View className="flex-row items-center justify-between">
          <ThemedText type="body" className="flex-1 mr-2">
            {transaction.description}
          </ThemedText>
          <TagPill variant={transaction.tag} />
        </View>
        <ThemedText type="small" className="mt-1" style={{ color: theme.textSecondary }}>
          {transaction.merchant} • {transaction.channel}
        </ThemedText>
      </View>

      <View className="items-end">
        <ThemedText type="body" className="font-semibold text-success">
          {formatAmount(transaction.amount)}
        </ThemedText>
      </View>
    </View>
  );
}
