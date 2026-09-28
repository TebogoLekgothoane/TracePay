import { router } from "expo-router";
import {
  Banknote,
  CreditCard,
  Download,
  FileText,
  Landmark,
  RefreshCw,
  Store,
  Building2,
  Smartphone,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  LeaksSegmentTabsContainer,
  type LeaksTab,
} from "../../src/components/leaks/LeaksSegmentTabs";
import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { IconButton } from "../../src/components/ui/IconButton";
import { InfoSheet } from "../../src/components/ui/Modal";
import { LeaksSummaryCard } from "../../src/components/leaks/LeaksSummaryCard";
import {
  TopLeakRow,
  type TopLeakItem,
} from "../../src/components/leaks/TopLeakRow";
import { COLORS } from "../../src/theme/colors";

const OVERVIEW_LEAKS: TopLeakItem[] = [
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
];

const CATEGORY_LEAKS: TopLeakItem[] = [
  {
    id: "fees",
    title: "Fees & charges",
    description: "Bank fees and service charges",
    amount: "R862.50",
    percentLabel: "47% of leaks",
    impactLabel: "High impact",
    impact: "high",
    Icon: FileText,
  },
  {
    id: "subs",
    title: "Subscriptions",
    description: "Streaming, software, and memberships",
    amount: "R430.00",
    percentLabel: "24% of leaks",
    impactLabel: "Medium impact",
    impact: "mediumWarm",
    Icon: RefreshCw,
  },
  {
    id: "debit",
    title: "Recurring payments",
    description: "Debit orders still collecting",
    amount: "R320.75",
    percentLabel: "18% of leaks",
    impactLabel: "Medium impact",
    impact: "mediumCool",
    Icon: CreditCard,
  },
  {
    id: "airtime",
    title: "Telecoms",
    description: "Airtime, data, and out-of-bundle",
    amount: "R206.15",
    percentLabel: "11% of leaks",
    impactLabel: "Low impact",
    impact: "lowTeal",
    Icon: Smartphone,
  },
];

const ACCOUNT_LEAKS: TopLeakItem[] = [
  {
    id: "fees",
    title: "FNB Cheque",
    description: "Fees, ATM, and SMS charges",
    amount: "R684.20",
    percentLabel: "38% of leaks",
    impactLabel: "High impact",
    impact: "high",
    Icon: Building2,
  },
  {
    id: "subs",
    title: "Capitec Global One",
    description: "Subscriptions billed here",
    amount: "R498.00",
    percentLabel: "27% of leaks",
    impactLabel: "Medium impact",
    impact: "mediumWarm",
    Icon: Building2,
  },
  {
    id: "debit",
    title: "Standard Bank",
    description: "Debit orders and account fees",
    amount: "R412.40",
    percentLabel: "23% of leaks",
    impactLabel: "Medium impact",
    impact: "mediumCool",
    Icon: Landmark,
  },
  {
    id: "airtime",
    title: "TymeBank",
    description: "Airtime top-ups and withdrawals",
    amount: "R225.80",
    percentLabel: "12% of leaks",
    impactLabel: "Low impact",
    impact: "lowTeal",
    Icon: Banknote,
  },
];

const MERCHANT_LEAKS: TopLeakItem[] = [
  {
    id: "subs",
    title: "Netflix",
    description: "Streaming · billed monthly",
    amount: "R159.00",
    percentLabel: "Subscription",
    impactLabel: "Medium impact",
    impact: "mediumWarm",
    Icon: Store,
  },
  {
    id: "fees",
    title: "FNB monthly fee",
    description: "Account service charge",
    amount: "R165.00",
    percentLabel: "Bank fee",
    impactLabel: "High impact",
    impact: "high",
    Icon: FileText,
  },
  {
    id: "subs",
    title: "Showmax",
    description: "Streaming · rarely used",
    amount: "R99.00",
    percentLabel: "Subscription",
    impactLabel: "Medium impact",
    impact: "mediumWarm",
    Icon: Store,
  },
  {
    id: "debit",
    title: "Virgin Active",
    description: "Gym debit order",
    amount: "R399.00",
    percentLabel: "Debit order",
    impactLabel: "Medium impact",
    impact: "mediumCool",
    Icon: CreditCard,
  },
  {
    id: "airtime",
    title: "Vodacom",
    description: "Airtime & data top-ups",
    amount: "R206.15",
    percentLabel: "Telecoms",
    impactLabel: "Low impact",
    impact: "lowTeal",
    Icon: Smartphone,
  },
  {
    id: "atm",
    title: "Other-bank ATM",
    description: "Cash withdrawal fees",
    amount: "R150.00",
    percentLabel: "ATM fee",
    impactLabel: "Low impact",
    impact: "lowBlue",
    Icon: Landmark,
  },
];

const TAB_CONTENT: Record<
  LeaksTab,
  {
    items: TopLeakItem[];
    sectionTitle: string;
    total: string;
    changeLabel: string;
    spendingPercent: string;
  }
> = {
  Overview: {
    items: OVERVIEW_LEAKS,
    sectionTitle: "Your top leaks",
    total: "R1,820.40",
    changeLabel: "↑ 18% vs last month",
    spendingPercent: "9%",
  },
  "By category": {
    items: CATEGORY_LEAKS,
    sectionTitle: "Leaks by category",
    total: "R1,819.40",
    changeLabel: "↑ 12% vs last month",
    spendingPercent: "9%",
  },
  "By account": {
    items: ACCOUNT_LEAKS,
    sectionTitle: "Leaks by account",
    total: "R1,820.40",
    changeLabel: "↑ 9% vs last month",
    spendingPercent: "9%",
  },
  "By merchant": {
    items: MERCHANT_LEAKS,
    sectionTitle: "Leaks by merchant",
    total: "R1,178.15",
    changeLabel: "Top merchant leaks",
    spendingPercent: "6%",
  },
};

export default function LeaksScreen() {
  const [activeTab, setActiveTab] = useState<LeaksTab>("Overview");
  const [showDownloadInfo, setShowDownloadInfo] = useState(false);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const content = useMemo(() => TAB_CONTENT[activeTab], [activeTab]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-1 flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Leaks
              </Text>
              <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
                We found areas where you&apos;re losing money.
              </Text>
            </View>

            <IconButton
              accessibilityLabel="Download report"
              variant="outline"
              onPress={() => setShowDownloadInfo(true)}
            >
              <Download color={palette.foreground} size={20} strokeWidth={2} />
            </IconButton>
          </View>

          <View className="mt-5">
            <LeaksSegmentTabsContainer
              active={activeTab}
              onChange={setActiveTab}
            />
          </View>

          <View className="mt-5">
            <LeaksSummaryCard
              total={content.total}
              changeLabel={content.changeLabel}
              spendingPercent={content.spendingPercent}
            />
          </View>

          <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
            {content.sectionTitle}
          </Text>

          <View className="overflow-hidden rounded-3xl border border-border bg-card">
            {content.items.map((item, index) => (
              <TopLeakRow
                key={`${activeTab}-${item.id}-${item.title}`}
                item={item}
                isLast={index === content.items.length - 1}
                onPress={() => router.push(`/leak/${item.id}`)}
              />
            ))}
          </View>
        </View>
      </TabScrollView>

      <InfoSheet
        visible={showDownloadInfo}
        title="Leaks report"
        message="PDF export is coming soon. For now, open each leak below to see the breakdown and step-by-step fixes."
        onClose={() => setShowDownloadInfo(false)}
      />
    </SafeAreaView>
  );
}
