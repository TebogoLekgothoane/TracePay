import React from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button } from "@/components/Button";
import { IconCard } from "@/components/Card";
import { AppText } from "@/components/Typography";

const FEATURES = [
  {
    id: "leaks",
    title: "Leak detection",
    icon: "water-outline" as const,
    color: "#EF4444",
    desc: "Uncover hidden subscriptions, airtime advances and unnecessary charges.",
  },
  {
    id: "budget",
    title: "Smart budgeting",
    icon: "brain" as const,
    color: "#8B5CF6",
    desc: "Get personalised spending insights and weekly guidance.",
  },
  {
    id: "spending",
    title: "Spending clarity",
    icon: "chart-line" as const,
    color: "#3B82F6",
    desc: "See where every rand goes with clear transaction history.",
  },
  {
    id: "control",
    title: "Money control",
    icon: "shield-check-outline" as const,
    color: "#22C55E",
    desc: "Receive simple actions to improve your financial health.",
  },
];

export default function FeaturesScreen() {
  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom"]}
    >
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: 16,
          }}
        >
          <View className="mb-8 mt-2">
            <AppText variant="display">Meet your{"\n"}
               money
               <AppText variant="displayAccent"> guardian</AppText>
            </AppText>

            <AppText variant="lead" className="mt-3">
              TracePay helps you understand, protect and grow your money with
              insights built for South Africans.
            </AppText>
          </View>

          <View className="gap-4">
            {FEATURES.map((feature) => (
              <IconCard
                key={feature.id}
                icon={
                  <MaterialCommunityIcons
                    name={feature.icon}
                    size={26}
                    color={feature.color}
                  />
                }
                title={feature.title}
                description={feature.desc}
                glass={false}
                className="bg-transparent p-0 shadow-none"
                contentClassName="items-start gap-3"
              />
            ))}
          </View>
        </ScrollView>

        <View className="z-10 bg-background px-6 pb-6 pt-4 dark:bg-transparent">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={() => router.push("/(onboarding)/create-account")}
          >
            Protect My Money
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
