import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { OverallLossCard } from "@/components/overall-loss-card";
import { BankSelector } from "@/components/bank-selector";
import type { Bank } from "@/components/bank-card";
import { Spacing } from "@/constants/theme";

const MOCK_BANKS: Bank[] = [
  { id: "capitec", name: "Capitec", type: "bank", totalLost: 1193.5 },
  { id: "standard-bank", name: "Standard Bank", type: "bank", totalLost: 530.2 },
  { id: "mtn-momo", name: "MTN MoMo", type: "momo", totalLost: 496.0 },
];

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const totalLost = MOCK_BANKS.reduce((sum, b) => sum + b.totalLost, 0);

  return (
    <ThemedView className="bg-bg flex-1">
      <View
        style={{
          paddingTop: insets.top + Spacing["5xl"],
          paddingBottom: insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
          gap: Spacing["3xl"],
        }}
      >
        <OverallLossCard totalLost={totalLost} period="This Month" />

        <BankSelector
          banks={MOCK_BANKS}
          onSelect={(bank) =>
            router.push({ pathname: "/bank-autopsy" as any, params: { bankId: bank.id } } as any)
          }
        />
      </View>
    </ThemedView>
  );
}

