import React, { useState } from "react";
import { View, StyleSheet, Switch, Modal, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { Subscription } from "@/types/app";

interface FreezeToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  delay: number;
}

function FreezeToggle({ label, value, onValueChange, delay }: FreezeToggleProps) {
  const { theme, isDark } = useTheme();

  const handleToggle = async (newValue: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={[styles.toggleContainer, { backgroundColor: theme.backgroundDefault }]}
    >
      <ThemedText type="body" style={styles.toggleLabel}>
        {label}
      </ThemedText>
      <Switch
        value={value}
        onValueChange={handleToggle}
        trackColor={{
          false: theme.backgroundTertiary,
          true: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed,
        }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.backgroundTertiary}
      />
    </Animated.View>
  );
}

interface SubscriptionItemProps {
  subscription: Subscription;
  onOptOut: () => void;
  index: number;
}

function SubscriptionItem({ subscription, onOptOut, index }: SubscriptionItemProps) {
  const { theme, isDark } = useTheme();
  const { t } = useApp();

  const handleOptOut = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOptOut();
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(350 + index * 50).springify()}
      style={[styles.subscriptionItem, { backgroundColor: theme.backgroundDefault }]}
    >
      <View style={styles.subscriptionInfo}>
        <ThemedText type="body">{subscription.name}</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          R{subscription.amount.toFixed(2)}/month
        </ThemedText>
      </View>
      <Pressable
        onPress={handleOptOut}
        style={({ pressed }) => [
          styles.optOutButton,
          {
            backgroundColor: subscription.isOptedOut
              ? isDark
                ? Colors.dark.hopeGreen
                : Colors.light.hopeGreen
              : isDark
                ? Colors.dark.alarmRed
                : Colors.light.alarmRed,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        testID={`button-optout-${subscription.id}`}
      >
        <Feather
          name={subscription.isOptedOut ? "check" : "x"}
          size={16}
          color="#FFFFFF"
        />
        <ThemedText type="small" style={styles.optOutText}>
          {subscription.isOptedOut ? t("subscriptionOptedOut") : t("optOutSubscription")}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

export default function FreezeControlScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { t, freezeSettings, setFreezeSettings, subscriptions, toggleSubscriptionOptOut } = useApp();

  const [localSettings, setLocalSettings] = useState(freezeSettings);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const hasChanges =
    localSettings.pauseDebitOrders !== freezeSettings.pauseDebitOrders ||
    localSettings.blockFeeAccounts !== freezeSettings.blockFeeAccounts ||
    localSettings.setAirtimeLimit !== freezeSettings.setAirtimeLimit ||
    localSettings.cancelSubscriptions !== freezeSettings.cancelSubscriptions;

  const activeCount = Object.values(localSettings).filter(Boolean).length;

  const handleApply = () => {
    if (activeCount > 0) {
      setShowConfirmModal(true);
    } else {
      confirmApply();
    }
  };

  const confirmApply = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFreezeSettings(localSettings);
    setShowConfirmModal(false);
  };

  const ListHeader = () => (
    <View>
      {activeCount > 0 ? (
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={[
            styles.warningCard,
            {
              backgroundColor: isDark
                ? Colors.dark.warningYellow + "20"
                : Colors.light.warningYellow + "20",
            },
          ]}
        >
          <View style={styles.warningHeader}>
            <Feather
              name="alert-triangle"
              size={22}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h4" style={styles.warningTitle}>
              {t("warning")}
            </ThemedText>
          </View>
          <ThemedText
            type="body"
            style={[styles.warningText, { color: theme.textSecondary }]}
          >
            {t("freezeWarning")}
          </ThemedText>
        </Animated.View>
      ) : null}

      <View style={styles.togglesList}>
        <FreezeToggle
          label={t("pauseDebitOrders")}
          value={localSettings.pauseDebitOrders}
          onValueChange={(value) =>
            setLocalSettings({ ...localSettings, pauseDebitOrders: value })
          }
          delay={100}
        />
        <FreezeToggle
          label={t("blockFeeAccounts")}
          value={localSettings.blockFeeAccounts}
          onValueChange={(value) =>
            setLocalSettings({ ...localSettings, blockFeeAccounts: value })
          }
          delay={150}
        />
        <FreezeToggle
          label={t("setAirtimeLimit")}
          value={localSettings.setAirtimeLimit}
          onValueChange={(value) =>
            setLocalSettings({ ...localSettings, setAirtimeLimit: value })
          }
          delay={200}
        />
        <FreezeToggle
          label={t("cancelSubscriptions")}
          value={localSettings.cancelSubscriptions}
          onValueChange={(value) =>
            setLocalSettings({ ...localSettings, cancelSubscriptions: value })
          }
          delay={250}
        />
      </View>

      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <ThemedText type="h3" style={styles.subscriptionsTitle}>
          {t("manageSubscriptions")}
        </ThemedText>
      </Animated.View>
    </View>
  );

  const ListFooter = () => (
    <View style={{ height: Spacing["4xl"] }} />
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing["4xl"],
          },
        ]}
        data={subscriptions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ListHeader />}
        ListFooterComponent={<ListFooter />}
        renderItem={({ item, index }) => (
          <SubscriptionItem
            subscription={item}
            onOptOut={() => toggleSubscriptionOptOut(item.id)}
            index={index}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />

      {hasChanges ? (
        <Animated.View
          entering={FadeInDown.springify()}
          style={[
            styles.bottomContainer,
            {
              paddingBottom: insets.bottom + Spacing.lg,
              backgroundColor: theme.backgroundRoot,
            },
          ]}
        >
          <Button
            onPress={handleApply}
            style={[
              styles.applyButton,
              {
                backgroundColor: isDark
                  ? Colors.dark.alarmRed
                  : Colors.light.alarmRed,
              },
            ]}
            testID="button-apply-freeze"
          >
            {t("apply")}
          </Button>
        </Animated.View>
      ) : null}

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeIn}
            style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}
          >
            <View style={styles.modalHeader}>
              <Feather
                name="alert-circle"
                size={48}
                color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
              />
              <ThemedText type="h2" style={styles.modalTitle}>
                {t("confirm")}
              </ThemedText>
            </View>

            <ThemedText
              type="body"
              style={[styles.modalText, { color: theme.textSecondary }]}
            >
              {t("freezeWarning")}
            </ThemedText>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowConfirmModal(false)}
                style={[
                  styles.modalButton,
                  styles.modalCancelButton,
                  { backgroundColor: theme.backgroundDefault },
                ]}
                testID="button-cancel-confirm"
              >
                <ThemedText type="button">{t("cancel")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={confirmApply}
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.alarmRed
                      : Colors.light.alarmRed,
                  },
                ]}
                testID="button-confirm"
              >
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
                  {t("confirm")}
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  warningCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  warningTitle: {},
  warningText: {},
  togglesList: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  toggleLabel: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  subscriptionsTitle: {
    marginBottom: Spacing.lg,
  },
  subscriptionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  subscriptionInfo: {
    flex: 1,
  },
  optOutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
    gap: Spacing.xs,
  },
  optOutText: {
    color: "#FFFFFF",
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  applyButton: {
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  modalHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    marginTop: Spacing.lg,
  },
  modalText: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
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
  modalCancelButton: {},
  modalConfirmButton: {},
});
