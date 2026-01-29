import React, { useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import { SavingsOpportunityCard } from "@/components/savings-opportunity-card";
import { AutopsyCauseList, type AutopsyCause } from "@/components/autopsy-cause-list";
import type { Bank } from "@/components/bank-card";
import { IconLabelButton } from "@/components/icon-label-button";
import { FloatingButton } from "@/components/floating-button";
import { LeakTransactionRow, type LeakTransaction } from "@/components/leak-transaction-row";
import { Spacing } from "@/constants/theme";
import { AppHeader } from "@/components/app-header";
import { useTheme } from "@/hooks/use-theme-color";

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

type LeakDataset = Record<string, LeakTransaction[]>;

const LEAKS_BY_CAUSE: LeakDataset = {
  "hidden-fees": [
    {
      id: "hf-1",
      date: "2026-01-12",
      merchant: "Bank A",
      description: "Withdrawal Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 2.5,
    },
    {
      id: "hf-2",
      date: "2026-01-07",
      merchant: "Bank A",
      description: "SMS Notification Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 1.2,
    },
    {
      id: "hf-3",
      date: "2026-01-02",
      merchant: "Bank A",
      description: "Monthly Service Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 5.5,
    },
  ],
  mashonisa: [
    {
      id: "ms-1",
      date: "2025-12-30",
      merchant: "Informal",
      description: "Mr Dlamini Repayment",
      channel: "loan",
      tag: "loan_shark",
      amount: 1500,
    },
  ],
  airtime: [
    {
      id: "at-1",
      date: "2026-01-26",
      merchant: "Telco B",
      description: "Airtime Bundle",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 29,
    },
    {
      id: "at-2",
      date: "2026-01-25",
      merchant: "Telco B",
      description: "Data Bundle",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 5,
    },
    {
      id: "at-3",
      date: "2026-01-24",
      merchant: "Telco B",
      description: "WASP Subscription - Games",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 12,
    },
    {
      id: "at-4",
      date: "2026-01-17",
      merchant: "Telco B",
      description: "Airtime Advance Repayment",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 50,
    },
  ],
};

export default function BankAutopsyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();
  const [expandedCauseId, setExpandedCauseId] = useState<string | null>(null);

  const bank = useMemo(() => {
    const found = MOCK_BANKS.find((b) => b.id === bankId);
    return found ?? MOCK_BANKS[0];
  }, [bankId]);

  const expandedLeaks = useMemo<LeakTransaction[]>(() => {
    if (!expandedCauseId) return [];
    return LEAKS_BY_CAUSE[expandedCauseId] ?? [];
  }, [expandedCauseId]);

  return (
    <ThemedView className="bg-bg flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
      >
        <View>
          <AppHeader
            title={bank.name}
            subtitle={`You lost R ${bank.totalLost.toFixed(1)} this month`}
            showBackButton
            onBackPress={() => router.back()}
          />

          <BankSummaryCard bank={bank} />

          {bank.type === "momo" ? (
            <SavingsOpportunityCard momoSpent={496} bundleCost={350} savings={146} />
          ) : null}

          <AutopsyCauseList
            causes={MOCK_CAUSES}
            onSelect={(cause) => {
              setExpandedCauseId((current) => (current === cause.id ? null : cause.id));
            }}
          />

          {expandedLeaks.length > 0 ? (
            <View
              style={{
                marginTop: Spacing["2xl"],
              }}
            >
              <ThemedText type="h3" className="text-text mb-2">
                Raw leaks for {MOCK_CAUSES.find((c) => c.id === expandedCauseId)?.title}
              </ThemedText>
              <ThemedText type="small" className="text-text-muted mb-3">
                Raw transaction data with forensic flags for {bank.name}.
              </ThemedText>

              {expandedLeaks.map((tx) => (
                <LeakTransactionRow key={tx.id} transaction={tx} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <FloatingButton bottomOffset={18} rightOffset={Spacing.lg}>
        <IconLabelButton
          icon="mic"
          label="Mamela imali yam"
          onPress={() =>
            router.push({ pathname: "/voicemodal" as any, params: { bankId: bank.id } } as any)
          }
        />
      </FloatingButton>
    </ThemedView>
  );
}

