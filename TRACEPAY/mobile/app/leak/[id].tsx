import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  EllipsisVertical,
  FileText,
  HelpCircle,
  Info,
  Landmark,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Smartphone,
  Store,
  Wallet,
  Wifi,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { FixActionsList } from "../../src/components/leaks/FixActionsList";
import {
  LeakContentTabs,
  type LeakContentTab,
} from "../../src/components/leaks/LeakContentTabs";
import { getFixContent } from "../../src/features/leaks/fixContent";
import {
  COLORS,
  TRACEPAY,
  type ImpactTone,
  getImpactToneStyles,
  withAlpha,
} from "../../src/theme/colors";

const PERIODS = ["This month", "Last month", "3 months", "Custom"] as const;
type Period = (typeof PERIODS)[number];

type BreakdownItem = {
  id: string;
  title: string;
  description: string;
  amount: string;
  percent: string;
  Icon: LucideIcon;
};

type SubscriptionItem = {
  id: string;
  name: string;
  category: string;
  billing: string;
  amount: string;
  status: "Active" | "Inactive";
  mark: string;
  markColor: string;
};

type ActionItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  Icon: LucideIcon;
};

type RecommendedAction = {
  id: string;
  title: string;
  description: string;
  button: string;
  Icon: LucideIcon;
};

type LeakDetail = {
  title: string;
  subtitle: string;
  HeaderIcon: LucideIcon;
  impact: ImpactTone;
  amount: string;
  onLabel: string;
  changeLabel: string;
  percentOfLeaks: string;
  variant: "breakdown" | "subscriptions";
  listSectionTitle?: string;
  breakdown?: BreakdownItem[];
  didYouKnow?: string;
  stopLeaks?: ActionItem[];
  subscriptions?: SubscriptionItem[];
  savingsAmount?: string;
  recommended?: RecommendedAction[];
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButton: string;
};

const LEAK_DETAILS: Record<string, LeakDetail> = {
  fees: {
    title: "Bank fees",
    subtitle: "Unnecessary bank charges",
    HeaderIcon: FileText,
    impact: "high",
    amount: "R712.50",
    onLabel: "on bank fees",
    changeLabel: "↑ 18% vs last month",
    percentOfLeaks: "39%",
    variant: "breakdown",
    breakdown: [
      {
        id: "monthly",
        title: "Monthly account fee",
        description: "Recurring monthly charge",
        amount: "R165.00",
        percent: "23%",
        Icon: Calendar,
      },
      {
        id: "service",
        title: "Service fees",
        description: "General account charges",
        amount: "R248.40",
        percent: "35%",
        Icon: CreditCard,
      },
      {
        id: "atm",
        title: "ATM fees",
        description: "Cash withdrawals",
        amount: "R154.50",
        percent: "22%",
        Icon: Landmark,
      },
      {
        id: "sms",
        title: "SMS notifications",
        description: "Transaction alerts",
        amount: "R72.00",
        percent: "10%",
        Icon: MessageSquare,
      },
      {
        id: "other",
        title: "Other fees",
        description: "Miscellaneous charges",
        amount: "R72.60",
        percent: "10%",
        Icon: MoreHorizontal,
      },
    ],
    didYouKnow:
      "Did you know? You could save up to R712.50 this month by eliminating these unnecessary charges.",
    stopLeaks: [
      {
        id: "account",
        title: "Switch to a lower-fee account",
        description: "You could pay less or nothing monthly.",
        link: "Compare accounts",
        Icon: Wallet,
      },
      {
        id: "atm",
        title: "Use free ATM networks",
        description: "Withdraw from bank ATMs to avoid fees.",
        link: "View free ATMs",
        Icon: Landmark,
      },
      {
        id: "sms",
        title: "Reduce SMS notifications",
        description: "Use app notifications instead of SMS.",
        link: "Manage alerts",
        Icon: MessageSquare,
      },
      {
        id: "services",
        title: "Review account services",
        description: "Turn off services you don't use.",
        link: "Review services",
        Icon: CreditCard,
      },
    ],
    ctaTitle: "Take action and save",
    ctaSubtitle: "Stop unnecessary bank fees now",
    ctaButton: "Fix now",
  },
  subs: {
    title: "Subscriptions",
    subtitle: "Unused or forgotten subscriptions",
    HeaderIcon: RefreshCw,
    impact: "mediumWarm",
    amount: "R430.00",
    onLabel: "on subscriptions",
    changeLabel: "↓ 8% vs last month",
    percentOfLeaks: "24%",
    variant: "subscriptions",
    subscriptions: [
      {
        id: "netflix",
        name: "Netflix",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R159.00",
        status: "Active",
        mark: "N",
        markColor: "destructive",
      },
      {
        id: "showmax",
        name: "Showmax",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R99.00",
        status: "Active",
        mark: "S",
        markColor: "primary",
      },
      {
        id: "spotify",
        name: "Spotify Premium",
        category: "Music",
        billing: "Billed monthly",
        amount: "R69.00",
        status: "Active",
        mark: "♪",
        markColor: "success",
      },
      {
        id: "adobe",
        name: "Adobe Acrobat",
        category: "Productivity",
        billing: "Billed yearly",
        amount: "R519.00",
        status: "Inactive",
        mark: "A",
        markColor: "destructive",
      },
      {
        id: "canva",
        name: "Canva Pro",
        category: "Design",
        billing: "Billed yearly",
        amount: "R599.00",
        status: "Inactive",
        mark: "C",
        markColor: "secondary",
      },
    ],
    savingsAmount: "R430.00",
    recommended: [
      {
        id: "cancel",
        title: "Cancel unused subscriptions",
        description: "Save up to R430.00",
        button: "Review and cancel",
        Icon: RefreshCw,
      },
      {
        id: "limits",
        title: "Set spending limits",
        description: "Avoid future unnecessary subscriptions",
        button: "Set limits",
        Icon: Wallet,
      },
      {
        id: "alerts",
        title: "Get spending alerts",
        description: "Be notified of new subscriptions",
        button: "Turn on alerts",
        Icon: MessageSquare,
      },
    ],
    ctaTitle: "Take control of your subscriptions",
    ctaSubtitle: "Stop paying for what you don't use",
    ctaButton: "Take action",
  },
  debit: {
    title: "Debit orders",
    subtitle: "Could be paused or cancelled",
    HeaderIcon: Calendar,
    impact: "mediumCool",
    amount: "R320.75",
    onLabel: "on debit orders",
    changeLabel: "↑ 5% vs last month",
    percentOfLeaks: "18%",
    variant: "subscriptions",
    listSectionTitle: "Your debit orders",
    subscriptions: [
      {
        id: "dstv",
        name: "DSTV Premium",
        category: "Entertainment",
        billing: "Billed monthly",
        amount: "R899.00",
        status: "Active",
        mark: "D",
        markColor: "primary",
      },
      {
        id: "gym",
        name: "Gym membership",
        category: "Health",
        billing: "Billed monthly",
        amount: "R450.00",
        status: "Active",
        mark: "G",
        markColor: "success",
      },
      {
        id: "insurance",
        name: "Insurance premium",
        category: "Insurance",
        billing: "Billed monthly",
        amount: "R320.75",
        status: "Active",
        mark: "I",
        markColor: "secondary",
      },
    ],
    savingsAmount: "R320.75",
    recommended: [
      {
        id: "pause",
        title: "Pause unused debit orders",
        description: "Save up to R320.75",
        button: "Review and pause",
        Icon: Calendar,
      },
      {
        id: "limits",
        title: "Set spending limits",
        description: "Avoid future unnecessary debits",
        button: "Set limits",
        Icon: Wallet,
      },
    ],
    ctaTitle: "Manage your debit orders",
    ctaSubtitle: "Pause or cancel what you don't need",
    ctaButton: "Manage debit orders",
  },
  airtime: {
    title: "Airtime & data",
    subtitle: "Higher than usual spending",
    HeaderIcon: Banknote,
    impact: "lowTeal",
    amount: "R206.15",
    onLabel: "on airtime & data",
    changeLabel: "↑ 12% vs last month",
    percentOfLeaks: "11%",
    variant: "breakdown",
    breakdown: [
      {
        id: "data",
        title: "Mobile data",
        description: "Monthly bundles & top-ups",
        amount: "R99.00",
        percent: "48%",
        Icon: Wifi,
      },
      {
        id: "airtime",
        title: "Airtime purchases",
        description: "Prepaid top-ups",
        amount: "R67.15",
        percent: "33%",
        Icon: Smartphone,
      },
      {
        id: "out-of-bundle",
        title: "Out-of-bundle",
        description: "Extra data usage charges",
        amount: "R40.00",
        percent: "19%",
        Icon: MoreHorizontal,
      },
    ],
    didYouKnow:
      "Did you know? You could save up to R206.15 this month by switching to a better data bundle and reducing ad-hoc top-ups.",
    stopLeaks: [
      {
        id: "bundle",
        title: "Switch to a better data bundle",
        description: "Match your bundle to actual usage.",
        link: "Compare bundles",
        Icon: Wifi,
      },
      {
        id: "wifi",
        title: "Use Wi-Fi where possible",
        description: "Cut down on mobile data usage.",
        link: "See data tips",
        Icon: Smartphone,
      },
      {
        id: "alerts",
        title: "Set data usage alerts",
        description: "Get warned before you overspend.",
        link: "Turn on alerts",
        Icon: MessageSquare,
      },
    ],
    ctaTitle: "Cut airtime & data costs",
    ctaSubtitle: "Small changes add up quickly",
    ctaButton: "Fix now",
  },
  atm: {
    title: "Cash withdrawals",
    subtitle: "High ATM fees",
    HeaderIcon: Landmark,
    impact: "lowBlue",
    amount: "R150.00",
    onLabel: "on cash withdrawals",
    changeLabel: "↑ 22% vs last month",
    percentOfLeaks: "8%",
    variant: "breakdown",
    breakdown: [
      {
        id: "other-bank",
        title: "Other bank ATMs",
        description: "Withdrawals at non-home ATMs",
        amount: "R85.00",
        percent: "57%",
        Icon: Landmark,
      },
      {
        id: "retail",
        title: "Retail cash backs",
        description: "Cash at till points",
        amount: "R35.00",
        percent: "23%",
        Icon: Store,
      },
      {
        id: "balance",
        title: "Balance enquiries",
        description: "Paid balance checks",
        amount: "R30.00",
        percent: "20%",
        Icon: HelpCircle,
      },
    ],
    didYouKnow:
      "Did you know? You could save up to R150.00 this month by using your bank's ATMs and skipping paid balance enquiries.",
    stopLeaks: [
      {
        id: "home-atm",
        title: "Use your bank's ATMs",
        description: "Avoid fees at other bank machines.",
        link: "Find free ATMs",
        Icon: Landmark,
      },
      {
        id: "cashback",
        title: "Get cash back at stores",
        description: "Often cheaper than ATM withdrawals.",
        link: "View options",
        Icon: Store,
      },
      {
        id: "card",
        title: "Pay by card instead",
        description: "Reduce the need for cash altogether.",
        link: "See card tips",
        Icon: CreditCard,
      },
    ],
    ctaTitle: "Reduce withdrawal fees",
    ctaSubtitle: "Keep more of your cash",
    ctaButton: "Fix now",
  },
};

function ReceiptIllustration({ accent, primary }: { accent: string; primary: string }) {
  return (
    <Svg width={92} height={88} viewBox="0 0 92 88">
      <Rect x="18" y="8" width="56" height="72" rx="8" fill={withAlpha(accent, 0.25)} />
      <Rect x="26" y="18" width="32" height="4" rx="2" fill={withAlpha(primary, 0.5)} />
      <Rect x="26" y="28" width="40" height="3" rx="1.5" fill={withAlpha(primary, 0.35)} />
      <Rect x="26" y="36" width="36" height="3" rx="1.5" fill={withAlpha(primary, 0.35)} />
      <Circle cx="62" cy="62" r="14" fill={withAlpha(accent, 0.35)} />
      <Circle cx="62" cy="62" r="8" fill={accent} />
    </Svg>
  );
}

function SubscriptionBoxIllustration({
  accent,
  primary,
}: {
  accent: string;
  primary: string;
}) {
  return (
    <Svg width={92} height={88} viewBox="0 0 92 88">
      <Path d="M16 34 L46 18 L76 34 V68 C76 72 73 74 69 74 H23 C19 74 16 72 16 68 Z" fill={withAlpha(accent, 0.3)} />
      <Rect x="28" y="8" width="16" height="16" rx="4" fill={primary} />
      <Rect x="52" y="12" width="14" height="14" rx="3" fill={accent} />
      <Circle cx="40" cy="52" r="8" fill={withAlpha(primary, 0.55)} />
      <Circle cx="58" cy="48" r="7" fill={withAlpha(accent, 0.65)} />
    </Svg>
  );
}

function DebitCalendarIllustration({
  accent,
  primary,
}: {
  accent: string;
  primary: string;
}) {
  return (
    <Svg width={92} height={88} viewBox="0 0 92 88">
      <Rect x="20" y="14" width="52" height="60" rx="10" fill={withAlpha(accent, 0.25)} />
      <Rect x="20" y="14" width="52" height="16" rx="10" fill={accent} />
      <Circle cx="32" cy="40" r="4" fill={withAlpha(primary, 0.5)} />
      <Circle cx="46" cy="40" r="4" fill={withAlpha(primary, 0.5)} />
      <Circle cx="60" cy="40" r="4" fill={withAlpha(primary, 0.5)} />
      <Circle cx="32" cy="54" r="4" fill={withAlpha(primary, 0.35)} />
      <Circle cx="46" cy="54" r="4" fill={primary} />
      <Circle cx="60" cy="54" r="4" fill={withAlpha(primary, 0.35)} />
    </Svg>
  );
}

function AirtimeIllustration({ accent, primary }: { accent: string; primary: string }) {
  return (
    <Svg width={92} height={88} viewBox="0 0 92 88">
      <Rect x="28" y="10" width="36" height="68" rx="10" fill={withAlpha(accent, 0.25)} />
      <Rect x="36" y="18" width="20" height="4" rx="2" fill={withAlpha(primary, 0.45)} />
      <Circle cx="46" cy="68" r="5" fill={withAlpha(primary, 0.35)} />
      <Path
        d="M46 28 C52 34 56 40 56 48 C56 56 52 62 46 68"
        stroke={accent}
        strokeWidth={3}
        fill="none"
      />
      <Path
        d="M38 32 C42 36 44 40 44 46 C44 52 42 56 38 60"
        stroke={withAlpha(accent, 0.55)}
        strokeWidth={2.5}
        fill="none"
      />
      <Path
        d="M54 32 C58 36 60 40 60 46 C60 52 58 56 54 60"
        stroke={withAlpha(accent, 0.55)}
        strokeWidth={2.5}
        fill="none"
      />
    </Svg>
  );
}

function AtmIllustration({ accent, primary }: { accent: string; primary: string }) {
  return (
    <Svg width={92} height={88} viewBox="0 0 92 88">
      <Rect x="18" y="14" width="56" height="62" rx="10" fill={withAlpha(accent, 0.25)} />
      <Rect x="28" y="24" width="36" height="18" rx="4" fill={withAlpha(primary, 0.35)} />
      <Rect x="34" y="48" width="24" height="6" rx={3} fill={accent} />
      <Rect x="38" y="58" width="16" height="10" rx={2} fill={withAlpha(primary, 0.45)} />
      <Circle cx="46" cy="33" r="4" fill={accent} />
    </Svg>
  );
}

function PeriodTabs({
  active,
  onChange,
  toneColor,
}: {
  active: Period;
  onChange: (period: Period) => void;
  toneColor: string;
}) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
      >
        {PERIODS.map((period) => {
          const selected = period === active;

          if (selected) {
            return (
              <Pressable key={period} onPress={() => onChange(period)}>
                <View
                  className="rounded-full px-4 py-2.5"
                  style={{ backgroundColor: toneColor }}
                >
                  <Text
                    style={{ color: trace.primaryForeground }}
                    className="text-[13px] font-semibold"
                  >
                    {period}
                  </Text>
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={period}
              onPress={() => onChange(period)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
            >
              <Text className="text-[13px] font-medium text-muted-foreground">
                {period}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function resolveMarkColor(
  palette: {
    destructive: string;
    primary: string;
    success: string;
    blue: string;
  },
  key: SubscriptionItem["markColor"],
) {
  if (key === "destructive") return palette.destructive;
  if (key === "primary") return palette.primary;
  if (key === "success") return palette.success;
  return palette.blue;
}

export default function LeakDetailScreen() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const [period, setPeriod] = useState<Period>("This month");
  const [contentTab, setContentTab] = useState<LeakContentTab>("Breakdown");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];

  const detail = LEAK_DETAILS[id ?? ""] ?? LEAK_DETAILS.fees;
  const tone = getImpactToneStyles(scheme, detail.impact);
  const isCompact = view === "summary" && id === "fees";
  const hasContentTabs = detail.variant === "breakdown" && !isCompact;
  const fixContent = getFixContent(id ?? "fees");
  const listTitle = detail.listSectionTitle ?? "Your subscriptions";

  const heroSurface = useMemo(
    () =>
      scheme === "dark"
        ? withAlpha(tone.color, 0.16)
        : withAlpha(tone.color, 0.1),
    [scheme, tone.color],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-4 flex-row items-start justify-between">
            <Pressable
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              className="mr-3 mt-1 h-10 w-10 items-center justify-center rounded-xl bg-muted active:opacity-75"
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </Pressable>

            <View className="min-w-0 flex-1 flex-row items-start gap-3">
              <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: tone.surface }}
              >
                <detail.HeaderIcon color={tone.color} size={22} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-[24px] font-bold text-foreground">
                    {detail.title}
                  </Text>
                  {isCompact ? (
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: tone.surface }}
                    >
                      <Text
                        className="text-[10px] font-semibold"
                        style={{ color: tone.color }}
                      >
                        High impact
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  {detail.subtitle}
                </Text>
              </View>
            </View>

            <Pressable className="mt-1 h-10 w-10 items-center justify-center rounded-full active:opacity-75">
              <HelpCircle color={palette.placeholder} size={20} strokeWidth={2} />
            </Pressable>
          </View>

          <PeriodTabs active={period} onChange={setPeriod} toneColor={tone.color} />

          {hasContentTabs ? (
            <View className="mt-5">
              <LeakContentTabs active={contentTab} onChange={setContentTab} />
            </View>
          ) : null}

          {isCompact ? (
            <View className="mt-5 flex-row gap-3">
              {[
                { label: "You paid", value: detail.amount },
                { label: "vs last month", value: "+18%" },
                { label: "Frequency", value: "Monthly" },
              ].map((stat) => (
                <View
                  key={stat.label}
                  className="flex-1 rounded-2xl bg-muted p-3"
                >
                  <Text className="text-[11px] text-muted-foreground">
                    {stat.label}
                  </Text>
                  <Text className="mt-1 text-[15px] font-bold text-foreground">
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View
              className="mt-5 overflow-hidden rounded-3xl p-5"
              style={{ backgroundColor: heroSurface }}
            >
              <View className="flex-row">
                <View className="flex-1 pr-2">
                  <Text className="text-[13px] text-muted-foreground">
                    {detail.variant === "subscriptions" ? "You're paying" : "You leaked"}
                  </Text>
                  <Text className="mt-1 text-[34px] font-bold tracking-[-0.8px] text-foreground">
                    {detail.amount}
                  </Text>
                  <Text className="mt-1 text-[13px] text-muted-foreground">
                    {detail.onLabel}
                  </Text>
                  <View
                    className="mt-2 self-start rounded-full px-3 py-1"
                    style={{ backgroundColor: withAlpha(tone.color, 0.14) }}
                  >
                    <Text
                      className="text-[12px] font-semibold"
                      style={{ color: tone.color }}
                    >
                      {detail.changeLabel}
                    </Text>
                  </View>
                  <Text className="mt-3 text-[12px] text-muted-foreground">
                    That&apos;s{" "}
                    <Text className="font-bold" style={{ color: tone.color }}>
                      {detail.percentOfLeaks}
                    </Text>{" "}
                    of your total leaks
                  </Text>
                  <Pressable className="mt-2 flex-row items-center gap-1 active:opacity-75">
                    <Info color={palette.mutedForeground} size={13} strokeWidth={2} />
                    <Text className="text-[12px] font-medium text-muted-foreground">
                      How we calculate
                    </Text>
                  </Pressable>
                </View>

                <View className="justify-center">
                  {detail.variant === "breakdown" ? (
                    id === "airtime" ? (
                      <AirtimeIllustration accent={tone.color} primary={palette.primary} />
                    ) : id === "atm" ? (
                      <AtmIllustration accent={tone.color} primary={palette.primary} />
                    ) : (
                      <ReceiptIllustration accent={tone.color} primary={palette.primary} />
                    )
                  ) : id === "debit" ? (
                    <DebitCalendarIllustration
                      accent={tone.color}
                      primary={palette.primary}
                    />
                  ) : (
                    <SubscriptionBoxIllustration
                      accent={tone.color}
                      primary={palette.primary}
                    />
                  )}
                </View>
              </View>
            </View>
          )}

          {detail.variant === "breakdown" && detail.breakdown ? (
            <>
              {hasContentTabs && contentTab === "How to fix" ? (
                <View className="mt-6">
                  <FixActionsList
                    leakId={id ?? "fees"}
                    sections={fixContent.sections}
                    impact={fixContent.impact}
                  />
                </View>
              ) : null}

              {hasContentTabs && contentTab === "Insights" ? (
                <>
                  {detail.didYouKnow ? (
                    <View
                      className="mt-6 flex-row items-center gap-3 rounded-3xl p-4"
                      style={{ backgroundColor: palette.surfaceSoft }}
                    >
                      <Text className="flex-1 text-[13px] leading-5 text-foreground">
                        {detail.didYouKnow}
                      </Text>
                      <ReceiptIllustration accent={tone.color} primary={palette.primary} />
                    </View>
                  ) : null}
                  {detail.stopLeaks ? (
                    <View className="mt-4 gap-2">
                      {detail.stopLeaks.map((item) => (
                        <View
                          key={item.id}
                          className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
                        >
                          <View
                            className="h-10 w-10 items-center justify-center rounded-xl"
                            style={{ backgroundColor: tone.surface }}
                          >
                            <item.Icon color={tone.color} size={18} strokeWidth={2.2} />
                          </View>
                          <View className="min-w-0 flex-1">
                            <Text className="text-[14px] font-semibold text-foreground">
                              {item.title}
                            </Text>
                            <Text className="mt-0.5 text-[12px] text-muted-foreground">
                              {item.description}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}

              {(!hasContentTabs || contentTab === "Breakdown") ? (
                <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                Breakdown
              </Text>
              <View className="gap-2">
                {detail.breakdown.map((item) => (
                  <Pressable
                    key={item.id}
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: tone.surface }}
                    >
                      <item.Icon color={tone.color} size={18} strokeWidth={2.2} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold text-foreground">
                        {item.title}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {item.description}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[14px] font-bold text-foreground">
                        {item.amount}
                      </Text>
                      <Text
                        className="mt-0.5 text-[11px] font-semibold"
                        style={{ color: tone.color }}
                      >
                        {item.percent}
                      </Text>
                    </View>
                    <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                  </Pressable>
                ))}
              </View>

              {!isCompact && !hasContentTabs && detail.didYouKnow ? (
                <View
                  className="mt-4 flex-row items-center gap-3 rounded-3xl p-4"
                  style={{ backgroundColor: palette.surfaceSoft }}
                >
                  <Text className="flex-1 text-[13px] leading-5 text-foreground">
                    {detail.didYouKnow}
                  </Text>
                  <ReceiptIllustration accent={tone.color} primary={palette.primary} />
                </View>
              ) : null}

              {!isCompact && !hasContentTabs && detail.stopLeaks ? (
                <>
                  <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                    How to stop these leaks
                  </Text>
                  <View className="gap-3">
                    {detail.stopLeaks.map((item) => (
                      <Pressable
                        key={item.id}
                        className="flex-row items-center gap-3 rounded-2xl bg-muted p-4 active:opacity-80"
                      >
                        <View
                          className="h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: tone.surface }}
                        >
                          <item.Icon color={tone.color} size={18} strokeWidth={2.2} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-[14px] font-semibold text-foreground">
                            {item.title}
                          </Text>
                          <Text className="mt-0.5 text-[12px] text-muted-foreground">
                            {item.description}
                          </Text>
                          <Text
                            className="mt-1 text-[12px] font-semibold"
                            style={{ color: tone.color }}
                          >
                            {item.link}
                          </Text>
                        </View>
                        <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {isCompact ? (
                <View
                  className="mt-7 rounded-3xl p-4"
                  style={{ backgroundColor: heroSurface }}
                >
                  <Text className="text-[15px] font-bold text-foreground">
                    Stop this leak
                  </Text>
                  <Text className="mt-1 text-[13px] text-muted-foreground">
                    See practical steps to reduce bank fees
                  </Text>
                  <Pressable
                    onPress={() => router.push("/leak/fees/fix")}
                    className="mt-4 items-center rounded-xl py-3 active:opacity-85"
                    style={{ backgroundColor: tone.color }}
                  >
                    <Text
                      style={{ color: trace.primaryForeground }}
                      className="text-[14px] font-semibold"
                    >
                      See how to fix
                    </Text>
                  </Pressable>
                </View>
              ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {detail.variant === "subscriptions" && detail.subscriptions ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                {listTitle}
              </Text>
              <View className="gap-2">
                {detail.subscriptions.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (id === "subs") {
                        router.push(`/leak/subscription/${item.id}`);
                      }
                    }}
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: withAlpha(
                          resolveMarkColor(palette, item.markColor),
                          0.14,
                        ),
                      }}
                    >
                      <Text
                        className="text-[14px] font-bold"
                        style={{ color: resolveMarkColor(palette, item.markColor) }}
                      >
                        {item.mark}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold text-foreground">
                        {item.name}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {item.category} · {item.billing}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[14px] font-bold text-foreground">
                        {item.amount}
                      </Text>
                      <Text
                        className="mt-0.5 text-[11px] font-semibold"
                        style={{
                          color:
                            item.status === "Active"
                              ? palette.success
                              : palette.blue,
                        }}
                      >
                        {item.status}
                      </Text>
                    </View>
                    <EllipsisVertical
                      color={palette.placeholder}
                      size={16}
                      strokeWidth={2}
                    />
                  </Pressable>
                ))}
              </View>

              {id === "subs" ? (
                <Pressable className="mt-3 flex-row items-center justify-center gap-2 py-2 active:opacity-75">
                  <Plus color={tone.color} size={18} strokeWidth={2.4} />
                  <Text className="text-[14px] font-semibold" style={{ color: tone.color }}>
                    Add subscription manually
                  </Text>
                </Pressable>
              ) : null}

              {detail.savingsAmount ? (
                <View
                  className="mt-4 flex-row items-center gap-3 overflow-hidden rounded-3xl p-4"
                  style={{ backgroundColor: heroSurface }}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: withAlpha(tone.color, 0.18) }}
                  >
                    <Wallet color={tone.color} size={20} strokeWidth={2.2} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[12px] text-muted-foreground">
                      You could save up to
                    </Text>
                    <Text className="text-[22px] font-bold text-foreground">
                      {detail.savingsAmount}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {id === "debit"
                        ? "by pausing unused debit orders"
                        : "by cancelling unused subscriptions"}
                    </Text>
                  </View>
                  <Pressable
                    className="rounded-xl px-3 py-2 active:opacity-85"
                    style={{ backgroundColor: tone.color }}
                  >
                    <Text
                      style={{ color: trace.primaryForeground }}
                      className="text-[12px] font-semibold"
                    >
                      Review all
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {detail.recommended ? (
                <>
                  <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                    Recommended actions
                  </Text>
                  <View className="gap-3">
                    {detail.recommended.map((item) => (
                      <View
                        key={item.id}
                        className="flex-row items-center gap-3 rounded-2xl bg-muted p-4"
                      >
                        <View
                          className="h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: tone.surface }}
                        >
                          <item.Icon color={tone.color} size={18} strokeWidth={2.2} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-[14px] font-semibold text-foreground">
                            {item.title}
                          </Text>
                          <Text className="mt-0.5 text-[12px] text-muted-foreground">
                            {item.description}
                          </Text>
                        </View>
                        <Pressable className="active:opacity-75">
                          <Text
                            className="text-[12px] font-semibold"
                            style={{ color: tone.color }}
                          >
                            {item.button}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      {!isCompact ? (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {detail.variant === "breakdown" ? (
            <Pressable
              onPress={() => router.push(`/leak/${id}/fix`)}
              className="overflow-hidden rounded-2xl active:opacity-90"
            >
              <LinearGradient
                colors={[trace.splashAccentPink, trace.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingHorizontal: 20, paddingVertical: 16, borderRadius: 16 }}
              >
                <Text
                  style={{ color: trace.primaryForeground }}
                  className="text-[15px] font-bold"
                >
                  {detail.ctaTitle}
                </Text>
                <Text
                  style={{ color: withAlpha(trace.primaryForeground, 0.9) }}
                  className="mt-0.5 text-[12px]"
                >
                  {detail.ctaSubtitle}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View
              style={{
                backgroundColor: tone.color,
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
            >
              <View className="flex-row items-center justify-between gap-4">
                <View className="min-w-0 flex-1">
                  <Text
                    style={{ color: trace.primaryForeground }}
                    className="text-[15px] font-bold"
                  >
                    {detail.ctaTitle}
                  </Text>
                  <Text
                    style={{ color: withAlpha(trace.primaryForeground, 0.85) }}
                    className="mt-0.5 text-[12px]"
                  >
                    {detail.ctaSubtitle}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (id === "subs") {
                      router.push("/leak/subs/fix");
                    }
                  }}
                  className="overflow-hidden rounded-xl active:opacity-85"
                >
                  <View
                    className="rounded-xl px-4 py-2.5"
                    style={{ backgroundColor: trace.primaryForeground }}
                  >
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: tone.color }}
                    >
                      {detail.ctaButton}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
