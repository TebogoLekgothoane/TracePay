import React, { useEffect, useState } from "react";
import { ScrollView, View, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AccountCard, type AccountAutopsy } from "@/components/account-card";
import type { CategoryId } from "@/components/category-card";
import { EmptyState } from "@/components/empty-state";
import { Spacing, Colors } from "@/constants/theme";
import { formatZar } from "@/components/utils/money";
import { useApp } from "@/context/app-context";
import { fetchCategoryAccounts } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme-color";

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
  const { isDark } = useTheme();
  const [accounts, setAccounts] = useState<AccountAutopsy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCategoryAccounts(userId, categoryId)
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [userId, categoryId]);

  const title = CATEGORY_TITLES[categoryId];
  const totalLost = accounts.reduce((sum, a) => sum + a.spent, 0);

  if (loading) {
    return (
      <ThemedView className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? Colors.dark.info : Colors.light.info} />
        <ThemedText type="body" className="text-text-muted mt-3">
          Loading {title}…
        </ThemedText>
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
      </ScrollView>
    </ThemedView>
  );
}
