import React, { useMemo } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AccountCard, type AccountAutopsy } from "@/components/account-card";
import type { CategoryId } from "@/components/category-card";
import { Spacing } from "@/constants/theme";
import { formatZar } from "@/components/utils/money";

const BANK_ACCOUNTS: AccountAutopsy[] = [
  { id: "absa", name: "Absa Account", spent: 8250, fees: 225, debits: 3000, other: 5025 },
  { id: "standard", name: "Standard Bank", spent: 3650, fees: 180, debits: 2100, other: 1370 },
  { id: "capitec", name: "Capitec", spent: 1450, fees: 95, debits: 830, other: 525 },
];

const TELCO_ACCOUNTS: AccountAutopsy[] = [
  { id: "vodacom", name: "Vodacom Wallet", spent: 1590, fees: 130, debits: 875, other: 585 },
  { id: "mtn-momo", name: "MTN MoMo", spent: 496, fees: 90, debits: 280, other: 126 },
];

const LOAN_ACCOUNTS: AccountAutopsy[] = [
  { id: "mashonisa", name: "Mashonisa Loan", spent: 1600, fees: 0, debits: 1600, other: 0 },
];

const INSURANCE_ACCOUNTS: AccountAutopsy[] = [
  { id: "funeral", name: "Funeral Cover", spent: 320, fees: 0, debits: 320, other: 0 },
  { id: "device", name: "Device Insurance", spent: 200, fees: 0, debits: 200, other: 0 },
];

const SUBS_ACCOUNTS: AccountAutopsy[] = [
  { id: "streaming", name: "Streaming Services", spent: 210, fees: 0, debits: 210, other: 0 },
  { id: "gym", name: "Gym Membership", spent: 100, fees: 0, debits: 100, other: 0 },
];

function getCategoryData(category: CategoryId): { title: string; accounts: AccountAutopsy[] } {
  switch (category) {
    case "banks":
      return { title: "Banks", accounts: BANK_ACCOUNTS };
    case "telcos":
      return { title: "Telcos / Mobile Wallets", accounts: TELCO_ACCOUNTS };
    case "loans":
      return { title: "Loans & Credit", accounts: LOAN_ACCOUNTS };
    case "insurance":
      return { title: "Insurance", accounts: INSURANCE_ACCOUNTS };
    case "subscriptions":
    default:
      return { title: "Subscriptions / Other", accounts: SUBS_ACCOUNTS };
  }
}

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: CategoryId }>();
  const categoryId: CategoryId = (params.category as CategoryId) ?? "banks";

  const { title, accounts } = useMemo(() => getCategoryData(categoryId), [categoryId]);

  const totalLost = accounts.reduce((sum, a) => sum + a.spent, 0);

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

