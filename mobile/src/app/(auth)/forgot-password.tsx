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

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  /** Fake reset: no backend. Just validate email and show "sent" message. */
  const handleSendReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }
    setError(null);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSent(true);
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
              ← Back to sign in
            </ThemedText>
          </Pressable>

          <View className="items-center mb-6">
            <Image
              source={require("../../assets/trace-pay logo.png")}
              style={{ width: 72, height: 72 }}
              resizeMode="contain"
            />
            <ThemedText type="h1" className="text-text mt-4 mb-2 text-center">
              Forgot password?
            </ThemedText>
            <ThemedText type="body" className="text-text-muted text-center max-w-[280px]">
              Enter the email you use for TracePay and we&apos;ll send you a link to reset your password.
            </ThemedText>
          </View>

          {sent ? (
            <View
              className="p-5 rounded-2xl mb-6"
              style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg }}
            >
              <ThemedText type="body" className="text-text mb-1 font-semibold">
                Check your email
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                We sent a password reset link to {email.trim().toLowerCase()}. If you don&apos;t see it, check spam.
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
                className="w-full"
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
