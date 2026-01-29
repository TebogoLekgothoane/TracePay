import React, { useState, useCallback, useEffect } from "react";
import { View, Switch, Modal, Pressable, ScrollView, Alert } from "react-native";
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
import { Spacing, Colors } from "@/constants/theme";
import { fetchUserBankAccounts, updateUserBankAccountFrozen, removeUserBankAccount } from "@/lib/api";
import { mobileFreeze, mobileUnfreeze, listFrozen } from "@/lib/backend-client";

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
      className="flex-row justify-between items-center p-4 rounded-xl"
      style={{ backgroundColor: theme.backgroundDefault }}
    >
      <View className="flex-1 mr-4">
        <ThemedText type="body" className="text-text">
          {label}
        </ThemedText>
        {description ? (
          <ThemedText type="small" className="mt-1" style={{ color: theme.textSecondary }}>
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

export default function FreezeControlScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { t, freezeSettings, setFreezeSettings, airtimeLimit, userId } = useApp();
  const router = useRouter();

  const [localSettings, setLocalSettings] = useState(freezeSettings);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [frozenAccounts, setFrozenAccounts] = useState<Record<string, boolean>>({});
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [frozenItemIdsByAccountId, setFrozenItemIdsByAccountId] = useState<Record<string, number>>({});

  const refreshBackendFrozen = useCallback(async () => {
    try {
      const items = await listFrozen();
      const byAccount: Record<string, number> = {};
      items.forEach((item) => {
        if (item.transaction_id && item.status === "frozen") {
          byAccount[item.transaction_id] = item.id;
        }
      });
      setFrozenItemIdsByAccountId(byAccount);
      return byAccount;
    } catch {
      setFrozenItemIdsByAccountId({});
      return {};
    }
  }, []);

  const loadAccounts = useCallback(() => {
    setAccountsLoading(true);
    Promise.all([
      fetchUserBankAccounts(userId),
      refreshBackendFrozen(),
    ]).then(([accounts, backendByAccount]) => {
      setBankAccounts(
        (accounts ?? []).map((a) => ({
          id: a.id,
          bank: a.bank,
          name: a.name,
          type: a.type,
        }))
      );
      const initial: Record<string, boolean> = {};
      (accounts ?? []).forEach((a) => {
        initial[a.id] = backendByAccount[a.id] != null ? true : a.isFrozen;
      });
      setFrozenAccounts(initial);
      setAccountsLoading(false);
    }).catch(() => setAccountsLoading(false));
  }, [userId, refreshBackendFrozen]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleUnlinkAccount = useCallback(
    (account: BankAccount) => {
      Alert.alert(
        "Unlink account",
        `Remove ${account.name} (${account.bank}) from your list?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unlink",
            style: "destructive",
            onPress: async () => {
              try {
                const frozenId = frozenItemIdsByAccountId[account.id];
                if (frozenId != null) {
                  try {
                    await mobileUnfreeze(frozenId);
                  } catch {
                    // Continue to remove from Supabase
                  }
                }
                const ok = await removeUserBankAccount(userId, account.id);
                if (ok) {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  loadAccounts();
                }
              } catch {
                Alert.alert("Could not unlink", "Please try again.");
              }
            },
          },
        ]
      );
    },
    [userId, frozenItemIdsByAccountId, loadAccounts]
  );

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
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          className="p-1 mr-2"
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
          className="rounded-xl p-4 mb-6"
          style={{
            backgroundColor: isDark
              ? Colors.dark.warningYellow + "20"
              : Colors.light.warningYellow + "20",
          }}
        >
          <View className="flex-row items-center gap-2 mb-2">
            <Feather
              name="alert-triangle"
              size={22}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h4" className="text-text">
              {t("warning")}
            </ThemedText>
          </View>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {t("freezeWarning")}
          </ThemedText>
        </Animated.View>
      ) : null}

      <View className="mt-8">
        <View className="gap-3 mb-6">
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

      <View className="mt-8">
        <ThemedText type="body" className="text-text mb-2">
          Freeze specific accounts
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mb-3">
          Choose which bank and wallet accounts TracePay should treat as frozen for new debit orders
          and fees.
        </ThemedText>

        {accountsLoading ? (
          <ThemedText type="body" className="text-text-muted py-4">
            Loading accounts…
          </ThemedText>
        ) : bankAccounts.length === 0 ? (
          <ThemedText type="body" className="text-text-muted py-4">
            No bank accounts linked yet.
          </ThemedText>
        ) : null}
        {!accountsLoading && bankAccounts.map((account, index) => {
          const isFrozen = frozenAccounts[account.id] ?? false;
          const typeLabel =
            account.type === "current"
              ? "Current account"
              : account.type === "savings"
              ? "Savings"
              : "Wallet";

          return (
            <View key={account.id} className="mb-2">
              <FreezeToggle
                label={account.name}
                description={`${account.bank} • ${typeLabel}`}
                value={isFrozen}
                onValueChange={async (value) => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const prev = frozenAccounts[account.id] ?? false;

                const confirmed = await new Promise<boolean>((resolve) => {
                  if (value) {
                    Alert.alert(
                      "Freeze this account?",
                      `TracePay will treat ${account.name} (${account.bank}) as frozen. New debit orders and fees won't be applied to it until you unfreeze.`,
                      [
                        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                        { text: "Freeze", onPress: () => resolve(true) },
                      ]
                    );
                  } else {
                    Alert.alert(
                      "Unfreeze this account?",
                      `${account.name} (${account.bank}) will receive new debit orders and fees again. Are you sure?`,
                      [
                        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                        { text: "Unfreeze", style: "destructive", onPress: () => resolve(true) },
                      ]
                    );
                  }
                });

                if (!confirmed) return;

                setFrozenAccounts((p) => ({ ...p, [account.id]: value }));
                try {
                  if (value) {
                    await mobileFreeze({
                      transaction_id: account.id,
                      reason: "Froze account from Freeze Control",
                    });
                    await refreshBackendFrozen();
                  } else {
                    const frozenId = frozenItemIdsByAccountId[account.id];
                    if (frozenId != null) {
                      await mobileUnfreeze(frozenId);
                      await refreshBackendFrozen();
                    }
                  }
                  updateUserBankAccountFrozen(userId, account.id, value).catch(() => {});
                } catch (e) {
                  setFrozenAccounts((p) => ({ ...p, [account.id]: prev }));
                  const msg = e instanceof Error ? e.message : "Could not update";
                  const isUnauth = msg.includes("401") || msg.toLowerCase().includes("credentials");
                  Alert.alert(
                    isUnauth ? "Sign in to freeze accounts" : "Update failed",
                    isUnauth
                      ? "Sign in or create an account so we can save your frozen accounts."
                      : msg
                  );
                }
              }}
                delay={300 + index * 40}
              />
              <Pressable
                onPress={() => handleUnlinkAccount(account)}
                className="py-2 px-1"
              >
                <ThemedText type="small" className="text-primary">
                  Unlink this account
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <ThemedView className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        <HeaderContent />
      </ScrollView>

      {hasChanges ? (
        <Animated.View
          entering={FadeInDown.springify()}
          className="absolute bottom-0 left-0 right-0 px-4 pt-4"
          style={{
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: theme.backgroundRoot,
          }}
        >
          <Button
            onPress={handleApply}
            className="w-full"
            style={{
              backgroundColor: isDark
                ? Colors.dark.alarmRed
                : Colors.light.alarmRed,
            }}
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
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <Animated.View
            entering={FadeIn}
            className="w-full rounded-3xl p-6 items-center"
            style={{ backgroundColor: theme.backgroundRoot }}
          >
            <View className="items-center mb-4">
              <Feather
                name="alert-circle"
                size={48}
                color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
              />
              <ThemedText type="h2" className="text-text mt-4">
                {t("confirm")}
              </ThemedText>
            </View>

            <ThemedText
              type="body"
              className="text-center mb-6"
              style={{ color: theme.textSecondary }}
            >
              {t("freezeWarning")}
            </ThemedText>

            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={() => setShowConfirmModal(false)}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{ backgroundColor: theme.backgroundDefault }}
                testID="button-cancel-confirm"
              >
                <ThemedText type="button">{t("cancel")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={confirmApply}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{
                  backgroundColor: isDark
                    ? Colors.dark.alarmRed
                    : Colors.light.alarmRed,
                }}
                testID="button-confirm"
              >
                <ThemedText type="button" className="text-white">
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
