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
import { registerWithBackend } from "@/lib/backend-client";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAccount = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setError("Please enter your email and a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await registerWithBackend(trimmed, password);
      router.replace("/(tabs)/home" as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed. Try again.";
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
          <View className="mb-10">
            <ThemedText type="h1" className="text-text mb-2">
              Create account
            </ThemedText>
            <ThemedText type="body" className="text-text-muted">
              Sign up to TracePay to track your money and stop leaks.
            </ThemedText>
          </View>

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
          <LabeledInput
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <LabeledInput
            label="Confirm password"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Button
            onPress={handleCreateAccount}
            disabled={loading}
            className="mb-6 mt-2"
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>

          <View className="flex-row items-center justify-center">
            <ThemedText type="body" className="text-text-muted mr-1">
              Already have an account?
            </ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="body" className="text-primary font-semibold">
                Sign in
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
