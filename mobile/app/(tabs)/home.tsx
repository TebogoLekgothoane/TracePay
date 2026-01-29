import React, { useMemo, useEffect, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import type { Bank } from "@/components/bank-card";
import { AppHeader } from "@/components/app-header";
import { IconLabelButton } from "@/components/icon-label-button";
import { useApp } from "@/context/app-context";
import { fetchBanks } from "@/lib/api";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, analysisData, t } = useApp();
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBanksLoading(true);
    fetchBanks()
      .then((data) => {
        if (!cancelled) setBanks(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setBanks([]);
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalLost = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.totalLost, 0),
    [banks]
  );

  const summaryText =
    analysisData?.summary[(language as "en" | "xh") ?? "en"] || analysisData?.summary.en || "";

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handleVoicePlay = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isPlayingVoice) {
      Speech.stop();
      setIsPlayingVoice(false);
      return;
    }

    if (!summaryText) {
      return;
    }

    const langCode = language === "xh" ? "xh-ZA" : "en-ZA";

    Speech.speak(summaryText, {
      language: langCode,
      rate: 0.9,
      onStart: () => setIsPlayingVoice(true),
      onDone: () => setIsPlayingVoice(false),
      onStopped: () => setIsPlayingVoice(false),
      onError: () => setIsPlayingVoice(false),
    });
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
                label={isPlayingVoice ? t("stopAudio") : t("playAudio")}
                onPress={handleVoicePlay}
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
              <Pressable
                key={bank.id}
                onPress={() =>
                  router.push({ pathname: "/bank-autopsy" as any, params: { bankId: bank.id } } as any)
                }
              >
                <BankSummaryCard bank={bank} />
              </Pressable>
            ))}

            {!banksLoading ? (
            <Pressable
              className="mt-1 rounded-full border border-border bg-bg-card py-3 items-center"
              onPress={() => {
                // Placeholder for future "add account" flow
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

