import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

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
  /** When provided, shows a Freeze button that calls the backend to freeze this leak. */
  onFreeze?: (transaction: LeakTransaction) => Promise<void>;
  /** When true, shows a "Frozen" state and hides the Freeze button. */
  isFrozen?: boolean;
};

export function LeakTransactionRow({
  transaction,
  onFreeze,
  isFrozen = false,
}: LeakTransactionRowProps) {
  const { theme } = useTheme();
  const [freezing, setFreezing] = useState(false);
  const { day, month } = formatDisplayDate(transaction.date);

  const handleFreeze = async () => {
    if (!onFreeze || freezing || isFrozen) return;
    setFreezing(true);
    try {
      await onFreeze(transaction);
    } finally {
      setFreezing(false);
    }
  };

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

      <View className="items-end gap-1">
        <ThemedText type="body" className="font-semibold text-success">
          {formatAmount(transaction.amount)}
        </ThemedText>
        {onFreeze && (
          isFrozen ? (
            <View className="flex-row items-center gap-1">
              <Feather name="lock" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Frozen</ThemedText>
            </View>
          ) : (
            <Pressable
              onPress={handleFreeze}
              disabled={freezing}
              className="flex-row items-center gap-1 px-2 py-1 rounded"
              style={{ backgroundColor: theme.backgroundTertiary }}
            >
              <Feather name="minus-circle" size={14} color={theme.text} />
              <ThemedText type="small">{freezing ? "…" : "Freeze"}</ThemedText>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}
