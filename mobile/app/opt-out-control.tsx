import React, { useState } from "react";
import { FlatList, View, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, Colors } from "@/constants/theme";
import type { Subscription } from "@/types/app";

function SubscriptionRow({
  subscription,
  onPress,
  index,
}: {
  subscription: Subscription;
  onPress: () => void;
  index: number;
}) {
  const { theme, isDark } = useTheme();
  const { t } = useApp();

  const activeColor = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
  const optedOutColor = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;

  return (
    <View
      className={`rounded-xl p-4 ${index === 0 ? "" : "mt-2"}`}
      style={{ backgroundColor: theme.backgroundDefault }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <ThemedText type="body" className="text-text">
            {subscription.name}
          </ThemedText>
          <ThemedText type="small" className="text-text-muted mt-1">
            R{subscription.amount.toFixed(2)}/month
          </ThemedText>
        </View>

        <View
          className="flex-row items-center rounded-full py-1 px-2"
          style={{
            backgroundColor: (subscription.isOptedOut ? optedOutColor : activeColor) + "20",
          }}
        >
          <View
            className="w-2 h-2 rounded-full mr-1"
            style={{ backgroundColor: subscription.isOptedOut ? optedOutColor : activeColor }}
          />
          <ThemedText
            type="small"
            style={{
              color: subscription.isOptedOut ? optedOutColor : activeColor,
            }}
          >
            {subscription.isOptedOut ? t("subscriptionOptedOut") : t("optOutSubscription")}
          </ThemedText>
        </View>
      </View>

      <Pressable
        onPress={onPress}
        className="flex-row items-center mt-3 rounded py-2 px-3 self-start active:opacity-90"
        style={({ pressed }) => ({
          backgroundColor: subscription.isOptedOut ? theme.backgroundTertiary : activeColor,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Feather
          name={subscription.isOptedOut ? "rotate-ccw" : "x-circle"}
          size={18}
          color={subscription.isOptedOut ? theme.text : "#FFFFFF"}
        />
        <ThemedText
          type="button"
          className="ml-1"
          style={{
            color: subscription.isOptedOut ? theme.text : "#FFFFFF",
          }}
        >
          {subscription.isOptedOut ? t("cancel") : t("optOutSubscription")}
        </ThemedText>
      </Pressable>
    </View>
  );
}

export default function OptOutControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { subscriptions, toggleSubscriptionOptOut, t } = useApp();
  const router = useRouter();

  const activeCount = subscriptions.filter((s) => !s.isOptedOut).length;
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const handlePressSubscription = (subscription: Subscription) => {
    if (subscription.isOptedOut) {
      // If already opted out, allow immediate cancel/resume without confirmation
      toggleSubscriptionOptOut(subscription.id);
      return;
    }

    setPendingId(subscription.id);
    setPendingName(subscription.name);
    setConfirmVisible(true);
  };

  const handleConfirmOptOut = () => {
    if (pendingId) {
      toggleSubscriptionOptOut(pendingId);
    }
    setConfirmVisible(false);
    setPendingId(null);
    setPendingName(null);
  };

  const handleCancel = () => {
    setConfirmVisible(false);
    setPendingId(null);
    setPendingName(null);
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
        data={subscriptions}
        keyExtractor={(item) => item.id}
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
                Manage all subscriptions
              </ThemedText>
            </View>
            <ThemedText type="body" className="text-text-muted mb-3">
              Every subscription we can see in your statements – app stores, MTN/Vodacom, streaming,
              insurance and more – shows up here. Tap any row to unsubscribe right from this app.
            </ThemedText>
            <View
              className="flex-row items-center self-start rounded-full px-2 py-1"
              style={{
                backgroundColor: (isDark ? Colors.dark.info : Colors.light.info) + "15",
              }}
            >
              <View
                className="w-2 h-2 rounded-full mr-1"
                style={{
                  backgroundColor: isDark ? Colors.dark.info : Colors.light.info,
                }}
              />
              <ThemedText
                type="small"
                style={{
                  color: isDark ? Colors.dark.info : Colors.light.info,
                }}
              >
                {activeCount} active {activeCount === 1 ? "subscription" : "subscriptions"}
              </ThemedText>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <SubscriptionRow
            subscription={item}
            index={index}
            onPress={() => handlePressSubscription(item)}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-1" />}
      />

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View
            className="w-full rounded-3xl p-6 items-center"
            style={{ backgroundColor: theme.backgroundRoot }}
          >
            <Feather
              name="alert-circle"
              size={40}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h2" className="mt-4 mb-2 text-text">
              {t("confirm")}
            </ThemedText>
            <ThemedText
              type="body"
              className="text-text-secondary text-center mb-6"
            >
              {`Do you want to automatically unsubscribe from ${pendingName ?? "this subscription"} using TracePay?`}
            </ThemedText>

            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={handleCancel}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{ backgroundColor: theme.backgroundDefault }}
              >
                <ThemedText type="button">{t("cancel")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmOptOut}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{
                  backgroundColor: isDark
                    ? Colors.dark.alarmRed
                    : Colors.light.alarmRed,
                }}
              >
                <ThemedText type="button" className="text-white">
                  {t("confirm")}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
