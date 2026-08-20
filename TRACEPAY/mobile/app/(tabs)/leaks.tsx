import { router } from "expo-router";
import {
  Banknote,
  ChevronLeft,
  CreditCard,
  Download,
  FileText,
  Landmark,
  RefreshCw,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  LeaksSegmentTabsContainer,
  type LeaksTab,
} from "../../src/components/leaks/LeaksSegmentTabs";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { LeaksSummaryCard } from "../../src/components/leaks/LeaksSummaryCard";
import { TakeActionSection } from "../../src/components/leaks/TakeActionSection";
import {
  TopLeakRow,
  type TopLeakItem,
} from "../../src/components/leaks/TopLeakRow";
import { COLORS } from "../../src/theme/colors";

export default function LeaksScreen() {
  const [activeTab, setActiveTab] = useState<LeaksTab>("Overview");
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const topLeaks = useMemo<TopLeakItem[]>(
    () => [
      {
        id: "fees",
        title: "Bank fees",
        description: "Unnecessary bank charges",
        amount: "R712.50",
        percentLabel: "39% of leaks",
        impactLabel: "High impact",
        impact: "high",
        Icon: FileText,
      },
      {
        id: "subs",
        title: "Subscriptions",
        description: "Unused or forgotten subscriptions",
        amount: "R430.00",
        percentLabel: "24% of leaks",
        impactLabel: "Medium impact",
        impact: "mediumWarm",
        Icon: RefreshCw,
      },
      {
        id: "debit",
        title: "Debit orders",
        description: "Could be paused or cancelled",
        amount: "R320.75",
        percentLabel: "18% of leaks",
        impactLabel: "Medium impact",
        impact: "mediumCool",
        Icon: CreditCard,
      },
      {
        id: "airtime",
        title: "Airtime & data",
        description: "Higher than usual spending",
        amount: "R206.15",
        percentLabel: "11% of leaks",
        impactLabel: "Low impact",
        impact: "lowTeal",
        Icon: Banknote,
      },
      {
        id: "atm",
        title: "Cash withdrawals",
        description: "High ATM fees",
        amount: "R150.00",
        percentLabel: "8% of leaks",
        impactLabel: "Low impact",
        impact: "lowBlue",
        Icon: Landmark,
      },
    ],
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-4 flex-row items-center justify-between">
            <Pressable
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-card active:opacity-75"
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </Pressable>

            <Pressable
              accessibilityLabel="Download report"
              className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-card active:opacity-75"
            >
              <Download color={palette.foreground} size={20} strokeWidth={2} />
            </Pressable>
          </View>

          <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
            Leaks
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            We found areas where you&apos;re losing money.
          </Text>

          <View className="mt-5">
            <LeaksSegmentTabsContainer
              active={activeTab}
              onChange={setActiveTab}
            />
          </View>

          <View className="mt-5">
            <LeaksSummaryCard
              total="R1,820.40"
              changeLabel="↑ 18% vs last month"
              spendingPercent="9%"
            />
          </View>

          <View className="mb-3 mt-7 flex-row items-center justify-between">
            <Text className="text-[17px] font-bold text-foreground">
              Your top leaks
            </Text>
            <Pressable className="active:opacity-70">
              <Text className="text-[13px] font-semibold text-primary">
                View all leaks
              </Text>
            </Pressable>
          </View>

          <View className="overflow-hidden rounded-3xl border border-border bg-card">
            {topLeaks.map((item, index) => (
              <TopLeakRow
                key={item.id}
                item={item}
                isLast={index === topLeaks.length - 1}
                onPress={() => router.push(`/leak/${item.id}`)}
              />
            ))}
          </View>

          <View className="mt-7">
            <TakeActionSection />
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
