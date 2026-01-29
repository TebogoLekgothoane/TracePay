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
import { loginWithBackend } from "@/lib/backend-client";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await loginWithBackend(trimmed, password);
      router.replace("/(tabs)/home" as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sign in failed. Check your email and password.";
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
              Welcome back
            </ThemedText>
            <ThemedText type="body" className="text-text-muted">
              Sign in to TracePay to see your money insights and control your leaks.
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
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable
            onPress={() => router.push("/(auth)/forgot-password" as any)}
            className="mb-6"
          >
            <ThemedText type="small" className="text-primary">
              Forgot password?
            </ThemedText>
          </Pressable>

          <Button
            onPress={handleSignIn}
            disabled={loading}
            className="mb-4"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <View className="flex-row items-center justify-center mt-4">
            <ThemedText type="body" className="text-text-muted mr-1">
              Don&apos;t have an account?
            </ThemedText>
            <Pressable onPress={() => router.push("/(auth)/register" as any)}>
              <ThemedText type="body" className="text-primary font-semibold">
                Create account
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
