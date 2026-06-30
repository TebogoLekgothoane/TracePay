import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  TextInput,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/Button";
import { GlassInput } from "@/components/GlassInput";
import { AppText } from "@/components/Typography";
import { AuthError } from "@/lib/auth-errors";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";

const robotSource = require("@/assets/images/robot.png");

type AuthMode = "signup" | "signin";

function AuthModeToggle({
  value,
  onChange,
}: {
  value: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  const { isDarkColorScheme } = useColorScheme();

  const options: { mode: AuthMode; label: string }[] = [
    { mode: "signup", label: "Create Account" },
    { mode: "signin", label: "Sign In" },
  ];

  return (
    <View
      className={cn(
        "mb-6 flex-row gap-1 rounded-full p-1",
        isDarkColorScheme ? "bg-white/[0.06]" : "bg-muted",
      )}
    >
      {options.map(({ mode, label }) => {
        const selected = value === mode;

        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(mode)}
            className={cn(
              "flex-1 items-center rounded-full py-3",
              selected &&
                (isDarkColorScheme
                  ? "border border-primary/50 bg-white/[0.14]"
                  : "border border-brand-purple/30 bg-card shadow-sm"),
            )}
          >
            <AppText
              variant="bodySm"
              className={cn(
                "font-semibold",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
      <AppText variant="bodySm" className="flex-1 text-red-700 dark:text-red-300">
        {message}
      </AppText>
    </View>
  );
}

export default function AuthScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { signUp, signIn } = useProfileStore();
  const { colors } = useColorScheme();

  const normalizedEmail = email.trim().toLowerCase();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const isValidPassword = password.length >= 6;
  const isValidPhone = phone.replace(/\s/g, "").length >= 9;
  const isValid = isValidEmail && isValidPassword && (authMode === "signin" || isValidPhone);

  useEffect(() => {
    if (modeParam === "signin") setAuthMode("signin");
  }, [modeParam]);

  const handleSubmit = async () => {
    if (!isValid) return;
    setError("");
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\s/g, "").startsWith("0")
        ? "+27" + phone.replace(/\s/g, "").slice(1)
        : phone.replace(/\s/g, "");

      if (authMode === "signup") {
        await signUp(normalizedEmail, password, cleanPhone);
      } else {
        await signIn(normalizedEmail, password);
      }
      router.replace({ pathname: "/(tabs)/sms-scanning", params: { fromOnboarding: "1" } });
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setError("");
  }, []);

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 100,
              paddingBottom: 16,
            }}
          >
            {/* Hero — full-width copy, robot tucked top-right */}
            <View className="relative mb-8 mt-4 min-h-[130px]">
              <Image
                source={robotSource}
                resizeMode="contain"
                className="absolute -right-1 top-0 h-[120px] w-[120px]"
                accessibilityLabel="TracePay assistant"
              />

              <View className="max-w-[72%] pr-2">
                <AppText variant="display">
                  {authMode === "signup" ? (
                    <>
                      Create your{"\n"}
                      <AppText variant="displayAccent">account</AppText>
                    </>
                  ) : (
                    <>
                      Welcome{"\n"}
                      <AppText variant="displayAccent">back</AppText>
                    </>
                  )}
                </AppText>
                <AppText variant="lead" className="mt-3">
                  {authMode === "signup"
                    ? "Set up TracePay with your email, password and phone."
                    : "Sign in to continue protecting your money."}
                </AppText>
              </View>
            </View>

            <AuthModeToggle value={authMode} onChange={switchMode} />

            <View className="gap-5">
              <View>
                <AppText variant="label" className="mb-2">
                  Email address
                </AppText>
                <GlassInput>
                  <MaterialCommunityIcons
                    name="email-outline"
                    size={18}
                    color={colors.mutedForeground}
                  />
                  <TextInput
                    className="flex-1 py-0.5 text-[15px] text-foreground"
                    placeholder="you@example.com"
                    placeholderTextColor={colors.mutedForeground}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                  />
                </GlassInput>
              </View>

              <View>
                <View className="mb-2 flex-row items-center justify-between gap-3">
                  <AppText variant="label">Password</AppText>
                  {authMode === "signin" ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(onboarding)/forgot-password",
                          params: email ? { email: normalizedEmail } : undefined,
                        })
                      }
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <AppText variant="bodySm" className="font-semibold text-brand-purple">
                        Forgot password?
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
                <GlassInput>
                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={18}
                    color={colors.mutedForeground}
                  />
                  <TextInput
                    className="flex-1 py-0.5 text-[15px] text-foreground"
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    returnKeyType={authMode === "signup" ? "next" : "done"}
                    onSubmitEditing={authMode === "signin" ? handleSubmit : undefined}
                  />
                </GlassInput>
              </View>

              {authMode === "signup" ? (
                <View>
                  <AppText variant="label" className="mb-2">
                    SA phone number
                  </AppText>
                  <GlassInput>
                    <MaterialCommunityIcons
                      name="phone-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                    <AppText variant="body" className="shrink-0 font-medium text-muted-foreground">
                      +27
                    </AppText>
                    <TextInput
                      className="min-w-0 flex-1 py-0.5 text-[15px] text-foreground"
                      placeholder="72 123 4567"
                      placeholderTextColor={colors.mutedForeground}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                  </GlassInput>
                </View>
              ) : null}

              {error ? <AuthErrorBanner message={error} /> : null}
            </View>
          </ScrollView>

          <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
            <Button
              size="lg"
              fullWidth
              className="h-14 rounded-[24px]"
              onPress={handleSubmit}
              disabled={!isValid}
              loading={loading}
              iconRight={
                !loading ? (
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                ) : undefined
              }
            >
              {authMode === "signup" ? "Create Account" : "Sign In"}
            </Button>

            <View className="mt-4 flex-row items-center justify-center">
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={13}
                color={colors.mutedForeground}
              />
              <AppText variant="caption" className="ml-1.5 text-center">
                POPIA compliant · Stored securely on this device
              </AppText>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
