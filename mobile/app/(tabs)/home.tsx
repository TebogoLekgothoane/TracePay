import React, { useMemo, useEffect, useState } from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import type { Bank } from "@/components/bank-card";
import { AppHeader } from "@/components/app-header";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";

const BANKS: Bank[] = [
  {
    id: "capitec",
    name: "Capitec",
    type: "bank",
    totalLost: 1193.5,
  },
  {
    id: "standard-bank",
    name: "Standard Bank",
    type: "bank",
    totalLost: 530.2,
  },
  {
    id: "mtn-momo",
    name: "MTN MoMo",
    type: "momo",
    totalLost: 496.0,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { language, analysisData, t } = useApp();
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const totalLost = useMemo(
    () => BANKS.reduce((sum, bank) => sum + bank.totalLost, 0),
    []
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
            style={{ marginBottom: 24 }}
            rightAccessory={
              <Pressable
                onPress={handleVoicePlay}
                className="bg-accent rounded-full px-4 py-2 flex-row items-center"
              >
                <Feather name="mic" size={16} color="#FFFFFF" />
                <View style={{ width: 8 }} />
                <ThemedText type="button" className="text-white">
                  {isPlayingVoice ? t("stopAudio") : t("playAudio")}
                </ThemedText>
              </Pressable>
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
          

          {/* Banks list */}
          <View className="mb-4 space-y-3">
            {BANKS.map((bank) => (
              <Pressable
                key={bank.id}
                onPress={() =>
                  router.push({ pathname: "/bank-autopsy" as any, params: { bankId: bank.id } } as any)
                }
              >
                <BankSummaryCard bank={bank} />
              </Pressable>
            ))}

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
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

