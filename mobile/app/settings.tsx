import React, { useState } from "react";
import { View, Switch, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { SettingsSection, SettingsRow } from "@/components/settings-section";
import { Spacing } from "@/constants/theme";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { clearBackendAuthToken } from "@/lib/backend-client";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    includeMomoData,
    setIncludeMomoData,
    setAnalysisData,
    setIsAnalysisComplete,
    setFreezeSettings,
    setLanguage,
    airtimeLimit,
    setAirtimeLimitValue,
  } = useApp();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { theme } = useTheme();
  const handleBack = () => router.back();
  const [airtimeLimitInput, setAirtimeLimitInput] = useState(
    airtimeLimit > 0 ? String(airtimeLimit) : "",
  );

  const handleSignOut = async () => {
    if (isSigningOut) return;

    const confirm = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Sign out of this device?",
        "TracePay will forget this phone and clear your local settings. You can reconnect later.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Sign out", style: "destructive", onPress: () => resolve(true) },
        ],
      );
    });

    if (!confirm) return;

    setIsSigningOut(true);
    try {
      await clearBackendAuthToken();
      await supabase.auth.signOut();
      await AsyncStorage.multiRemove([
        "@tracepay_language",
        "@tracepay_freeze",
        "@tracepay_momo",
        "@tracepay_subscriptions",
        "@tracepay_passcode",
        "@tracepay_mobile",
        "@tracepay_backend_token",
        "@tracepay_user_id",
      ]);

      await setLanguage("en");
      await setIncludeMomoData(true);
      await setFreezeSettings({
        pauseDebitOrders: false,
        blockFeeAccounts: false,
        setAirtimeLimit: false,
        cancelSubscriptions: false,
      });
      setAnalysisData(null);
      setIsAnalysisComplete(false);

      router.replace("/(auth)" as any);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ThemedView
      style={{
        flex: 1,
        paddingTop: insets.top + Spacing.sm,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingBottom: Spacing["5xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: Spacing["2xl"],
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
            hitSlop={10}
          >
            <ThemedText type="h2" className="text-text">
              {"<"}
            </ThemedText>
          </Pressable>
          <View>
            <ThemedText type="h2" className="text-text">
              Settings
            </ThemedText>
     
          </View>
        </View>

        {/* Money analysis */}
        <View style={{ marginBottom: Spacing["2xl"] }}>
          <ThemedText type="h3" className="text-text mb-3">
            Money analysis
          </ThemedText>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 20,
              padding: Spacing.lg,
              gap: Spacing.lg,
            }}
          >
            {/* MoMo toggle */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <ThemedText type="body">Include MoMo &amp; airtime data</ThemedText>
                <ThemedText type="small" className="text-text-muted mt-1">
                  Lets TracePay detect airtime drains, MoMo fees, and mobile money leaks.
                </ThemedText>
              </View>
              <Switch value={includeMomoData} onValueChange={setIncludeMomoData} />
            </View>

            {/* Airtime limit */}
            <View>
              <ThemedText type="body">Monthly airtime limit</ThemedText>
              <ThemedText type="small" className="text-text-muted mt-1">
                TracePay warns you when you’re overspending.
              </ThemedText>

              <View
                style={{
                  marginTop: Spacing.sm,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <ThemedText type="body" className="mr-2">
                  R
                </ThemedText>
                <TextInput
                  value={airtimeLimitInput}
                  keyboardType="numeric"
                  onChangeText={(t) => setAirtimeLimitInput(t.replace(/[^0-9]/g, ""))}
                  onBlur={() =>
                    setAirtimeLimitValue(parseInt(airtimeLimitInput || "0", 10))
                  }
                  placeholder="300"
                  placeholderTextColor={theme.textSecondary}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingHorizontal: Spacing.md,
                    paddingVertical: Spacing.sm,
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Leaks & control – pause debit orders, freeze */}
        <View style={{ marginBottom: Spacing["2xl"] }}>
          <ThemedText type="h3" className="text-text mb-3">
            Leaks &amp; control
          </ThemedText>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 20,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <Pressable
              onPress={() => router.push("/pause-control" as any)}
              style={{ paddingVertical: Spacing.lg }}
              className="border-b border-border/60"
            >
              <ThemedText type="body">Pause debit orders</ThemedText>
              <ThemedText type="small" className="text-text-muted mt-1">
                Temporarily stop individual debit orders so they don’t drain your account.
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push("/freeze-control" as any)}
              style={{ paddingVertical: Spacing.lg }}
            >
              <ThemedText type="body">Freeze all</ThemedText>
              <ThemedText type="small" className="text-text-muted mt-1">
                Pause all risky debit orders, block high-fee accounts, and freeze specific accounts.
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Account & security */}
        <View style={{ marginBottom: Spacing["2xl"] }}>
          <ThemedText type="h3" className="text-text mb-3">
            Account &amp; security
          </ThemedText>

          <View
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: 20,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <Pressable
              onPress={() => router.push("/open-banking-link" as any)}
              style={{ paddingVertical: Spacing.lg }}
              className="border-b border-border/60"
            >
              <ThemedText type="body">Link bank (Open Banking)</ThemedText>
              <ThemedText type="small" className="text-text-muted mt-1">
                Connect your bank via Open Banking to sync transactions and run forensics.
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(auth)/change-password" as any)}
              style={{ paddingVertical: Spacing.lg }}
            >
              <ThemedText type="body">Change password</ThemedText>
              <ThemedText type="small" className="text-text-muted">
                Update your PIN or password.
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push("/device-settings" as any)}
              style={{ paddingVertical: Spacing.lg }}
            >
              <ThemedText type="body">Mobile number &amp; device</ThemedText>
              <ThemedText type="small" className="text-text-muted">
                See which phone TracePay is linked to.
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* App experience */}
        <View style={{ marginBottom: Spacing["2xl"] }}>
          <ThemedText type="h3" className="text-text mb-3">
            App experience
          </ThemedText>

          <Pressable
            style={{
              paddingVertical: Spacing.md,
            }}
            className="border-b border-border/60"
            onPress={() => router.push("/language-selection" as any)}
          >
            <ThemedText type="body" className="text-text">
              Language
            </ThemedText>
            <ThemedText type="small" className="text-text-muted mt-1">
              Change the language TracePay uses to explain your money.
            </ThemedText>
          </Pressable>

          <Pressable
            style={{
              paddingVertical: Spacing.md,
            }}
            onPress={() => {
              // Placeholder – wire to native notification settings if needed
            }}
          >
            <ThemedText type="body" className="text-text">
              Notifications (coming soon)
            </ThemedText>
            <ThemedText type="small" className="text-text-muted mt-1">
              Choose if TracePay should nudge you about new leaks.
            </ThemedText>
          </Pressable>
        </View>

        {/* About & data policy */}
        <View>
          <ThemedText type="h3" className="text-text mb-3">
            About
          </ThemedText>
          <ThemedText type="body" className="text-text-muted">
            TracePay helps you understand where your money “died” so you can
            freeze leaks, reroute spend, and take back control.
          </ThemedText>
          <Pressable
            onPress={() => router.push("/policy" as any)}
            style={{
              marginTop: Spacing.lg,
              paddingVertical: Spacing.md,
            }}
          >
            <ThemedText type="body" className="text-primary">
              Read full data ethics & privacy policy
            </ThemedText>
          </Pressable>
        </View>

        {/* Sign out button at bottom */}
        <View
          style={{
            marginTop: Spacing["3xl"],
            paddingVertical: Spacing.md,
          }}
        >
          <Pressable
            onPress={handleSignOut}
            className="rounded-full bg-red-500/10 py-3 items-center justify-center"
          >
            <ThemedText type="button" className="text-red-500">
              {isSigningOut ? "Signing out..." : "Sign out of this device"}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

