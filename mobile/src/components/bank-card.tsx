import React from "react";
import { Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { formatZar, getLossStatus } from "@/components/utils/money";

export type BankType = "bank" | "momo";

export type Bank = {
  id: string;
  name: string;
  type: BankType;
  totalLost: number;
};

function statusDotClass(totalLost: number) {
  const status = getLossStatus(totalLost);
  if (status === "high") return "bg-red-500";
  if (status === "medium") return "bg-orange-500";
  return "bg-green-500";
}

export function BankCard({
  bank,
  onPress,
}: {
  bank: Bank;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-blue rounded-2xl px-4 py-4 mr-3 w-44"
    >
      <View className="flex-row items-center justify-between">
        <ThemedText type="h4" className="text-white">
          {bank.name}
        </ThemedText>
        <View className={["h-3 w-3 rounded-full", statusDotClass(bank.totalLost)].join(" ")} />
      </View>
      <ThemedText type="small" className="text-white/80 mt-2">
        Total lost
      </ThemedText>
      <ThemedText type="h3" className="text-white mt-1">
        {formatZar(bank.totalLost)}
      </ThemedText>
    </Pressable>
  );
}

