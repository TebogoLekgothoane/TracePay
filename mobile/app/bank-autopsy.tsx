import React, { useMemo, useState, useEffect } from "react";
import { View, ScrollView, Pressable } from "react-native";
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
import { fetchBanks, fetchBankAutopsyCauses, fetchBankAutopsyLeaksByCause } from "@/lib/api";
import { getBankLogo } from "@/lib/bank-logos";

export default function BankAutopsyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [causes, setCauses] = useState<AutopsyCause[]>([]);
  const [leaksByCause, setLeaksByCause] = useState<Record<string, LeakTransaction[]>>({});
  const [expandedCauseId, setExpandedCauseId] = useState<string | null>(null);

  const resolvedBankId = bankId ?? banks[0]?.id;

  useEffect(() => {
    setBanksLoading(true);
    fetchBanks()
      .then((data) => setBanks(data ?? []))
      .catch(() => setBanks([]))
      .finally(() => setBanksLoading(false));
  }, []);

  useEffect(() => {
    if (!resolvedBankId) return;
    fetchBankAutopsyCauses(resolvedBankId).then((data) => {
      setCauses(data);
    });
  }, [resolvedBankId]);

  useEffect(() => {
    if (!expandedCauseId) return;
    if (leaksByCause[expandedCauseId]) return;
    fetchBankAutopsyLeaksByCause(expandedCauseId).then((data) => {
      const leaks: LeakTransaction[] = data.map((row) => ({
        ...row,
        tag: row.tag as LeakTransaction["tag"],
      }));
      setLeaksByCause((prev) => ({ ...prev, [expandedCauseId]: leaks }));
    });
  }, [expandedCauseId]);

  const bank = useMemo(() => {
    const found = banks.find((b) => b.id === resolvedBankId);
    return found ?? (banks[0] ?? null);
  }, [banks, resolvedBankId]);

  const expandedLeaks = useMemo<LeakTransaction[]>(() => {
    if (!expandedCauseId) return [];
    return leaksByCause[expandedCauseId] ?? [];
  }, [expandedCauseId, leaksByCause]);

  if (banksLoading || (!bank && banks.length === 0)) {
    return (
      <ThemedView className="bg-bg flex-1 flex-1 justify-center items-center px-6">
        <ThemedText type="body" className="text-text-muted text-center">
          {banksLoading ? "Loading bank…" : "No banks linked yet."}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!bank) {
    return (
      <ThemedView className="bg-bg flex-1 flex-1 justify-center items-center px-6">
        <ThemedText type="body" className="text-text-muted text-center">
          Bank not found.
        </ThemedText>
        <Pressable onPress={() => router.back()} className="mt-4">
          <ThemedText type="button" className="text-primary">Go back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

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
            titleLogo={getBankLogo(bank.name)}
            showBackButton
            onBackPress={() => router.back()}
          />

          <BankSummaryCard bank={bank} logo={getBankLogo(bank.name)} />

          {bank.type === "momo" ? (
            <SavingsOpportunityCard momoSpent={496} bundleCost={350} savings={146} />
          ) : null}

          <AutopsyCauseList
            causes={causes}
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
                Raw leaks for {causes.find((c) => c.id === expandedCauseId)?.title}
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

