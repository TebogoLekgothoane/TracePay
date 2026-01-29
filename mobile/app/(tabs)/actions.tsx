import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { AppHeader } from "@/components/app-header";
import { ActionCard } from "@/components/action-card";

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
          <AppHeader
            title="Actions"
            subtitle="Take control of your money leaks"
            style={{ marginBottom: 24 }}
          />

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
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

