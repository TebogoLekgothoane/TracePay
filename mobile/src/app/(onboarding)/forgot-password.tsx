import React from "react";
import { View, Image, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const robotSource = require("@/assets/images/robot.png");

export default function ForgotPasswordScreen() {
  const { colors, isDarkColorScheme } = useColorScheme();

  const handleBack = () => {
    router.replace("/(onboarding)");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom", "top"]}
    >
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 16,
          }}
        >
          <Pressable
            onPress={handleBack}
            className={
              isDarkColorScheme
                ? "mb-8 h-10 w-10 items-center justify-center rounded-full bg-white/[0.08]"
                : "mb-6 h-10 w-10 items-center justify-center rounded-full bg-muted"
            }
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather
              name="chevron-left"
              size={22}
              color={isDarkColorScheme ? "#FFFFFF" : colors.foreground}
            />
          </Pressable>

          <View className="relative mb-8 mt-2 min-h-[120px]">
            <Image
              source={robotSource}
              resizeMode="contain"
              className="absolute -right-1 top-0 h-[110px] w-[88px]"
              accessibilityLabel="TracePay assistant"
            />

            <View className="max-w-[72%] pr-2">
              <AppText variant="display">
                Recover your{"\n"}
                <AppText variant="displayAccent">access</AppText>
              </AppText>
              <AppText variant="lead" className="mt-3">
                TracePay now uses your phone number and SMS code to sign you in.
              </AppText>
            </View>
          </View>

          <View className="gap-4">
            <View className="flex-row items-start gap-2 rounded-2xl border border-brand-purple/20 bg-brand-purple-light px-3.5 py-3 dark:border-primary/30 dark:bg-primary/10">
              <MaterialCommunityIcons
                name="cellphone-message"
                size={18}
                color={colors.primary}
              />
              <AppText variant="bodySm" className="flex-1">
                Use the mobile number linked to your TracePay account to receive a fresh OTP.
              </AppText>
            </View>

            <View className="flex-row items-start gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 dark:border-white/10">
              <MaterialCommunityIcons
                name="email-outline"
                size={18}
                color={colors.mutedForeground}
              />
              <AppText variant="bodySm" className="flex-1">
                If you later add a recovery email in your profile, that can be used for support and
                account recovery flows.
              </AppText>
            </View>

            <View className="flex-row items-start gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 dark:border-white/10">
              <MaterialCommunityIcons
                name="lifebuoy"
                size={18}
                color={colors.mutedForeground}
              />
              <AppText variant="bodySm" className="flex-1">
                If you no longer control the original SIM, contact support before switching to a new
                number.
              </AppText>
            </View>
          </View>
        </ScrollView>

        <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={handleBack}
          >
            Back to Phone Sign In
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
