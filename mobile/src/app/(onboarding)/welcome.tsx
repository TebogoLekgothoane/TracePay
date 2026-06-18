import React from "react";
import { View, Text, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";

const robotSource = require("@/assets/images/herobot.png");

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="welcome-screen" edges={["left", "right", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-6">
          <Text className="welcome-headline">Stop hidden money leaks.</Text>
          <Text className="welcome-subheadline">
            TracePay scans your bank and mobile SMS for forgotten fees, airtime advances,
            and subscriptions then helps you freeze them and plan smarter.
          </Text>
        </View>

        <View className="welcome-hero-wrap">
          <Image
            source={robotSource}
            className="welcome-hero-image"
            resizeMode="contain"
            accessibilityLabel="TracePay assistant"
          />
        </View>

        <View className="gap-3 pb-8">
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
            onPress={() => router.push({ pathname: "/(onboarding)", params: { mode: "signin" } })}
          >
            Log In
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}