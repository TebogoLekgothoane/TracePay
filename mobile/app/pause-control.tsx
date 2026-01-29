import React, { useState } from "react";
import { FlatList, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, Colors } from "@/constants/theme";

type DebitOrder = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  isPaused: boolean;
};

const MOCK_DEBIT_ORDERS: DebitOrder[] = [
  {
    id: "1",
    date: "2026-01-03",
    description: "MTN SP DEBIT ORDER",
    reference: "MTNSP/1234567890",
    amount: 499.0,
    isPaused: false,
  },
  {
    id: "2",
    date: "2026-01-05",
    description: "INSURANCE PREMIUM DEBIT",
    reference: "INSURECO/987654321",
    amount: 320.5,
    isPaused: false,
  },
  {
    id: "3",
    date: "2026-01-09",
    description: "GYM MEMBERSHIP",
    reference: "FITGYM/135792468",
    amount: 299.0,
    isPaused: false,
  },
  {
    id: "4",
    date: "2026-01-12",
    description: "STREAMING SERVICE",
    reference: "STREAMCO/246813579",
    amount: 189.99,
    isPaused: false,
  },
];

export default function PauseControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const [debitOrders, setDebitOrders] = useState<DebitOrder[]>(MOCK_DEBIT_ORDERS);

  const togglePause = (id: string) => {
    setDebitOrders((current) =>
      current.map((order) =>
        order.id === id ? { ...order, isPaused: !order.isPaused } : order
      )
    );
  };

  const renderItem = ({ item }: { item: DebitOrder }) => {
    const pausedColor = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;
    const activeColor = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;

    return (
      <View
        className="rounded-xl p-4"
        style={{ backgroundColor: theme.backgroundDefault }}
      >
        <View className="flex-row justify-between items-center">
          <ThemedText type="small" className="text-text-muted">
            {item.date}
          </ThemedText>
          <ThemedText type="body" className="text-text">
            R{item.amount.toFixed(2)}
          </ThemedText>
        </View>

        <ThemedText type="body" className="text-text mt-1">
          {item.description}
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mt-1">
          {item.reference}
        </ThemedText>

        <View className="mt-3 flex-row justify-between items-center">
          <View
            className="flex-row items-center rounded-full py-1 px-2"
            style={{
              backgroundColor: (item.isPaused ? pausedColor : activeColor) + "20",
            }}
          >
            <View
              className="w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: item.isPaused ? pausedColor : activeColor }}
            />
            <ThemedText
              type="small"
              style={{
                color: item.isPaused ? pausedColor : activeColor,
              }}
            >
              {item.isPaused ? "Paused" : "Active"}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => togglePause(item.id)}
            className="flex-row items-center rounded py-2 px-3 active:opacity-85"
            style={({ pressed }) => ({
              backgroundColor: item.isPaused ? theme.backgroundTertiary : activeColor,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather
              name={item.isPaused ? "play-circle" : "pause-circle"}
              size={18}
              color={item.isPaused ? theme.text : "#FFFFFF"}
            />
            <ThemedText
              type="button"
              className="ml-1"
              style={{
                color: item.isPaused ? theme.text : "#FFFFFF",
              }}
            >
              {item.isPaused ? "Resume" : "Pause"}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
        data={debitOrders}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <Pressable
                onPress={() => router.back()}
                className="p-1 mr-2"
                hitSlop={10}
              >
                <Feather name="arrow-left" size={20} color={theme.text} />
              </Pressable>
              <ThemedText type="h2" className="text-text">
                All your debit orders
              </ThemedText>
            </View>
            <ThemedText type="body" className="text-text-muted">
              These are debit orders we detected from your statements. You can pause them
              to stop money leaving your account.
            </ThemedText>
          </View>
        }
        renderItem={renderItem}
      />
    </ThemedView>
  );
}
