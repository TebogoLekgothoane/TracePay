import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "@/components/Button";
import { AuthError } from "@/lib/auth-errors";
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
  const { colors } = useColorScheme();

  return (
    <View style={[styles.segmentTrack, { backgroundColor: colors.muted }]}>
      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: value === "signup" }}
        onPress={() => onChange("signup")}
        style={[
          styles.segmentButton,
          value === "signup" && { backgroundColor: colors.card },
        ]}
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: value === "signup" ? colors.foreground : colors.mutedForeground },
          ]}
        >
          Create Account
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: value === "signin" }}
        onPress={() => onChange("signin")}
        style={[
          styles.segmentButton,
          value === "signin" && { backgroundColor: colors.card },
        ]}
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: value === "signin" ? colors.foreground : colors.mutedForeground },
          ]}
        >
          Sign In
        </Text>
      </TouchableOpacity>
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
      router.replace("/sms-scanning");
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
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 24,
          }}
        >
          <View className="mb-4 flex-row items-center">
            <View className="flex-1 pr-3">
              <Text className="text-[28px] font-bold leading-[34px] text-foreground">
                {authMode === "signup" ? (
                  <>
                    Create your{"\n"}
                    <Text className="text-brand-purple">account</Text>
                  </>
                ) : (
                  <>
                    Welcome{"\n"}
                    <Text className="text-brand-purple">back</Text>
                  </>
                )}
              </Text>
              <Text className="mt-2 text-sm leading-5 text-muted-foreground">
                {authMode === "signup"
                  ? "Set up TracePay with your email, password and phone."
                  : "Sign in to continue protecting your money."}
              </Text>
            </View>

            <View className="h-[100px] w-[80px] shrink-0 items-center justify-center">
              <Image
                source={robotSource}
                resizeMode="contain"
                style={{ width: 100, height: 200 }}
                accessibilityLabel="TracePay assistant"
              />
            </View>
          </View>

          <AuthModeToggle value={authMode} onChange={switchMode} />

          <View className="gap-3">
            <View>
              <Text className="mb-1.5 text-sm font-semibold text-foreground">Email address</Text>
              <View className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3">
                <MaterialCommunityIcons name="email-outline" size={18} color="#9CA3AF" />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="you@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View>
              <Text className="mb-1.5 text-sm font-semibold text-foreground">Password</Text>
              <View className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3">
                <MaterialCommunityIcons name="lock-outline" size={18} color="#9CA3AF" />
                <TextInput
                  className="flex-1 text-[15px] text-foreground"
                  placeholder="At least 6 characters"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType={authMode === "signup" ? "next" : "done"}
                  onSubmitEditing={authMode === "signin" ? handleSubmit : undefined}
                />
              </View>
            </View>

            {authMode === "signup" && (
              <View>
                <Text className="mb-1.5 text-sm font-semibold text-foreground">SA phone number</Text>
                <View className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3">
                  <Text className="text-[15px] font-medium text-muted-foreground">+27</Text>
                  <TextInput
                    className="flex-1 text-[15px] text-foreground"
                    placeholder="72 123 4567"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </View>
            )}

            {error ? (
              <View className="flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
                <Text className="flex-1 text-sm leading-5 text-red-700 dark:text-red-300">
                  {error}
                </Text>
              </View>
            ) : null}
          </View>

          <Button
            size="lg"
            fullWidth
            className="mt-5 h-14 rounded-[24px]"
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
            <MaterialCommunityIcons name="shield-lock-outline" size={13} color="#9CA3AF" />
            <Text className="ml-1.5 text-xs text-muted-foreground">
              POPIA compliant · Stored securely on this device
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 16,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
