import React, { useState } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { LabeledInput } from "@/components/labeled-input";
import { Button } from "@/components/ui/button";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";
import { supabase } from "@/lib/supabase";

/**
 * Change password screen.
 * Uses Supabase auth when the user has a Supabase session; otherwise shows a message.
 */
export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { error: err } = await supabase.auth.updateUser({ password: newPassword });
        if (err) throw err;
        setSuccess(true);
        setTimeout(() => router.back(), 1500);
      } else {
        setError(
          "Password change is available when signed in with email. " +
          "If you use TracePay backend login only, contact support to reset your password."
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update password. Try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
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
            paddingTop: insets.top + Spacing["4xl"],
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} className="mb-6 self-start">
            <ThemedText type="body" className="text-primary">
              ← Back
            </ThemedText>
          </Pressable>

          <View className="mb-10">
            <ThemedText type="h1" className="text-text mb-2">
              Change password
            </ThemedText>
            <ThemedText type="body" className="text-text-muted">
              Enter your new password below. Use at least 6 characters.
            </ThemedText>
          </View>

          {success ? (
            <View
              className="mb-6 p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundTertiary }}
            >
              <ThemedText type="body" className="text-text">
                Password updated. You can go back.
              </ThemedText>
            </View>
          ) : (
            <>
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
                className="mt-4"
              >
                {loading ? "Updating…" : "Update password"}
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
