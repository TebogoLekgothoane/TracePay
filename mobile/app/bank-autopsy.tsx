import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, Alert } from "react-native";
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
import { ScreenHeader } from "@/components/screen-header";
import {
  BankSummaryCardSkeleton,
  Skeleton,
  CauseListItemSkeleton,
  LeakRowSkeleton,
} from "@/components/ui/skeleton";
import { useTheme } from "@/hooks/use-theme-color";
import { fetchBanks, fetchBankAutopsyCauses, fetchBankAutopsyLeaksByCause, removeBank, fetchPartnerRecommendations } from "@/lib/api";
import { getBankLogo } from "@/lib/bank-logos";
import { mobileFreeze, listFrozen } from "@/lib/backend-client";
import { SpendSmarterCard, type SpendSmarterSuggestion } from "@/components/spend-smarter-card";

/** Map autopsy cause id to partner recommendation category */
function causeIdToCategory(causeId: string): string | null {
  const id = causeId.toLowerCase();
  if (id.includes("subscription")) return "subscriptions";
  if (id.includes("fee") || id.includes("bank")) return "banks";
  if (id.includes("telco") || id.includes("airtime") || id.includes("momo")) return "telcos";
  if (id.includes("loan")) return "loans";
  if (id.includes("insurance")) return "insurance";
  return null;
}

export default function BankAutopsyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [causes, setCauses] = useState<AutopsyCause[]>([]);
  const [causesLoading, setCausesLoading] = useState(false);
  const [leaksByCause, setLeaksByCause] = useState<Record<string, LeakTransaction[]>>({});
  const [expandedCauseId, setExpandedCauseId] = useState<string | null>(null);
  const [leaksLoadingCauseId, setLeaksLoadingCauseId] = useState<string | null>(null);
  const [spendSmarterSuggestions, setSpendSmarterSuggestions] = useState<SpendSmarterSuggestion[]>([]);
  /** Backend frozen leak_ids (from GET /mobile/frozen) for showing Frozen state. */
  const [frozenLeakIds, setFrozenLeakIds] = useState<Set<string>>(new Set());

  const resolvedBankId = bankId ?? banks[0]?.id;

  const refreshFrozen = useCallback(async () => {
    try {
      const items = await listFrozen();
      const ids = new Set(
        items
          .map((i) => i.leak_id)
          .filter((id): id is string => id != null)
      );
      setFrozenLeakIds(ids);
    } catch {
      setFrozenLeakIds(new Set());
    }
  }, []);

  useEffect(() => {
    refreshFrozen();
  }, [refreshFrozen]);

  useEffect(() => {
    setBanksLoading(true);
    fetchBanks()
      .then((data) => setBanks(data ?? []))
      .catch(() => setBanks([]))
      .finally(() => setBanksLoading(false));
  }, []);

  useEffect(() => {
    if (!resolvedBankId) return;
    setCausesLoading(true);
    fetchBankAutopsyCauses(resolvedBankId)
      .then((data) => setCauses(data ?? []))
      .catch(() => setCauses([]))
      .finally(() => setCausesLoading(false));
  }, [resolvedBankId]);

  useEffect(() => {
    if (!expandedCauseId) return;
    if (leaksByCause[expandedCauseId] !== undefined) return;
    setLeaksLoadingCauseId(expandedCauseId);
    fetchBankAutopsyLeaksByCause(expandedCauseId)
      .then((data) => {
        const leaks: LeakTransaction[] = data.map((row) => ({
          ...row,
          tag: row.tag as LeakTransaction["tag"],
        }));
        setLeaksByCause((prev) => ({ ...prev, [expandedCauseId]: leaks }));
      })
      .catch(() => setLeaksByCause((prev) => ({ ...prev, [expandedCauseId]: [] })))
      .finally(() => setLeaksLoadingCauseId(null));
  }, [expandedCauseId]);

  useEffect(() => {
    if (causes.length === 0) return;
    fetchPartnerRecommendations()
      .then((recs) => {
        const recsByCategory = new Map<string, (typeof recs)[0]>();
        recs.forEach((r) => {
          if (!recsByCategory.has(r.category)) recsByCategory.set(r.category, r);
        });
        const suggestions: SpendSmarterSuggestion[] = [];
        for (const cause of causes) {
          const category = causeIdToCategory(cause.id);
          if (!category) continue;
          const rec = recsByCategory.get(category);
          if (!rec) continue;
          suggestions.push({
            rec,
            spending: { category, label: cause.title, totalSpent: cause.amount },
          });
          if (suggestions.length >= 2) break;
        }
        setSpendSmarterSuggestions(suggestions);
      })
      .catch(() => setSpendSmarterSuggestions([]));
  }, [causes]);

  const bank = useMemo(() => {
    const found = banks.find((b) => b.id === resolvedBankId);
    return found ?? (banks[0] ?? null);
  }, [banks, resolvedBankId]);

  const expandedLeaks = useMemo<LeakTransaction[]>(() => {
    if (!expandedCauseId) return [];
    return leaksByCause[expandedCauseId] ?? [];
  }, [expandedCauseId, leaksByCause]);

  if (banksLoading) {
    return (
      <ThemedView className="bg-bg flex-1">
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + Spacing.sm,
            paddingBottom: insets.bottom + Spacing["5xl"],
            paddingHorizontal: Spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center mb-4">
            <Skeleton width={24} height={24} style={{ marginRight: 8 }} />
            <Skeleton width={160} height={24} />
          </View>
          <Skeleton width="80%" height={16} style={{ marginBottom: 8 }} />
          <BankSummaryCardSkeleton />
          <Skeleton width="100%" height={48} style={{ marginTop: 12, borderRadius: 12 }} />
          <Skeleton width="60%" height={20} style={{ marginTop: 24 }} />
          <Skeleton width="100%" height={80} style={{ marginTop: 8, borderRadius: 16 }} />
          <Skeleton width="100%" height={80} style={{ marginTop: 8, borderRadius: 16 }} />
          <Skeleton width="100%" height={80} style={{ marginTop: 8, borderRadius: 16 }} />
        </ScrollView>
      </ThemedView>
    );
  }

  if (!bank && banks.length === 0) {
    return (
      <ThemedView className="bg-bg flex-1 flex-1 justify-center items-center px-6">
        <ThemedText type="body" className="text-text-muted text-center">
          No banks linked yet.
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
          <ScreenHeader
            title={bank.name}
            subtitle={`You lost R ${bank.totalLost.toFixed(1)} this month`}
            onBack={() => router.back()}
          />

          <BankSummaryCard bank={bank} logo={getBankLogo(bank.name)} />

          <Pressable
            onPress={() => {
              Alert.alert(
                "Unlink bank",
                `Remove ${bank.name} from your list? This will also remove its autopsy data.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Unlink",
                    style: "destructive",
                    onPress: async () => {
                      const ok = await removeBank(bank.id);
                      if (ok) router.back();
                    },
                  },
                ]
              );
            }}
            className="mt-3 py-3 rounded-xl items-center"
            style={{ backgroundColor: theme.backgroundTertiary }}
          >
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Unlink this bank
            </ThemedText>
          </Pressable>

          {bank.type === "momo" ? (
            <SavingsOpportunityCard momoSpent={496} bundleCost={350} savings={146} />
          ) : null}

          {causesLoading ? (
            <View className="w-full mt-4">
              <Skeleton width={80} height={20} style={{ marginBottom: 12 }} />
              <View className="bg-bg-card rounded-2xl overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    className="border-t border-black/5"
                    style={i === 0 ? { borderTopWidth: 0 } : undefined}
                  >
                    <CauseListItemSkeleton />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <AutopsyCauseList
              causes={causes}
              onSelect={(cause) => {
                setExpandedCauseId((current) => (current === cause.id ? null : cause.id));
              }}
            />
          )}

          {leaksLoadingCauseId ? (
            <View style={{ marginTop: Spacing["2xl"] }}>
              <Skeleton width={180} height={20} style={{ marginBottom: 8 }} />
              <Skeleton width="90%" height={14} style={{ marginBottom: 12 }} />
              <LeakRowSkeleton />
              <LeakRowSkeleton />
              <LeakRowSkeleton />
            </View>
          ) : expandedLeaks.length > 0 ? (
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
                <LeakTransactionRow
                  key={tx.id}
                  transaction={tx}
                  onFreeze={async (transaction) => {
                    try {
                      await mobileFreeze({ leak_id: transaction.id });
                      await refreshFrozen();
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Could not freeze";
                      const isUnauth = msg.includes("401") || msg.toLowerCase().includes("credentials");
                      Alert.alert(
                        isUnauth ? "Sign in to freeze" : "Freeze failed",
                        isUnauth
                          ? "Sign in or create an account so we can save your frozen leaks."
                          : msg
                      );
                    }
                  }}
                  isFrozen={frozenLeakIds.has(tx.id)}
                />
              ))}
            </View>
          ) : null}

          {spendSmarterSuggestions.length > 0 ? (
            <View style={{ marginTop: Spacing["2xl"], marginBottom: Spacing.lg }}>
              <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
                Spend smarter for this bank
              </ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.md, fontSize: 16 }}>
                Based on this bank's leaks, here are cheaper options or better places to buy.
              </ThemedText>
              {spendSmarterSuggestions.map((suggestion) => (
                <SpendSmarterCard
                  key={suggestion.rec.id}
                  suggestion={suggestion}
                  onPress={() => router.push("/reroute-control" as any)}
                />
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

