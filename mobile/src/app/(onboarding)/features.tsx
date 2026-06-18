import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { TracePayLogo } from "@/components/TracePayLogo";
import { cn } from "@/lib/cn";

const FEATURES = [
  {
    icon: "magnify-scan" as const,
    color: "#DC2626",
    iconBg: "bg-red-100",
    title: "Detect Money Leaks",
    desc: "Scans your bank and mobile SMS inbox to surface hidden fees, forgotten subscriptions and airtime advances.",
  },
  {
    icon: "brain" as const,
    color: "#7C3AED",
    iconBg: "bg-brand-purple-light",
    title: "AI Budget Coach",
    desc: "Generates a weekly budget from spending patterns, upcoming payments and active leaks.",
  },
  {
    icon: "chart-line" as const,
    color: "#2563EB",
    iconBg: "bg-blue-100",
    title: "Spending History",
    desc: "Every transaction grouped by date so you can see exactly where your money goes each month.",
  },
  {
    icon: "snowflake" as const,
    color: "#16A34A",
    iconBg: "bg-green-100",
    title: "Stop Leaks Instantly",
    desc: "Flag a money leak and get a specific step-by-step action to stop it — no guesswork.",
  },
];

export default function FeaturesScreen() {
  return (
    <SafeAreaView className="screen">

      <View className="onboarding-header">
        <TracePayLogo />
        <View className="step-dots">
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              className={cn(
                "step-dot",
                i === 2 && "step-dot-active",
                i < 2 && "step-dot-done",
              )}
            />
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="screen-scroll-onboarding"
        showsVerticalScrollIndicator={false}
      >
        <Text className="overline-brand mb-2.5">
          STEP 3 OF 5
        </Text>
        <Text className="heading-xl mb-2.5">
          What TracePay does
        </Text>
        <Text className="body-text text-[15px] leading-[22px] mb-7">
          An AI-powered money guardian built for South Africans.
        </Text>

        <View className="gap-3 mb-6">
          {FEATURES.map((f, i) => (
            <View
              key={i}
              className="card flex-row items-start gap-3.5 border border-gray-100 dark:border-gray-700"
            >
              <View className={cn("w-11 h-11 rounded-[11px] justify-center items-center shrink-0", f.iconBg)}>
                <MaterialCommunityIcons name={f.icon} size={22} color={f.color} />
              </View>
              <View className="flex-1 pt-0.5">
                <Text className="text-[15px] font-semibold text-strong mb-1">{f.title}</Text>
                <Text className="body-text leading-[19px]">{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-center">
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#6B7280" />
          <Text className="caption">
            {" "}
            No data sold · SMS read-only · POPIA compliant
          </Text>
        </View>
      </ScrollView>

      <View className="onboarding-footer-row">
        <Button
          variant="outline"
          size="icon"
          className="w-[52px] h-[52px] rounded-[14px]"
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#6B7280" />
        </Button>
        <Button
          flex
          size="lg"
          onPress={() => router.push("/(onboarding)/consent")}
          iconRight={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
        >
          Sounds good
        </Button>
      </View>
    </SafeAreaView>
  );
}
