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
import { useApp } from "@/context/app-context";
import { setBackendToken } from "@/lib/auth-storage";
import { DEMO_USER_ID } from "@/lib/supabase";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { setUserId } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fake sign-in: no backend. Just validate and set a fake token so app goes to home. */
  const handleSignIn = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await setBackendToken("fake");
      setUserId(DEMO_USER_ID);
      router.replace("/(tabs)/home" as any);
    } catch (e) {
      setError("Something went wrong.");
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
            paddingTop: insets.top + Spacing["3xl"],
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mb-8">
            <Image
              source={require("../../assets/trace-pay logo.png")}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
            />
            <ThemedText type="h1" className="text-text mt-4 mb-2 text-center">
              Welcome back
            </ThemedText>
            <ThemedText type="body" className="text-text-muted text-center max-w-[280px]">
              Sign in to TracePay to see your money insights and control your leaks.
            </ThemedText>
          </View>

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
            <LabeledInput
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Pressable
              onPress={() => router.push("/(auth)/forgot-password" as any)}
              className="mb-5 self-end"
            >
              <ThemedText type="small" className="text-primary font-medium">
                Forgot password?
              </ThemedText>
            </Pressable>

            <Button
              onPress={handleSignIn}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </View>

          <View className="flex-row items-center justify-center mt-2">
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
