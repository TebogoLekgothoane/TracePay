
import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "@/components/Button";
import { IconCard } from "@/components/Card";
import {
  OnboardingHeader,
  ONBOARDING_STEPS,
} from "@/components/OnboardingHeader";
import { cn } from "@/lib/cn";

const FEATURES = [
  {
    icon: "water-outline",
    color: "#EF4444",
    title: "Spot Money Leaks",
    desc: "Uncover hidden subscriptions, airtime advances and unnecessary charges.",
  },
  {
    icon: "brain",
    color: "#8B5CF6",
    title: "Smart Budgeting",
    desc: "Get personalised spending insights and weekly guidance.",
  },
  {
    icon: "chart-line",
    color: "#3B82F6",
    title: "Understand Your Spending",
    desc: "See where every rand goes with clear transaction history.",
  },
  {
    icon: "shield-check-outline",
    color: "#22C55E",
    title: "Take Control",
    desc: "Receive simple actions to improve your financial health.",
  },
];


export default function FeaturesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 32,
        }}
      >
        <OnboardingHeader currentStep={ONBOARDING_STEPS.features} />

        {/* Hero */}
        <View className="mb-8 mt-2">
          <Text className="text-[35px] font-bold leading-[46px] text-foreground">
            Meet your{"\n"}
            money{" "}
            <Text className="text-brand-purple">
              guardian
            </Text>
          </Text>

          <Text className="mt-3 text-base leading-6 text-muted-foreground">
            TracePay helps you understand, protect and grow your money with
            insights built for South Africans.
          </Text>
        </View>

        {/* Feature cards */}
        <View className="gap-4 align">
          {FEATURES.map((feature) => (
            <IconCard
              key={feature.title}
              title={feature.title}
              description={feature.desc}
              icon={
                <View
                  className={cn(
                    "h-14 w-14 items-center justify-center rounded-2xl",
                    feature.iconBg,
                  )}
                >
                  <MaterialCommunityIcons
                    name={feature.icon}
                    size={26}
                    color={feature.color}
                  />
                </View>
              }
            />
          ))}
        </View>

        {/* Privacy section */}
        <View className="mt-10 items-center">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={22}
              color="#7C3AED"
            />
          </View>

          <Text className="mt-4 text-base font-semibold text-foreground">
            Your privacy comes first
          </Text>

          <Text className="mt-3 px-6 text-center text-sm leading-6 text-muted-foreground">
            TracePay never sells your data. SMS access is read-only and your
            information stays protected and POPIA compliant.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View className=" bg-background px-6 pb-6 pt-4">
        <View className="flex-row items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-[54px] w-[54px] rounded-2xl"
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={20}
              color="#6B7280"
            />
          </Button>

          <Button
            flex
            size="lg"
            className="h-14 flex-1 rounded-[24px]"
            onPress={() => router.push("/(onboarding)/consent")}
            iconRight={
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color="#FFFFFF"
              />
            }
          >
            Protect My Money
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

