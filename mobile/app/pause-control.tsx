import React, { useState, useEffect } from "react";
import { FlatList, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors } from "@/constants/theme";
import { fetchDebitOrders, updateDebitOrderPaused } from "@/lib/api";

type DebitOrder = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  isPaused: boolean;
};

export default function PauseControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { userId } = useApp();
  const [debitOrders, setDebitOrders] = useState<DebitOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDebitOrders(userId)
      .then((data) => setDebitOrders(data ?? []))
      .catch(() => setDebitOrders([]))
      .finally(() => setLoading(false));
  }, [userId]);

  const togglePause = (id: string) => {
    setDebitOrders((current) => {
      const next = current.map((order) =>
        order.id === id ? { ...order, isPaused: !order.isPaused } : order
      );
      const order = next.find((o) => o.id === id);
      if (order) updateDebitOrderPaused(userId, id, order.isPaused).catch(() => {});
      return next;
    });
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
        ListEmptyComponent={
          !loading ? (
            <ThemedText type="body" className="text-text-muted py-6 text-center">
              No debit orders found.
            </ThemedText>
          ) : (
            <ThemedText type="body" className="text-text-muted py-6 text-center">
              Loading debit orders…
            </ThemedText>
          )
        }
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
