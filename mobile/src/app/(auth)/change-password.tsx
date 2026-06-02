import React, { useState } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Image } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { LabeledInput } from "@/components/labeled-input";
import { Button } from "@/components/ui/button";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";

/** Change password screen. No backend – fake success only. */
export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /** Fake change: no backend. Just validate and show success, then go back. */
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    setSuccess(true);
    setTimeout(() => router.back(), 1200);
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + Spacing["3xl"],
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} className="mb-4 self-start">
            <ThemedText type="body" className="text-primary font-medium">
              ← Back
            </ThemedText>
          </Pressable>

          <View className="items-center mb-6">
            <Image
              source={require("../../assets/trace-pay logo.png")}
              style={{ width: 72, height: 72 }}
              resizeMode="contain"
            />
            <ThemedText type="h1" className="text-text mt-4 mb-2 text-center">
              Change password
            </ThemedText>
            <ThemedText type="body" className="text-text-muted text-center max-w-[280px]">
              Enter your new password below. Use at least 6 characters.
            </ThemedText>
          </View>

          {success ? (
            <View
              className="p-5 rounded-2xl mb-6"
              style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg }}
            >
              <ThemedText type="body" className="text-text">
                Password updated. You can go back.
              </ThemedText>
            </View>
          ) : (
            <View
              className="p-5 rounded-2xl mb-6"
              style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg }}
            >
              {error ? (
                <View
                  className="mb-4 p-3 rounded-xl"
                  style={{ backgroundColor: theme.backgroundTertiary }}
                >
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              <LabeledInput
                label="New password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <LabeledInput
                label="Confirm new password"
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <Button
                onPress={handleChangePassword}
                disabled={loading}
                className="w-full mt-1"
              >
                {loading ? "Updating…" : "Update password"}
              </Button>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
