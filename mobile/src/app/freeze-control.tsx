import React, { useState, useCallback, useEffect } from "react";
import { View, Switch, Modal, Pressable, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AccountRowSkeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { fetchUserBankAccounts, updateUserBankAccountFrozen, removeUserBankAccount } from "@/lib/api";

const NAVY = "#1e40af";
const navyTint = "rgba(30, 64, 175, 0.15)";
import { mobileFreeze, mobileUnfreeze, listFrozen } from "@/lib/backend-client";

interface FreezeToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  delay: number;
  icon?: React.ComponentProps<typeof Feather>["name"];
  accentColor?: string;
}

function FreezeToggle({ label, description, value, onValueChange, delay, icon, accentColor }: FreezeToggleProps) {
  const { theme } = useTheme();
  const trackOn = accentColor ?? theme.tabIconSelected;

  const handleToggle = async (newValue: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: theme.backgroundSecondary,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: theme.backgroundTertiary,
        borderLeftColor: value ? trackOn : theme.backgroundTertiary,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: BorderRadius.sm,
            backgroundColor: (accentColor ?? theme.tabIconSelected) + "22",
            alignItems: "center",
            justifyContent: "center",
            marginRight: Spacing.md,
          }}
        >
          <Feather
            name={icon}
            size={20}
            color={accentColor ?? theme.tabIconSelected}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, marginRight: Spacing.md }}>
        <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>
          {label}
        </ThemedText>
        {description ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4, fontSize: 14, lineHeight: 20 }}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={handleToggle}
        trackColor={{
          false: theme.backgroundTertiary,
          true: trackOn,
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
  const purple = theme.tabIconSelected;
  const navy = NAVY;
  const navyTintBg = navyTint;

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
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing["2xl"] }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: Spacing.sm, marginRight: Spacing.sm }}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h2">Freeze all</ThemedText>
      </View>

      <View style={{ marginBottom: Spacing["2xl"] }}>
        <ThemedText type="h3" style={{ color: theme.text, marginBottom: Spacing.sm }}>
          Freeze specific accounts
        </ThemedText>
        <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Choose which bank and wallet accounts to treat as frozen for new debits and fees.
        </ThemedText>

        {accountsLoading ? (
          <View style={{ gap: Spacing.sm }}>
            <AccountRowSkeleton />
            <AccountRowSkeleton />
            <AccountRowSkeleton />
            <AccountRowSkeleton />
          </View>
        ) : bankAccounts.length === 0 ? (
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
              No bank accounts linked yet.
            </ThemedText>
          </View>
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
            <View key={account.id} style={{ marginBottom: Spacing.lg }}>
              <FreezeToggle
                label={account.name}
                description={`${account.bank} • ${typeLabel}`}
                value={isFrozen}
                icon="layers"
                accentColor={navy}
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
                style={{ paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, marginTop: Spacing.xs }}
              >
                <ThemedText type="small" style={{ color: purple, fontSize: 14 }}>
                  Unlink this account
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
      </View>

      {activeCount > 0 ? (
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={{
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            marginBottom: Spacing["2xl"],
            backgroundColor: navyTintBg,
            borderWidth: 1,
            borderColor: NAVY + "45",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: BorderRadius.xs,
                backgroundColor: NAVY + "35",
                alignItems: "center",
                justifyContent: "center",
                marginRight: Spacing.sm,
              }}
            >
              <Feather name="alert-triangle" size={20} color={NAVY} />
            </View>
            <ThemedText type="h4" style={{ color: theme.text, fontSize: 18 }}>
              {t("warning")}
            </ThemedText>
          </View>
          <ThemedText type="body" style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22 }}>
            {t("freezeWarning")}
          </ThemedText>
        </Animated.View>
      ) : null}

      <View style={{ marginBottom: Spacing["2xl"] }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg }}>
          <View style={{ width: 32, height: 32, borderRadius: BorderRadius.xs, backgroundColor: purple + "25", alignItems: "center", justifyContent: "center", marginRight: Spacing.sm }}>
            <Feather name="shield" size={18} color={purple} />
          </View>
          <ThemedText type="h3" style={{ color: theme.text, fontSize: 18 }}>
            Protection options
          </ThemedText>
        </View>
        <View style={{ gap: Spacing.md }}>
          <FreezeToggle
            label={t("pauseDebitOrders")}
            description="We’ll pause debit orders we detect as risky or unnecessary so they stop draining your account."
            value={localSettings.pauseDebitOrders}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, pauseDebitOrders: value })
            }
            delay={100}
            icon="pause-circle"
            accentColor={purple}
          />
          <FreezeToggle
            label={t("blockFeeAccounts")}
            description="We’ll block high-fee accounts and products so future transactions don’t keep charging you hidden costs."
            value={localSettings.blockFeeAccounts}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, blockFeeAccounts: value })
            }
            delay={150}
            icon="credit-card"
            accentColor={navy}
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
            icon="smartphone"
            accentColor={purple}
          />
          <FreezeToggle
            label={t("cancelSubscriptions")}
            description="We’ll cancel subscriptions you rarely use so those month‑end debits stop surprising you."
            value={localSettings.cancelSubscriptions}
            onValueChange={(value) =>
              setLocalSettings({ ...localSettings, cancelSubscriptions: value })
            }
            delay={250}
            icon="x-circle"
            accentColor={purple}
          />
        </View>
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
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: theme.backgroundRoot,
            borderTopWidth: 1,
            borderTopColor: theme.backgroundTertiary,
          }}
        >
          <Pressable
            onPress={handleApply}
            className="btn-freeze-apply"
            style={{
              backgroundColor: purple,
              paddingVertical: Spacing.lg,
              borderRadius: BorderRadius.lg,
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="button-apply-freeze"
          >
            <ThemedText type="button" style={{ color: theme.buttonText, fontSize: 16, fontWeight: "600" }}>
              {t("apply")}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
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
              {t("confirm")}
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing["2xl"], lineHeight: 22 }}>
              {t("freezeWarning")}
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.md, width: "100%" }}>
              <Pressable
                onPress={() => setShowConfirmModal(false)}
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
                testID="button-cancel-confirm"
              >
                <ThemedText type="button" style={{ color: theme.text }}>{t("cancel")}</ThemedText>
              </Pressable>
              <Pressable
                onPress={confirmApply}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: purple,
                }}
                testID="button-confirm"
              >
                <ThemedText type="button" style={{ color: theme.buttonText, fontWeight: "600" }}>
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
