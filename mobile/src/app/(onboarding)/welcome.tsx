import React from "react";
import { View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";

const robotSource = require("@/assets/images/herobot.png");

export default function WelcomeScreen() {
  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom"]}
    >
      <View className="flex-1 px-6">
        {/* Hero image — fills space above bottom copy */}
        <View className="min-h-0 flex-1 items-center justify-center overflow-hidden pt-2">
          <Image
            source={robotSource}
            className="h-full w-full"
            resizeMode="contain"
            style={{ transform: [{ scale: 1.10 }] }}
            accessibilityLabel="TracePay assistant"
          />
        </View>

        {/* Copy + actions — bottom */}
        <View className="shrink-0 pb-8">
          <AppText variant="display">Stop hidden money leaks.</AppText>
          <AppText variant="lead" className="mt-3">
            TracePay scans your bank and mobile SMS for forgotten fees, airtime
            advances, and subscriptions then helps you freeze them and plan
            smarter.
          </AppText>

          <View className="mt-8 gap-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => router.push("/(onboarding)/features")}
            >
              Get Started
            </Button>

            <Button
              variant="outline"
              size="lg"
              fullWidth
              onPress={() => router.push("/(auth)/sign-in")}
            >
              Log In
            </Button>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
