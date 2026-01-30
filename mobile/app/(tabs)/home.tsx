import React, { useMemo, useState, useCallback } from "react";
import { ScrollView, View, Pressable, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import { DiscountCard } from "@/components/discount-card";
import type { Bank } from "@/components/bank-card";
import type { UserDiscount } from "@/types/discount";
import { AppHeader } from "@/components/app-header";
import { DiscountCardSkeleton, BankSummaryCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import {
  fetchBanks,
  removeBank,
  fetchPartnerRecommendations,
  fetchSpendingSummaryForReroute,
} from "@/lib/api";
import { getDiscountsForUser } from "@/lib/discounts";
import { getBankLogo } from "@/lib/bank-logos";
import { SpendSmarterCard, type SpendSmarterSuggestion } from "@/components/spend-smarter-card";
import { Spacing } from "@/constants/theme";
import { DEMO_USER_ID } from "@/lib/supabase";

const NAVY = "#1e40af";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, t, analysisData, userId } = useApp();
  const { theme } = useTheme();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [spendSmarterSuggestions, setSpendSmarterSuggestions] = useState<SpendSmarterSuggestion[]>([]);
  const [spendSmarterLoading, setSpendSmarterLoading] = useState(true);

  const summaryText =
    analysisData?.summary[(language as "en" | "xh") ?? "en"] || analysisData?.summary?.en || "";

  useFocusEffect(
    useCallback(() => {
      if (!summaryText) return;
      const langCode = language === "xh" ? "xh-ZA" : "en-ZA";
      const play = () => {
        Speech.speak(summaryText, {
          language: langCode,
          rate: 0.9,
          onDone: () => {},
          onStopped: () => {},
          onError: () => {},
        });
      };
      const t = setTimeout(play, 100);
      return () => {
        clearTimeout(t);
        // Do not stop speech on blur so audio continues when user navigates to other screens
      };
    }, [summaryText, language])
  );

  const loadBanks = useCallback(() => {
    setBanksLoading(true);
    fetchBanks()
      .then((data) => setBanks(data ?? []))
      .catch(() => setBanks([]))
      .finally(() => setBanksLoading(false));
  }, []);

  const handleUnlinkBank = useCallback(
    (bank: Bank) => {
      Alert.alert(
        "Unlink bank",
        `Remove ${bank.name} from your list? This will also remove its autopsy data.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unlink",
            style: "destructive",
            onPress: async () => {
              setUnlinkingId(bank.id);
              try {
                const ok = await removeBank(bank.id);
                if (ok) {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  loadBanks();
                }
              } finally {
                setUnlinkingId(null);
              }
            },
          },
        ]
      );
    },
    [loadBanks]
  );

  useFocusEffect(
    useCallback(() => {
      loadBanks();
    }, [loadBanks])
  );

  const effectiveUserId = userId || DEMO_USER_ID;

  useFocusEffect(
    useCallback(() => {
      setSpendSmarterLoading(true);
      Promise.all([
        fetchPartnerRecommendations(),
        fetchSpendingSummaryForReroute(effectiveUserId),
      ])
        .then(([recs, spendingByCategory]) => {
          const spendingByCat = new Map(spendingByCategory.map((s) => [s.category, s]));
          const suggestions: SpendSmarterSuggestion[] = recs
            .map((rec) => {
              const spending = spendingByCat.get(rec.category);
              return spending && spending.totalSpent > 0 ? { rec, spending } : null;
            })
            .filter((s): s is SpendSmarterSuggestion => s != null)
            .filter((s) => s.rec.category === "telcos")
            .slice(0, 1);
          setSpendSmarterSuggestions(suggestions);
        })
        .catch(() => setSpendSmarterSuggestions([]))
        .finally(() => setSpendSmarterLoading(false));
    }, [effectiveUserId])
  );

  const totalLost = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.totalLost, 0),
    [banks]
  );

  const totalLossFromAnalysis = analysisData?.totalLoss ?? totalLost;

  const [discounts, setDiscounts] = useState<UserDiscount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setDiscountsLoading(true);
      getDiscountsForUser()
        .then(setDiscounts)
        .catch(() => setDiscounts([]))
        .finally(() => setDiscountsLoading(false));
    }, [])
  );

  const handleCopyDiscountCode = (code: string) => {
    Share.share({ message: code, title: "Promo code" }).catch(() => {});
  };

  const handleVoicePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const langCode = language === "xh" ? "xh-ZA" : "en-ZA";
    const isXh = language === "xh";

    let textToSpeak: string;
    if (totalLossFromAnalysis > 0 && summaryText) {
      if (isXh) {
        textToSpeak = `Ulahlekelwe yi R ${totalLossFromAnalysis.toLocaleString()} kule nyanga. ${summaryText}`;
      } else {
        textToSpeak = `You lost R ${totalLossFromAnalysis.toLocaleString()} this month. ${summaryText}`;
      }
    } else if (totalLossFromAnalysis > 0) {
      if (isXh) {
        textToSpeak = `Ulahlekelwe yi R ${totalLossFromAnalysis.toLocaleString()} kule nyanga. Nceda uqhagamshelle ii-akhawunti uze ubenze uhlolo ukuze ube nokuziva ngokungcono.`;
      } else {
        textToSpeak = `You lost R ${totalLossFromAnalysis.toLocaleString()} this month. Link accounts and run an autopsy to hear what you could save.`;
      }
    } else if (summaryText) {
      textToSpeak = summaryText;
    } else {
      if (isXh) {
        textToSpeak = "Akukho datha ye-autopsy. Nceda uqhagamshelle ii-akhawunti uze ubenze uhlolo.";
      } else {
        textToSpeak = "No autopsy data yet. Link accounts and run an autopsy to hear how much you could save.";
      }
    }

    Speech.speak(textToSpeak, {
      language: langCode,
      rate: 0.9,
      onDone: () => {},
      onStopped: () => {},
      onError: () => {},
    });
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View style={{ paddingHorizontal: Spacing.lg }}>
          <AppHeader
            title="Where your money died"
            subtitle="See all your money leaks per bank. Tap a bank to see the autopsy."
            className="mb-6"
            rightAccessory={
              <Pressable
                onPress={handleVoicePress}
                style={{
                  padding: Spacing.sm,
                  borderRadius: 9999,
                  backgroundColor: NAVY + "18",
                }}
              >
                <Feather name="mic" size={22} color={NAVY} />
              </Pressable>
            }
          />

          {/* Monthly loss summary – prominent */}
          <View
            style={{
              marginBottom: Spacing["2xl"],
              borderRadius: 18,
              padding: Spacing.lg,
              backgroundColor: NAVY + "0c",
              borderWidth: 1,
              borderColor: NAVY + "28",
            }}
          >
            <ThemedText
              type="body"
              style={{
                color: NAVY,
                marginBottom: Spacing.sm,
                fontSize: 15,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Total lost this month
            </ThemedText>
            {banksLoading ? (
              <Skeleton width={140} height={40} style={{ marginTop: 4 }} />
            ) : (
              <ThemedText
                type="h1"
                style={{
                  color: theme.text,
                  fontSize: 36,
                  fontWeight: "700",
                  letterSpacing: -0.5,
                }}
              >
                R{(totalLossFromAnalysis ?? totalLost).toLocaleString()}
              </ThemedText>
            )}
          </View>

          {/* Spend smarter – cheaper alternatives based on spending */}
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              Spend smarter
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.md, fontSize: 16, lineHeight: 22 }}>
              {spendSmarterSuggestions.length > 0
                ? "We see where you're spending – here are cheaper options or better places to buy."
                : "We'll suggest cheaper places to buy when we see your spending. Link accounts and run an autopsy to get personalised tips."}
            </ThemedText>
            {spendSmarterLoading ? (
              <View style={{ gap: Spacing.md }}>
                <Skeleton width="100%" height={120} style={{ borderRadius: 12 }} />
                <Skeleton width="100%" height={120} style={{ borderRadius: 12 }} />
              </View>
            ) : spendSmarterSuggestions.length > 0 ? (
              spendSmarterSuggestions.map((suggestion) => (
                <SpendSmarterCard
                  key={suggestion.rec.id}
                  suggestion={suggestion}
                  onPress={() => router.push("/reroute-control" as any)}
                />
              ))
            ) : (
              <Pressable
                onPress={() => router.push("/actions" as any)}
                style={({ pressed }) => ({
                  padding: Spacing.lg,
                  borderRadius: 12,
                  backgroundColor: NAVY + "0c",
                  borderWidth: 1,
                  borderColor: NAVY + "28",
                  borderLeftWidth: 4,
                  borderLeftColor: NAVY,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", marginBottom: 4 }}>
                  Get personalised spend-smarter tips
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                  Run an autopsy and link accounts so we can suggest cheaper options for what you buy.
                </ThemedText>
                <ThemedText type="small" style={{ color: NAVY, fontWeight: "600" }}>
                  Go to Actions →
                </ThemedText>
              </Pressable>
            )}
          </View>

          {/* Your rewards – discounts from retailers (from DB) */}
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              Your rewards
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.md, fontSize: 16 }}>
              Discounts from partners – use the app more to unlock more.
            </ThemedText>
            {discountsLoading ? (
              <View className="py-1">
                <DiscountCardSkeleton />
                <DiscountCardSkeleton />
              </View>
            ) : discounts.length === 0 ? (
              <ThemedText type="body" className="text-text-muted py-4">
                No rewards yet. Check back soon or use the app more to unlock.
              </ThemedText>
            ) : (
              discounts.slice(0, 2).map((d) => (
                <DiscountCard
                  key={d.id}
                  discount={d}
                  onCopyCode={handleCopyDiscountCode}
                />
              ))
            )}
          </View>

          {/* Banks list (from DB) */}
          <View className="mb-4 space-y-3">
            {banksLoading ? (
              <View className="space-y-3">
                <BankSummaryCardSkeleton />
                <BankSummaryCardSkeleton />
                <BankSummaryCardSkeleton />
              </View>
            ) : banks.length === 0 ? (
              <ThemedText type="body" style={{ color: theme.textSecondary, paddingVertical: Spacing["2xl"], fontSize: 16 }}>
                No banks linked yet.
              </ThemedText>
            ) : null}
            {!banksLoading &&
              banks.map((bank) => (
              <View key={bank.id} style={{ marginBottom: Spacing.md }}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/bank-autopsy" as any, params: { bankId: bank.id } } as any)
                  }
                  onLongPress={() => handleUnlinkBank(bank)}
                  delayLongPress={400}
                >
                  <BankSummaryCard bank={bank} logo={getBankLogo(bank.name)} />
                </Pressable>
                <Pressable
                  onPress={() => handleUnlinkBank(bank)}
                  style={{
                    position: "absolute",
                    bottom: Spacing.md,
                    right: Spacing.md,
                    padding: Spacing.sm,
                    borderRadius: 9999,
                    backgroundColor: theme.backgroundTertiary,
                  }}
                  disabled={unlinkingId === bank.id}
                >
                  <Feather name="trash-2" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            ))}

            {!banksLoading ? (
            <Pressable
              className="mt-1 rounded-full border border-border bg-bg-card py-3 items-center"
              style={{ borderColor: NAVY + "40" }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/add-account" as any);
              }}
            >
              <ThemedText type="button" style={{ color: NAVY, fontSize: 16, fontWeight: "600" }}>
                + Add Account
              </ThemedText>
            </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

