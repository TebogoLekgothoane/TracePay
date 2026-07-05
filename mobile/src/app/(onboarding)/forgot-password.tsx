import React from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function ForgotPasswordScreen() {
  const { colors } = useColorScheme();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom", "top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }}>
        <AppText variant="display">
          Recover your{"\n"}
          <AppText variant="displayAccent">access</AppText>
        </AppText>
        <AppText variant="lead" className="mt-3">
          Sign in with your phone number and password. If you forgot your password, contact support.
        </AppText>

        <View className="mt-6 gap-4">
          <View className="flex-row items-start gap-2 rounded-2xl border border-brand-purple/20 bg-brand-purple-light px-3.5 py-3 dark:border-primary/30 dark:bg-primary/10">
            <MaterialCommunityIcons name="lock-outline" size={18} color={colors.primary} />
            <AppText variant="bodySm" className="flex-1">
              Use the same phone number and password you created during sign-up. No OTP is required for daily sign-in.
            </AppText>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-border px-6 pb-6 pt-4 dark:border-white/10">
        <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={() => router.replace("/(auth)/sign-in")}>
          Sign in with password
        </Button>
      </View>
    </SafeAreaView>
  );
}
