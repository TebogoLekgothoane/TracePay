import React from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { formatZar } from "@/components/utils/money";

export function OverallLossCard({
  totalLost,
  period,
}: {
  totalLost: number;
  period: string;
}) {
  return (
    <View className="w-full rounded-2xl bg-red-600 px-5 py-5">
      <ThemedText type="small" className="text-white/90">
        {period}
      </ThemedText>
      <ThemedText type="h2" className="text-white mt-2">
        You lost
      </ThemedText>
      <ThemedText
        type="hero"
        className="text-white mt-1"
        style={{ fontSize: 38, lineHeight: 44 }}
      >
        {formatZar(totalLost)}
      </ThemedText>
      <ThemedText type="body" className="text-white/90 mt-2">
        this month
      </ThemedText>
    </View>
  );
}

