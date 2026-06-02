import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { ActionCard } from "@/components/action-card";
import { Spacing } from "@/constants/theme";

export default function ActionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <ThemedText type="h2" className="text-text mb-1">
              Actions
            </ThemedText>
            <ThemedText type="body" className="text-text-muted">
              Take control of your money leaks
            </ThemedText>
          </View>

          <View className="flex-row flex-wrap justify-between">
            <ActionCard
              icon="cloud-snow"
              title="Freeze All"
              subtitle="Stop money leaks across banks"
              onPress={() => router.push("/freeze-control")}
            />
            <ActionCard
              icon="pause-circle"
              title="Pause Debit Orders"
              subtitle="Temporarily stop risky debits"
              onPress={() => router.push("/pause-control")}
            />
            <ActionCard
              icon="shuffle"
              title="Route Income Differently"
              subtitle="Send income to safer accounts"
              onPress={() => router.push("/reroute-control")}
            />
            <ActionCard
              icon="x-circle"
              title="Auto-Unsubscribe"
              subtitle="Cancel useless subscriptions"
              onPress={() => router.push("/opt-out-control")}
            />
            <ActionCard
              icon="trending-down"
              title="Spend Smarter"
              subtitle="Cheaper options for what you buy"
              onPress={() => router.push("/reroute-control")}
            />
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

