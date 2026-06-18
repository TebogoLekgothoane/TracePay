import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { TracePayLogo } from "@/components/TracePayLogo";
import { AuthError } from "@/lib/auth-errors";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

export default function AuthScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
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

  return (
    <SafeAreaView className="screen">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="screen-scroll"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-8 gap-2">
            <TracePayLogo size={96} layout="column" />
            <Text className="body-text mt-1">Your money guardian</Text>
          </View>

          <View className="card-lg mb-5">
            <View className="flex-row bg-gray-100 dark:bg-gray-800 rounded-[10px] p-1 mb-6">
              <Button
                variant="ghost"
                className={cn(
                  "flex-1 py-2.5 rounded-lg items-center justify-center",
                  authMode === "signup" && "bg-white dark:bg-gray-700 shadow-sm",
                )}
                onPress={() => {
                  setAuthMode("signup");
                  setError("");
                }}
                textClassName={cn(
                  "text-sm font-medium text-gray-500",
                  authMode === "signup" && "text-strong font-semibold",
                )}
              >
                Create Account
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "flex-1 py-2.5 rounded-lg items-center justify-center",
                  authMode === "signin" && "bg-white dark:bg-gray-700 shadow-sm",
                )}
                onPress={() => {
                  setAuthMode("signin");
                  setError("");
                }}
                textClassName={cn(
                  "text-sm font-medium text-gray-500",
                  authMode === "signin" && "text-strong font-semibold",
                )}
              >
                Sign In
              </Button>
            </View>

            <Text className="heading-lg mb-1.5">
              {authMode === "signup" ? "Create your account" : "Welcome back"}
            </Text>
            <Text className="body-text leading-5 mb-6">
              {authMode === "signup"
                ? "Use your email, password and phone number to create your TracePay account."
                : "Use your email and password to sign back in."}
            </Text>

            <View className="field">
              <Text className="field-label">Email address</Text>
              <View className="input-group">
                <MaterialCommunityIcons name="email-outline" size={18} color="#9CA3AF" />
                <TextInput
                  className="input-field"
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

            <View className="field">
              <Text className="field-label">Password</Text>
              <View className="input-group">
                <MaterialCommunityIcons name="lock-outline" size={18} color="#9CA3AF" />
                <TextInput
                  className="input-field"
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
              <View className="field">
                <Text className="field-label">SA phone number</Text>
                <View className="input-group">
                  <Text className="text-[15px] font-medium text-subtle">+27</Text>
                  <TextInput
                    className="input-field"
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
              <Text className="text-[13px] font-sans text-red-600 mb-3">{error}</Text>
            ) : null}

            <Button
              size="lg"
              fullWidth
              onPress={handleSubmit}
              disabled={!isValid}
              loading={loading}
              className="mt-1"
              iconRight={
                !loading ? (
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                ) : undefined
              }
            >
              {authMode === "signup" ? "Create Account" : "Sign In"}
            </Button>
          </View>

          <View className="flex-row items-center justify-center mb-6">
            <MaterialCommunityIcons name="shield-lock-outline" size={13} color="#9CA3AF" />
            <Text className="caption">
              {" "}
              POPIA compliant · Credentials stored on this device
            </Text>
          </View>

          <View className="gap-3.5">
            {[
              { icon: "magnify-scan", text: "Detect hidden money leaks from your SMS inbox" },
              { icon: "brain", text: "AI budget coach built for South Africa" },
              { icon: "tag-heart-outline", text: "Earn retail discounts by stopping leaks" },
            ].map((f, i) => (
              <View key={i} className="flex-row items-center gap-3">
                <View className="w-[34px] h-[34px] rounded-[10px] bg-brand-purple-light items-center justify-center shrink-0">
                  <MaterialCommunityIcons name={f.icon as "magnify-scan"} size={16} color="#7C3AED" />
                </View>
                <Text className="flex-1 text-sm font-sans text-gray-700 leading-5">{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
