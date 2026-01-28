import React, { useMemo } from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import { SavingsOpportunityCard } from "@/components/savings-opportunity-card";
import { AutopsyCauseList, type AutopsyCause } from "@/components/autopsy-cause-list";
import type { Bank } from "@/components/bank-card";
import { Spacing } from "@/constants/theme";

const MOCK_BANKS: Bank[] = [
  { id: "capitec", name: "Capitec", type: "bank", totalLost: 1193.5 },
  { id: "standard-bank", name: "Standard Bank", type: "bank", totalLost: 530.2 },
  { id: "mtn-momo", name: "MTN MoMo", type: "momo", totalLost: 496.0 },
];

const MOCK_CAUSES: AutopsyCause[] = [
  { id: "hidden-fees", title: "Hidden Fees", amount: 320, percentOfIncome: 4.2 },
  { id: "mashonisa", title: "Mashonisa Interest", amount: 780, percentOfIncome: 10.3 },
  { id: "airtime", title: "Airtime Drains", amount: 210, percentOfIncome: 2.8 },
];

export default function BankAutopsyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();

  const bank = useMemo(() => {
    const found = MOCK_BANKS.find((b) => b.id === bankId);
    return found ?? MOCK_BANKS[0];
  }, [bankId]);

  return (
    <ThemedView className="bg-bg flex-1">
      <View
        style={{
          paddingTop: insets.top + Spacing["5xl"],
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
      >
        <BankSummaryCard bank={bank} />

        {bank.type === "momo" ? (
          <SavingsOpportunityCard momoSpent={496} bundleCost={350} savings={146} />
        ) : null}

        <AutopsyCauseList causes={MOCK_CAUSES} onSelect={() => {}} />
      </View>

      <Pressable
        onPress={() =>
          router.push({ pathname: "/voice-modal" as any, params: { bankId: bank.id } } as any)
        }
        className="absolute right-5 bg-blue rounded-full px-5 py-3 flex-row items-center"
        style={{ bottom: insets.bottom + 18 }}
      >
        <Feather name="mic" size={18} color="#FFFFFF" />
        <View style={{ width: 10 }} />
        <ThemedText type="button" className="text-white">
          Mamela imali yam
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

