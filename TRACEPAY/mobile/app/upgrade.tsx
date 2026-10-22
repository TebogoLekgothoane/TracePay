import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  BarChart3,
  Bell,
  Bookmark,
  ChevronLeft,
  Gem,
  Lightbulb,
  Search,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../src/components/ui/Button";
import { IconButton } from "../src/components/ui/IconButton";
import { setLeaksUnlocked } from "../src/features/leaks/leak-entitlement.store";
import { ANNUAL_PLAN, totalMonthlyLeaks } from "../src/features/leaks/leak-paywall";
import { listPotentialLeaks } from "../src/features/leaks/potential-leaks";
import { COLORS, withAlpha } from "../src/theme/colors";

type Feature = {
  id: string;
  Icon: LucideIcon;
  tone: "primary" | "warning";
  title: string;
  body: string;
};

function closeUpgrade() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)/leaks");
  }
}

export default function UpgradeScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [purchasing, setPurchasing] = useState(false);
  const leaks = useMemo(() => listPotentialLeaks(), []);
  const total = useMemo(() => totalMonthlyLeaks(leaks), [leaks]);

  const features: Feature[] = [
    {
      id: "all",
      Icon: Search,
      tone: "primary",
      title: `See all ${leaks.length} leaks`,
      body: "View all potential leaks with full details and estimated costs.",
    },
    {
      id: "monitoring",
      Icon: Bell,
      tone: "primary",
      title: "Continuous monitoring",
      body: "We'll keep checking your transactions and alert you onto new leaks, upcoming charges and more, suspicious behaviour and more.",
    },
    {
      id: "guidance",
      Icon: Lightbulb,
      tone: "warning",
      title: "Get guidance",
      body: "Simple steps to reduce or stop each leak.",
    },
    {
      id: "progress",
      Icon: Bookmark,
      tone: "primary",
      title: "Track your progress",
      body: "See how much you've saved over time.",
    },
  ];

  const continueToAnnualPlan = async () => {
    setPurchasing(true);
    // TODO(payments): start the Annual Plan checkout here and only unlock after
    // the purchase is confirmed. Until billing exists this unlocks straight away.
    await setLeaksUnlocked(true);
    setPurchasing(false);
    closeUpgrade();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <IconButton
            accessibilityLabel="Go back"
            className="mb-3 self-start"
            variant="muted"
            onPress={closeUpgrade}
          >
            <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
          </IconButton>

          <View
            className="self-start rounded-full px-2.5 py-1"
            style={{ backgroundColor: withAlpha(palette.primary, 0.14) }}
          >
            <Text className="text-[12px] font-semibold tracking-[0.6px] text-primary">
              UPGRADE
            </Text>
          </View>

          <Text className="mt-3 text-[28px] font-bold tracking-[-0.5px] text-foreground">
            Unlock your full financial picture
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            Get continuous monitoring, detailed leak analysis and personalised guidance to stop
            losing money.
          </Text>

          <View className="mt-5 flex-row items-center gap-3 rounded-3xl border border-border bg-card px-4 py-4">
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl"
            >
              <BarChart3 color={palette.primary} size={20} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] text-muted-foreground">Your estimated total leaks</Text>
              <Text className="mt-1 text-[24px] font-bold tracking-[-0.5px] text-primary">
                {total}
                <Text className="text-[14px] font-medium text-muted-foreground"> / month</Text>
              </Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">
                Based on {leaks.length} potential leaks found in your account.
              </Text>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-border bg-card">
            {features.map((feature, index) => {
              const color = feature.tone === "warning" ? palette.warning : palette.primary;
              return (
                <View
                  key={feature.id}
                  className={`flex-row items-start gap-3 px-4 py-3.5 ${
                    index < features.length - 1 ? "border-b border-border/60" : ""
                  }`}
                >
                  <View
                    className="h-10 w-10 items-center justify-center rounded-2xl"
                  >
                    <feature.Icon color={color} size={18} strokeWidth={2.2} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {feature.title}
                    </Text>
                    <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                      {feature.body}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View className="mt-4 rounded-3xl border border-primary bg-card px-4 py-4">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-2">
                <Gem color={palette.primary} size={18} strokeWidth={2.2} />
                <Text className="text-[15px] font-semibold text-foreground">Annual Plan</Text>
              </View>
              <View className="rounded-full bg-primary px-2.5 py-1">
                <Text className="text-[12px] font-semibold text-primary-foreground">
                  Most popular
                </Text>
              </View>
            </View>

            <Text className="mt-3 text-[30px] font-bold tracking-[-0.6px] text-foreground">
              {ANNUAL_PLAN.price}
              <Text className="text-[16px] font-medium text-muted-foreground"> / year</Text>
            </Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">
              That&apos;s only about {ANNUAL_PLAN.monthlyEquivalent} per month.
            </Text>

            <Button
              arrow
              className="mt-4"
              loading={purchasing}
              onPress={() => void continueToAnnualPlan()}
            >
              Continue to Annual Plan
            </Button>
          </View>

          <Pressable
            accessibilityRole="button"
            className="mt-4 self-center px-4 py-2 active:opacity-70"
            onPress={closeUpgrade}
          >
            <Text className="text-[14px] font-semibold text-primary underline">Maybe later</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
