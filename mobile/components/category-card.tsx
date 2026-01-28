import React from "react";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/themed-text";
import { formatZar } from "@/components/utils/money";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type CategoryId = "banks" | "telcos" | "loans" | "insurance" | "subscriptions";

export type CategorySummary = {
  id: CategoryId;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  totalLost: number;
  providerCount: number;
};

export function CategoryCard({
  category,
  onPress,
}: {
  category: CategorySummary;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme() ?? "light";
  const iconColor = Colors[colorScheme].info; // brand blue

  return (
    <Pressable
      onPress={onPress}
      className="w-full rounded-3xl bg-white px-5 py-4 mb-4 flex-row items-center"
    >
      <View
        className="w-11 h-11 rounded-full items-center justify-center mr-4"
        style={{ backgroundColor: `${iconColor}10` }}
      >
        <Feather name={category.icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <ThemedText type="h3" className="text-text">
          {category.title}
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mt-1">
          {category.providerCount} {category.providerCount === 1 ? "account connected" : "accounts connected"}
        </ThemedText>
      </View>
      <View className="items-end">
        <ThemedText type="h4" className="text-text">
          {formatZar(category.totalLost)}
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mt-1">
          lost
        </ThemedText>
      </View>
    </Pressable>
  );
}

