import React, { useMemo, useState, useCallback } from "react";
import { ScrollView, View, Pressable, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import { DiscountCard } from "@/components/discount-card";
import type { Bank } from "@/components/bank-card";
import type { UserDiscount } from "@/types/discount";
import { AppHeader } from "@/components/app-header";
import { IconLabelButton } from "@/components/icon-label-button";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { fetchBanks, removeBank } from "@/lib/api";
import { getDiscountsForUser } from "@/lib/discounts";
import { getBankLogo } from "@/lib/bank-logos";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, t } = useApp();
  const { theme } = useTheme();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const loadBanks = useCallback(() => {
    setBanksLoading(true);
    fetchBanks()
      .then((data) => setBanks(data ?? []))
      .catch(() => setBanks([]))
      .finally(() => setBanksLoading(false));
  }, []);

  const handleUnlinkBank = useCallback(
    (bank: Bank) => {
      Alert.alert(
        "Unlink bank",
        `Remove ${bank.name} from your list? This will also remove its autopsy data.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unlink",
            style: "destructive",
            onPress: async () => {
              setUnlinkingId(bank.id);
              try {
                const ok = await removeBank(bank.id);
                if (ok) {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  loadBanks();
                }
              } finally {
                setUnlinkingId(null);
              }
            },
          },
        ]
      );
    },
    [loadBanks]
  );

  useFocusEffect(
    useCallback(() => {
      loadBanks();
    }, [loadBanks])
  );

  const totalLost = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.totalLost, 0),
    [banks]
  );

  const [discounts, setDiscounts] = useState<UserDiscount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setDiscountsLoading(true);
      getDiscountsForUser()
        .then(setDiscounts)
        .catch(() => setDiscounts([]))
        .finally(() => setDiscountsLoading(false));
    }, [])
  );

  const handleCopyDiscountCode = (code: string) => {
    Share.share({ message: code, title: "Promo code" }).catch(() => {});
  };

  const handleVoicePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/voicemodal" as any);
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View className="px-5">
          <AppHeader
            title="Where your money died"
            subtitle="See all your money leaks per bank. Tap a bank to see the autopsy."
            className="mb-6"
            rightAccessory={
              <IconLabelButton
                icon="mic"
                label={t("playAudio")}
                onPress={handleVoicePress}
                iconSize={16}
                className="px-4 py-2"
              />
            }
          />

          {/* Monthly loss summary */}
          <View className="mb-5">
            <ThemedText type="small" className="text-text-muted">
              Total lost this month
            </ThemedText>
            <ThemedText type="h2" className="mt-1 text-primary">
              R{totalLost.toLocaleString()}
            </ThemedText>
          </View>

          {/* Your rewards – discounts from retailers (from DB) */}
          <View className="mb-6">
            <ThemedText type="h3" className="text-text mb-2">
              Your rewards
            </ThemedText>
            <ThemedText type="small" className="text-text-muted mb-3">
              Discounts from partners – use the app more to unlock more.
            </ThemedText>
            {discountsLoading ? (
              <ThemedText type="body" className="text-text-muted py-4">
                Loading rewards…
              </ThemedText>
            ) : discounts.length === 0 ? (
              <ThemedText type="body" className="text-text-muted py-4">
                No rewards yet. Check back soon or use the app more to unlock.
              </ThemedText>
            ) : (
              discounts.map((d) => (
                <DiscountCard
                  key={d.id}
                  discount={d}
                  onCopyCode={handleCopyDiscountCode}
                />
              ))
            )}
          </View>

          {/* Banks list (from DB) */}
          <View className="mb-4 space-y-3">
            {banksLoading ? (
              <ThemedText type="body" className="text-text-muted py-4">
                Loading banks…
              </ThemedText>
            ) : banks.length === 0 ? (
              <ThemedText type="body" className="text-text-muted py-4">
                No banks linked yet.
              </ThemedText>
            ) : null}
            {!banksLoading &&
              banks.map((bank) => (
              <View key={bank.id} className="relative mb-3">
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/bank-autopsy" as any, params: { bankId: bank.id } } as any)
                  }
                  onLongPress={() => handleUnlinkBank(bank)}
                  delayLongPress={400}
                >
                  <BankSummaryCard bank={bank} logo={getBankLogo(bank.name)} />
                </Pressable>
                <Pressable
                  onPress={() => handleUnlinkBank(bank)}
                  className="absolute top-3 right-3 p-2 rounded-full"
                  style={{ backgroundColor: theme.backgroundTertiary }}
                  disabled={unlinkingId === bank.id}
                >
                  <Feather name="trash-2" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            ))}

            {!banksLoading ? (
            <Pressable
              className="mt-1 rounded-full border border-border bg-bg-card py-3 items-center"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/add-account" as any);
              }}
            >
              <ThemedText type="button" className="text-primary">
                + Add Account
              </ThemedText>
            </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

