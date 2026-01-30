import React, { useEffect, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AccountCard, type AccountAutopsy } from "@/components/account-card";
import type { CategoryId } from "@/components/category-card";
import { EmptyState } from "@/components/empty-state";
import { SpendSmarterCard, type SpendSmarterSuggestion } from "@/components/spend-smarter-card";
import { AccountCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Spacing } from "@/constants/theme";
import { formatZar } from "@/components/utils/money";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { fetchCategoryAccounts, fetchPartnerRecommendations } from "@/lib/api";
import { getBankLogo } from "@/lib/bank-logos";

const CATEGORY_TITLES: Record<CategoryId, string> = {
  banks: "Banks",
  telcos: "Telcos / Mobile Wallets",
  loans: "Loans & Credit",
  insurance: "Insurance",
  subscriptions: "Subscriptions / Other",
};

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: CategoryId }>();
  const categoryId: CategoryId = (params.category as CategoryId) ?? "banks";
  const { userId } = useApp();
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState<AccountAutopsy[]>([]);
  const [loading, setLoading] = useState(true);
  const [spendSmarterSuggestions, setSpendSmarterSuggestions] = useState<SpendSmarterSuggestion[]>([]);

  useEffect(() => {
    setLoading(true);
    fetchCategoryAccounts(userId, categoryId)
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [userId, categoryId]);

  useEffect(() => {
    const totalLost = accounts.reduce((sum, a) => sum + a.spent, 0);
    fetchPartnerRecommendations(categoryId)
      .then((recs) => {
        const spending = {
          category: categoryId,
          label: CATEGORY_TITLES[categoryId],
          totalSpent: totalLost,
        };
        setSpendSmarterSuggestions(recs.slice(0, 2).map((rec) => ({ rec, spending })));
      })
      .catch(() => setSpendSmarterSuggestions([]));
  }, [categoryId, accounts]);

  const title = CATEGORY_TITLES[categoryId];
  const totalLost = accounts.reduce((sum, a) => sum + a.spent, 0);

  if (loading) {
    return (
      <ThemedView className="flex-1 bg-bg">
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + Spacing["5xl"],
            paddingBottom: insets.bottom + Spacing["5xl"],
            paddingHorizontal: Spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-4">
            <Skeleton width={140} height={28} />
            <Skeleton width="80%" height={18} style={{ marginTop: 8 }} />
          </View>
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
        </ScrollView>
      </ThemedView>
    );
  }

  if (accounts.length === 0) {
    return (
      <ThemedView className="flex-1 bg-bg">
        <View
          className="px-4 pt-4 pb-2"
          style={{ paddingTop: insets.top + Spacing.lg }}
        >
          <ThemedText type="h1" className="text-text">
            {title}
          </ThemedText>
          <ThemedText type="body" className="text-text-muted mt-1">
            No accounts in this category yet.
          </ThemedText>
        </View>
        <EmptyState
          title="No accounts"
          description="Accounts will appear here once they’re linked and categorised."
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing["5xl"],
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
          <ThemedText type="h1" className="text-text">
            {title}
          </ThemedText>
          <ThemedText type="body" className="text-text-muted mt-1">
            You lost {formatZar(totalLost)} across {accounts.length} accounts this month.
          </ThemedText>
        </View>

        {accounts.map((account) => (
          <Pressable
            key={account.id}
            onPress={() =>
              router.push({ pathname: "/bank-autopsy" as any, params: { bankId: account.id } } as any)
            }
          >
            <AccountCard
              account={account}
              logo={getBankLogo(account.name)}
              onPressPrimary={() =>
                router.push({ pathname: "/bank-autopsy" as any, params: { bankId: account.id } } as any)
              }
              onPressSecondary={() =>
                router.push({ pathname: "/bank-autopsy" as any, params: { bankId: account.id } } as any)
              }
              onPressTertiary={() =>
                router.push({ pathname: "/bank-autopsy" as any, params: { bankId: account.id } } as any)
              }
            />
          </Pressable>
        ))}

        {spendSmarterSuggestions.length > 0 ? (
          <View style={{ marginTop: Spacing["2xl"], marginBottom: Spacing.lg }}>
            <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              Spend smarter in this category
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.md, fontSize: 16 }}>
              Better options for {title} – cheaper ways to spend here.
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
      </ScrollView>
    </ThemedView>
  );
}
