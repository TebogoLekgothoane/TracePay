import React, { useState } from "react";
import { FlatList, View, Pressable, StyleSheet, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
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
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundDefault,
          marginTop: index === 0 ? 0 : Spacing.sm,
        },
      ]}
    >
      <View style={styles.cardMain}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body" className="text-text">
            {subscription.name}
          </ThemedText>
          <ThemedText type="small" className="text-text-muted mt-1">
            R{subscription.amount.toFixed(2)}/month
          </ThemedText>
        </View>

        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: (subscription.isOptedOut ? optedOutColor : activeColor) + "20",
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: subscription.isOptedOut ? optedOutColor : activeColor },
            ]}
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
        style={({ pressed }) => [
          styles.actionButton,
          {
            backgroundColor: subscription.isOptedOut ? theme.backgroundTertiary : activeColor,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Feather
          name={subscription.isOptedOut ? "rotate-ccw" : "x-circle"}
          size={18}
          color={subscription.isOptedOut ? theme.text : "#FFFFFF"}
        />
        <ThemedText
          type="button"
          style={{
            marginLeft: Spacing.xs,
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
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.md }}>
              <Pressable
                onPress={() => router.back()}
                style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
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
              style={[
                styles.summaryPill,
                {
                  backgroundColor:
                    (isDark ? Colors.dark.info : Colors.light.info) + "15",
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isDark ? Colors.dark.info : Colors.light.info,
                  },
                ]}
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
        ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
      />

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.backgroundRoot,
              },
            ]}
          >
            <Feather
              name="alert-circle"
              size={40}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h2" style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>
              {t("confirm")}
            </ThemedText>
            <ThemedText
              type="body"
              className="text-text-secondary"
              style={{ textAlign: "center", marginBottom: Spacing["2xl"] }}
            >
              {`Do you want to automatically unsubscribe from ${pendingName ?? "this subscription"} using TracePay?`}
            </ThemedText>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleCancel}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: theme.backgroundDefault,
                  },
                ]}
              >
                <ThemedText type="button">{t("cancel")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmOptOut}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.alarmRed
                      : Colors.light.alarmRed,
                  },
                ]}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
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

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: "flex-start",
  },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  modalContent: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
