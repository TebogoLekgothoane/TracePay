import React, { useState } from "react";
import { View, ScrollView, Pressable, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { AppHeader } from "@/components/app-header";
import { Spacing } from "@/constants/theme";
import { addBank } from "@/lib/api";
import { getBankLogo } from "@/lib/bank-logos";

type BankOption = { name: string; type: "bank" | "momo" };

const BANK_OPTIONS: BankOption[] = [
  { name: "Capitec", type: "bank" },
  { name: "Nedbank", type: "bank" },
  { name: "Standard Bank", type: "bank" },
  { name: "TymeBank", type: "bank" },
  { name: "Absa", type: "bank" },
  { name: "MTN MoMo", type: "momo" },
  { name: "Vodapay", type: "momo" },
  { name: "Vodacom", type: "momo" },
];

export default function AddAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (option: BankOption) => {
    setError(null);
    setAddingId(option.name);
    try {
      const result = await addBank({ name: option.name, type: option.type });
      if (result) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        setError("Could not add account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Add account"
          subtitle="Choose a bank or mobile wallet to add."
          showBackButton
          onBackPress={() => router.back()}
        />

        {error ? (
          <View className="mb-4 rounded-xl bg-red-100 px-4 py-3">
            <ThemedText type="body" className="text-red-700">
              {error}
            </ThemedText>
          </View>
        ) : null}

        <View className="gap-3">
          {BANK_OPTIONS.map((option) => {
            const logo = getBankLogo(option.name);
            const isAdding = addingId === option.name;
            return (
              <Pressable
                key={option.name}
                onPress={() => handleAdd(option)}
                disabled={!!addingId}
                className="flex-row items-center rounded-2xl bg-bg-card px-5 py-4 active:opacity-80"
              >
                {logo ? (
                  <Image
                    source={logo}
                    className="h-12 w-12 rounded-xl"
                    resizeMode="contain"
                  />
                ) : (
                  <View className="h-12 w-12 rounded-xl bg-bg items-center justify-center">
                    <ThemedText type="small" className="text-text-muted">
                      {option.name.charAt(0)}
                    </ThemedText>
                  </View>
                )}
                <View className="ml-4 flex-1">
                  <ThemedText type="h3" className="text-text">
                    {option.name}
                  </ThemedText>
                  <ThemedText type="small" className="text-text-muted">
                    {option.type === "momo" ? "Mobile wallet" : "Bank"}
                  </ThemedText>
                </View>
                {isAdding ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <ThemedText type="button" className="text-primary">
                    Add
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
