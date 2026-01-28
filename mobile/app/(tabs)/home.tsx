import React from "react";
import { ScrollView, View, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { CategoryCard, type CategorySummary } from "@/components/category-card";
import { Spacing } from "@/constants/theme";

const MOCK_CATEGORIES: CategorySummary[] = [
  {
    id: "banks",
    title: "Banks",
    icon: "credit-card",
    totalLost: 3450,
    providerCount: 3,
  },
  {
    id: "telcos",
    title: "Telcos / Mobile Wallets",
    icon: "smartphone",
    totalLost: 1590,
    providerCount: 2,
  },
  {
    id: "loans",
    title: "Loans & Credit",
    icon: "trending-down",
    totalLost: 1600,
    providerCount: 1,
  },
  {
    id: "insurance",
    title: "Insurance",
    icon: "shield",
    totalLost: 520,
    providerCount: 2,
  },
  {
    id: "subscriptions",
    title: "Subscriptions / Other",
    icon: "layers",
    totalLost: 310,
    providerCount: 4,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with logo */}
        <View className="flex-row items-center mb-6">
          <Image
            source={require("../../assets/trace-pay logo.png")}
            style={{ width: 56, height: 56, marginRight: Spacing.sm }}
            resizeMode="contain"
          />
          <ThemedText type="h1" className="text-text">
            TracePay
          </ThemedText>
        </View>

        {/* Title + subtitle */}
        <View className="mb-8">
          <ThemedText type="h1" className="text-text mb-1">
            Where your money died
          </ThemedText>
          <ThemedText type="body" className="text-text-muted">
            High-level view of your money leaks. Tap a category to see the autopsy.
          </ThemedText>
        </View>

        {/* Categories */}
        <View className="mb-3">
          <ThemedText type="small" className="text-text-muted mb-2">
            Loss by source
          </ThemedText>
          {MOCK_CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onPress={() =>
                router.push({ pathname: "/category/[category]" as any, params: { category: cat.id } } as any)
              }
            />
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

