import React from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { formatZar } from "@/components/utils/money";

export function SavingsOpportunityCard({
  momoSpent,
  bundleCost,
  savings,
}: {
  momoSpent: number;
  bundleCost: number;
  savings: number;
}) {
  return (
    <View className="w-full rounded-2xl bg-bg-card px-5 py-5 mt-4">
      <ThemedText type="h3" className="text-text">
        Savings opportunity
      </ThemedText>
      <ThemedText type="body" className="text-text-muted mt-3">
        You spent {formatZar(momoSpent)} on airtime & data using MoMo.
      </ThemedText>
      <ThemedText type="body" className="text-text-muted mt-2">
        Bundles would have cost {formatZar(bundleCost)}.
      </ThemedText>
      <ThemedText type="h4" className="text-text mt-3">
        You could have saved {formatZar(savings)}.
      </ThemedText>
    </View>
  );
}

