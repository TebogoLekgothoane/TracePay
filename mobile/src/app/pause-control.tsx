import React, { useState, useEffect } from "react";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { DebitOrderRowSkeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { useApp } from "@/context/app-context";
import { fetchDebitOrders, updateDebitOrderPaused } from "@/lib/api";
import { DEMO_USER_ID } from "@/lib/supabase";

const NAVY = "#1e40af";
const navyTint = "rgba(30, 64, 175, 0.15)";

type DebitOrder = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  isPaused: boolean;
};

function DebitOrderRow({
  item,
  index,
  onPress,
}: {
  item: DebitOrder;
  index: number;
  onPress: () => void;
}) {
  const { theme, isDark } = useTheme();
  const activeColor = NAVY;
  const pausedColor = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;
  const isActive = !item.isPaused;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(100 + index * 40).springify()}
      style={{
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: theme.backgroundSecondary,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: theme.backgroundTertiary,
        borderLeftColor: isActive ? activeColor : pausedColor,
        marginBottom: Spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: BorderRadius.sm,
            backgroundColor: (isActive ? activeColor : pausedColor) + "22",
            alignItems: "center",
            justifyContent: "center",
            marginRight: Spacing.sm,
          }}
        >
          <Feather
            name={isActive ? "repeat" : "check-circle"}
            size={18}
            color={isActive ? activeColor : pausedColor}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 12 }}>
              {item.date}
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}>
              R{item.amount.toFixed(2)}
            </ThemedText>
          </View>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 15 }} numberOfLines={1}>
            {item.description}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
            {item.reference}
          </ThemedText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginLeft: Spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: (item.isPaused ? pausedColor : activeColor) + "20",
              paddingVertical: 2,
              paddingHorizontal: Spacing.sm,
              borderRadius: BorderRadius.full,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                marginRight: 4,
                backgroundColor: item.isPaused ? pausedColor : activeColor,
              }}
            />
            <ThemedText
              type="small"
              style={{
                color: item.isPaused ? pausedColor : activeColor,
                fontSize: 11,
              }}
            >
              {item.isPaused ? "Paused" : "Active"}
            </ThemedText>
          </View>
          <Pressable
            onPress={handlePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={item.isPaused ? "Resume this debit order" : "Pause this debit order"}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              paddingHorizontal: Spacing.sm,
              borderRadius: BorderRadius.sm,
              backgroundColor: item.isPaused ? theme.backgroundTertiary : NAVY,
              borderWidth: item.isPaused ? 1 : 0,
              borderColor: theme.backgroundTertiary,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Feather
              name={item.isPaused ? "play-circle" : "pause-circle"}
              size={16}
              color={item.isPaused ? theme.text : "#FFFFFF"}
            />
            <ThemedText
              type="button"
              style={{
                marginLeft: 4,
                color: item.isPaused ? theme.text : "#FFFFFF",
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {item.isPaused ? "Resume" : "Pause"}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default function PauseControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const router = useRouter();
  const { userId } = useApp();
  const effectiveUserId = userId || DEMO_USER_ID;
  const [debitOrders, setDebitOrders] = useState<DebitOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<DebitOrder | null>(null);

  const navyTintBg = navyTint;
  const activeCount = debitOrders.filter((o) => !o.isPaused).length;

  useEffect(() => {
    setLoading(true);
    fetchDebitOrders(effectiveUserId)
      .then((data) => setDebitOrders(data ?? []))
      .catch(() => setDebitOrders([]))
      .finally(() => setLoading(false));
  }, [effectiveUserId]);

  const togglePause = (id: string) => {
    setDebitOrders((current) => {
      const next = current.map((order) =>
        order.id === id ? { ...order, isPaused: !order.isPaused } : order
      );
      const order = next.find((o) => o.id === id);
      if (order) updateDebitOrderPaused(effectiveUserId, id, order.isPaused).catch(() => {});
      return next;
    });
  };

  const handlePressOrder = (item: DebitOrder) => {
    if (item.isPaused) {
      togglePause(item.id);
      return;
    }
    setPendingId(item.id);
    setPendingOrder(item);
    setConfirmVisible(true);
  };

  const handleConfirmPause = () => {
    if (pendingId) {
      togglePause(pendingId);
    }
    setConfirmVisible(false);
    setPendingId(null);
    setPendingOrder(null);
  };

  const handleCancelConfirm = () => {
    setConfirmVisible(false);
    setPendingId(null);
    setPendingOrder(null);
  };

  return (
    <ThemedView className="flex-1 bg-bg" style={{ overflow: "hidden" }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"],
        }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing["2xl"] }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: Spacing.sm, marginRight: Spacing.sm }}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="h2">All your debit orders</ThemedText>
        </View>

        <View style={{ marginBottom: Spacing["2xl"] }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: BorderRadius.xs,
                backgroundColor: navyTint,
                alignItems: "center",
                justifyContent: "center",
                marginRight: Spacing.sm,
              }}
            >
              <Feather name="pause-circle" size={18} color={NAVY} />
            </View>
            <ThemedText type="h3" style={{ color: theme.text, fontSize: 18 }}>
              Your debit orders
            </ThemedText>
          </View>
          <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
            These are debit orders we detected from your statements. Tap Pause on a row to stop that debit order from running.
          </ThemedText>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: navyTintBg,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              borderRadius: BorderRadius.lg,
              borderWidth: 1,
              borderColor: NAVY + "55",
              marginBottom: Spacing.xl,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginRight: Spacing.sm,
                backgroundColor: NAVY,
              }}
            />
            <ThemedText type="small" style={{ color: NAVY, fontWeight: "600", fontSize: 14 }}>
              {activeCount} active {activeCount === 1 ? "debit order" : "debit orders"}
            </ThemedText>
          </View>

          {loading ? (
            <View style={{ gap: Spacing.sm }}>
              <DebitOrderRowSkeleton />
              <DebitOrderRowSkeleton />
              <DebitOrderRowSkeleton />
              <DebitOrderRowSkeleton />
            </View>
          ) : debitOrders.length === 0 ? (
            <View
              style={{
                paddingVertical: Spacing["2xl"],
                paddingHorizontal: Spacing.lg,
                borderRadius: BorderRadius.lg,
                backgroundColor: theme.backgroundSecondary,
                borderWidth: 1,
                borderColor: theme.backgroundTertiary,
              }}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary, fontSize: 16, textAlign: "center" }}>
                No debit orders found.
              </ThemedText>
            </View>
          ) : (
            debitOrders.map((order, index) => (
              <DebitOrderRow
                key={order.id}
                item={order}
                index={index}
                onPress={() => handlePressOrder(order)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelConfirm}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: Spacing["2xl"] }}>
          <Animated.View
            entering={FadeIn}
            style={{
              width: "100%",
              borderRadius: BorderRadius["2xl"],
              padding: Spacing["2xl"],
              alignItems: "center",
              backgroundColor: theme.backgroundRoot,
              borderWidth: 1,
              borderColor: theme.backgroundTertiary,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: navyTintBg,
                borderWidth: 1,
                borderColor: NAVY + "45",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Spacing.lg,
              }}
            >
              <Feather name="alert-circle" size={36} color={NAVY} />
            </View>
            <ThemedText type="h2" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              Pause this debit order?
            </ThemedText>
            <ThemedText
              type="body"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginBottom: Spacing["2xl"],
                lineHeight: 22,
              }}
            >
              {pendingOrder
                ? `TracePay will pause "${pendingOrder.description}" (R${pendingOrder.amount.toFixed(2)}) so it won't run until you resume it.`
                : "TracePay will pause this debit order so it won't run until you resume it."}
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.md, width: "100%" }}>
              <Pressable
                onPress={handleCancelConfirm}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: theme.backgroundTertiary,
                }}
              >
                <ThemedText type="button" style={{ color: theme.text, fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmPause}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NAVY,
                }}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Pause
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ThemedView>
  );
}
