import React, { useState } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { LabeledInput } from "@/components/labeled-input";
import { Button } from "@/components/ui/button";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: undefined,
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not send reset link. Check your email or try again.";
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
              ← Back to sign in
            </ThemedText>
          </Pressable>

          <View className="mb-10">
            <ThemedText type="h1" className="text-text mb-2">
              Forgot password?
            </ThemedText>
            <ThemedText type="body" className="text-text-muted">
              Enter the email you use for TracePay and we&apos;ll send you a link to reset your password.
            </ThemedText>
          </View>

          {sent ? (
            <View
              className="mb-6 p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundTertiary }}
            >
              <ThemedText type="body" className="text-text mb-1">
                Check your email
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                We sent a password reset link to {email.trim().toLowerCase()}. If you don&apos;t see it, check spam.
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
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={(t) => setEmail(t)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Button
                onPress={handleSendReset}
                disabled={loading}
                className="mt-4"
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
