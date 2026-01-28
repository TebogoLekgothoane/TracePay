import React, { useState } from "react";
import { View, StyleSheet, Switch, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

interface FreezeToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  delay: number;
}

function FreezeToggle({ label, description, value, onValueChange, delay }: FreezeToggleProps) {
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
      <View style={styles.toggleTextContainer}>
        <ThemedText type="body" style={styles.toggleLabel}>
          {label}
        </ThemedText>
        {description ? (
          <ThemedText
            type="small"
            style={[styles.toggleDescription, { color: theme.textSecondary }]}
          >
            {description}
          </ThemedText>
        ) : null}
      </View>
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

type BankAccount = {
  id: string;
  bank: string;
  name: string;
  type: "current" | "savings" | "wallet";
};

const BANK_ACCOUNTS: BankAccount[] = [
  { id: "capitec-main", bank: "Capitec", name: "Everyday Account", type: "current" },
  { id: "capitec-save", bank: "Capitec", name: "Savings Pocket", type: "savings" },
  { id: "standard-main", bank: "Standard Bank", name: "Cheque Account", type: "current" },
  { id: "absa-fee", bank: "Absa", name: "High-fee Account", type: "current" },
  { id: "mtn-momo", bank: "MTN MoMo", name: "MoMo Wallet", type: "wallet" },
];

export default function FreezeControlScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { t, freezeSettings, setFreezeSettings, airtimeLimit } = useApp();
  const router = useRouter();

  const [localSettings, setLocalSettings] = useState(freezeSettings);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [frozenAccounts, setFrozenAccounts] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    BANK_ACCOUNTS.forEach((acc) => {
      initial[acc.id] = false;
    });
    return initial;
  });

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

  const HeaderContent = () => (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: Spacing["2xl"],
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <View>
          <ThemedText type="h2" className="text-text">
            Freeze all
          </ThemedText>
       
        </View>
      </View>

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

      <View style={{ marginTop: Spacing["3xl"] }}>
        <View style={styles.togglesList}>
          <FreezeToggle
            label={t("pauseDebitOrders")}
            description="We’ll pause debit orders we detect as risky or unnecessary so they stop draining your account."
            value={localSettings.pauseDebitOrders}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, pauseDebitOrders: value })
            }
            delay={100}
          />
          <FreezeToggle
            label={t("blockFeeAccounts")}
            description="We’ll block high-fee accounts and products so future transactions don’t keep charging you hidden costs."
            value={localSettings.blockFeeAccounts}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, blockFeeAccounts: value })
            }
            delay={150}
          />
          <FreezeToggle
            label={t("setAirtimeLimit")}
            description={
              airtimeLimit > 0
                ? `We’ll cap airtime & data at about R${airtimeLimit.toFixed(
                    0,
                  )} a month so small top-ups don’t quietly eat your salary.`
                : "We’ll cap how much airtime and data you can buy so small top-ups don’t quietly eat your salary."
            }
            value={localSettings.setAirtimeLimit}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, setAirtimeLimit: value })
            }
            delay={200}
          />
          <FreezeToggle
            label={t("cancelSubscriptions")}
            description="We’ll cancel subscriptions you rarely use so those month‑end debits stop surprising you."
            value={localSettings.cancelSubscriptions}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, cancelSubscriptions: value })
            }
            delay={250}
          />
        </View>
      </View>

      <View style={{ marginTop: Spacing["3xl"] }}>
        <ThemedText type="body" className="text-text mb-2">
          Freeze specific accounts
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mb-3">
          Choose which bank and wallet accounts TracePay should treat as frozen for new debit orders
          and fees.
        </ThemedText>

        {BANK_ACCOUNTS.map((account, index) => {
          const isFrozen = frozenAccounts[account.id];
          const typeLabel =
            account.type === "current"
              ? "Current account"
              : account.type === "savings"
              ? "Savings"
              : "Wallet";

          return (
            <FreezeToggle
              key={account.id}
              label={account.name}
              description={`${account.bank} • ${typeLabel}`}
              value={isFrozen}
              onValueChange={async (value) => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFrozenAccounts((prev) => ({ ...prev, [account.id]: value }));
              }}
              delay={300 + index * 40}
            />
          );
        })}
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing["4xl"],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HeaderContent />
      </ScrollView>

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
  toggleTextContainer: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  toggleDescription: {
    marginTop: Spacing.xs,
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
