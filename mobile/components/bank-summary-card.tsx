import React from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Bank } from "@/components/bank-card";
import { formatZar, getLossStatus } from "@/components/utils/money";

function statusPillClass(totalLost: number) {
  const status = getLossStatus(totalLost);
  if (status === "high") return "bg-red-100";
  if (status === "medium") return "bg-orange-100";
  return "bg-green-100";
}

function statusTextClass(totalLost: number) {
  const status = getLossStatus(totalLost);
  if (status === "high") return "text-red-700";
  if (status === "medium") return "text-orange-700";
  return "text-green-700";
}

export function BankSummaryCard({ bank }: { bank: Bank }) {
  return (
    <View className="w-full rounded-2xl bg-bg-card px-5 py-5">
      <View className="flex-row items-center justify-between">
        <ThemedText type="h2" className="text-text">
          {bank.name}
        </ThemedText>
        <View className={["px-3 py-1 rounded-full", statusPillClass(bank.totalLost)].join(" ")}>
          <ThemedText type="small" className={statusTextClass(bank.totalLost)}>
            {getLossStatus(bank.totalLost).toUpperCase()}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="body" className="text-text-muted mt-3">
        You lost {formatZar(bank.totalLost)} this month
      </ThemedText>
    </View>
  );
}

