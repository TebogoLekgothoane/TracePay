import React from "react";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AppHeader } from "@/components/app-header";

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

          {/* Actions grid */}
          <View className="flex-row flex-wrap justify-between">
            <Pressable
              className="w-[48%] mb-3 rounded-2xl bg-bg-card px-4 py-3 flex-row items-center"
              onPress={() => router.push("/freeze-control")}
            >
              <View className="h-9 w-9 rounded-full items-center justify-center bg-primary/10 mr-3">
                <Feather name="cloud-snow" size={18} />
              </View>
              <View className="flex-1">
                <ThemedText type="body" className="text-text">
                  Freeze All
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mt-0.5">
                  Stop money leaks across banks
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              className="w-[48%] mb-3 rounded-2xl bg-bg-card px-4 py-3 flex-row items-center"
              onPress={() => router.push("/pause-control")}
            >
              <View className="h-9 w-9 rounded-full items-center justify-center bg-primary/10 mr-3">
                <Feather name="pause-circle" size={18} />
              </View>
              <View className="flex-1">
                <ThemedText type="body" className="text-text">
                  Pause Debit Orders
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mt-0.5">
                  Temporarily stop risky debits
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              className="w-[48%] mb-3 rounded-2xl bg-bg-card px-4 py-3 flex-row items-center"
              onPress={() => router.push("/reroute-control")}
            >
              <View className="h-9 w-9 rounded-full items-center justify-center bg-primary/10 mr-3">
                <Feather name="shuffle" size={18} />
              </View>
              <View className="flex-1">
                <ThemedText type="body" className="text-text">
                  Route Income Differently
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mt-0.5">
                  Send income to safer accounts
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              className="w-[48%] mb-3 rounded-2xl bg-bg-card px-4 py-3 flex-row items-center"
              onPress={() => router.push("/opt-out-control")}
            >
              <View className="h-9 w-9 rounded-full items-center justify-center bg-primary/10 mr-3">
                <Feather name="x-circle" size={18} />
              </View>
              <View className="flex-1">
                <ThemedText type="body" className="text-text">
                  Auto-Unsubscribe
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mt-0.5">
                  Cancel useless subscriptions
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

