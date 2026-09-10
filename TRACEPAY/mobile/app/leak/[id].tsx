import { router, useLocalSearchParams } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  Info,
  Landmark,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Smartphone,
  Store,
  Wifi,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { FixActionsList } from "../../src/components/leaks/FixActionsList";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { InfoSheet } from "../../src/components/ui/Modal";
import {
  getFixContent,
  getFixRoute,
} from "../../src/features/leaks/fixContent";
import {
  COLORS,
  TRACEPAY,
  type ImpactTone,
  getImpactToneStyles,
  withAlpha,
} from "../../src/theme/colors";

const PERIODS = ["This month", "Last month", "3 months", "Custom"] as const;
type Period = (typeof PERIODS)[number];

const LEAK_CALC_COPY: Record<string, string> = {
  fees:
    "We total monthly account fees, service charges, ATM fees, SMS alerts, and other bank charges from your statements for this period.",
  subs:
    "We flag recurring subscription merchants and sum what you paid this month, including unused or inactive plans still billing you.",
  debit:
    "We list active debit-order mandates and sum the amounts collected this month that look unused or higher than needed.",
  airtime:
    "We add prepaid airtime, data bundles, and out-of-bundle charges from your bank and network-linked spend this month.",
  atm:
    "We total cash withdrawals and paid balance enquiries, especially at other banks’ ATMs where fees are highest.",
};

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
  subscriptions?: SubscriptionItem[];
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
      "You could save up to R712.50 this month by cutting unnecessary bank charges.",
    ctaTitle: "Stop these bank fees",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
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
    ctaTitle: "Cancel what you don't use",
    ctaSubtitle: "Open step-by-step cancel guides",
    ctaButton: "Start cancelling",
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
    ctaTitle: "Stop unused debit orders",
    ctaSubtitle: "Open step-by-step pause guides",
    ctaButton: "Start pausing",
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
      "You could save up to R206.15 by matching your bundle to real usage and avoiding out-of-bundle charges.",
    ctaTitle: "Cut airtime & data costs",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
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
      "You could save up to R150.00 by using your bank's ATMs and skipping paid balance enquiries.",
    ctaTitle: "Reduce withdrawal fees",
    ctaSubtitle: "Open the first step-by-step guide",
    ctaButton: "Start fixing",
  },
};

/** Map a breakdown line item to that leak's fix action (never cross-leak). */
const BREAKDOWN_FIX_ACTION: Record<string, Record<string, string>> = {
  fees: {
    monthly: "account",
    service: "services",
    atm: "atm",
    sms: "sms",
    other: "services",
  },
  airtime: {
    data: "bundle",
    airtime: "topups",
    "out-of-bundle": "data-alerts",
  },
  atm: {
    "other-bank": "home-atm",
    retail: "cashback",
    balance: "balance",
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
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const [period, setPeriod] = useState<Period>("This month");
  const [showCalc, setShowCalc] = useState(false);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const detail = leakId ? LEAK_DETAILS[leakId] : undefined;
  const fixContent = leakId ? getFixContent(leakId) : null;
  const tone = getImpactToneStyles(scheme, detail?.impact ?? "high");

  const heroSurface = useMemo(
    () =>
      scheme === "dark"
        ? withAlpha(tone.color, 0.16)
        : withAlpha(tone.color, 0.1),
    [scheme, tone.color],
  );

  if (!leakId || !detail || !fixContent) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background px-5"
        edges={["top"]}
      >
        <Text className="text-center text-[16px] font-semibold text-foreground">
          This leak could not be found.
        </Text>
        <Button className="mt-4" size="md" onPress={() => router.back()}>
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  const isCompact = view === "summary" && leakId === "fees";
  const listTitle =
    detail.listSectionTitle ??
    (leakId === "debit" ? "Your debit orders" : "Your subscriptions");

  const openBreakdownFix = (itemId: string) => {
    const actionId = BREAKDOWN_FIX_ACTION[leakId]?.[itemId];
    if (!actionId) return;
    router.push(getFixRoute(leakId, actionId) as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="mb-4 flex-row items-start justify-between">
            <IconButton
              accessibilityLabel="Go back"
              className="mr-3 mt-1"
              variant="muted"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>

            <View className="min-w-0 flex-1 flex-row items-start gap-3">
              <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: tone.surface }}
              >
                <detail.HeaderIcon color={tone.color} size={22} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[24px] font-bold text-foreground">{detail.title}</Text>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  {detail.subtitle}
                </Text>
              </View>
            </View>

            <IconButton
              accessibilityLabel="How we calculate"
              className="mt-1"
              variant="ghost"
              onPress={() => setShowCalc(true)}
            >
              <HelpCircle color={palette.placeholder} size={20} strokeWidth={2} />
            </IconButton>
          </View>

          <PeriodTabs active={period} onChange={setPeriod} toneColor={tone.color} />

          {isCompact ? (
            <View className="mt-5 flex-row gap-3">
              {[
                { label: "You paid", value: detail.amount },
                { label: "vs last month", value: "+18%" },
                { label: "Frequency", value: "Monthly" },
              ].map((stat) => (
                <View key={stat.label} className="flex-1 rounded-2xl bg-muted p-3">
                  <Text className="text-[11px] text-muted-foreground">{stat.label}</Text>
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
                    <Text className="text-[12px] font-semibold" style={{ color: tone.color }}>
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
                  <Pressable
                    onPress={() => setShowCalc(true)}
                    accessibilityRole="button"
                    accessibilityLabel="How we calculate"
                    className="mt-2 flex-row items-center gap-1 self-start active:opacity-75"
                  >
                    <Info color={palette.mutedForeground} size={13} strokeWidth={2} />
                    <Text className="text-[12px] font-medium text-muted-foreground">
                      How we calculate
                    </Text>
                  </Pressable>
                </View>

                <View className="justify-center">
                  {detail.variant === "breakdown" ? (
                    leakId === "airtime" ? (
                      <AirtimeIllustration accent={tone.color} primary={palette.primary} />
                    ) : leakId === "atm" ? (
                      <AtmIllustration accent={tone.color} primary={palette.primary} />
                    ) : (
                      <ReceiptIllustration accent={tone.color} primary={palette.primary} />
                    )
                  ) : leakId === "debit" ? (
                    <DebitCalendarIllustration accent={tone.color} primary={palette.primary} />
                  ) : (
                    <SubscriptionBoxIllustration accent={tone.color} primary={palette.primary} />
                  )}
                </View>
              </View>
            </View>
          )}

          {detail.variant === "breakdown" && detail.breakdown ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                Where it comes from
              </Text>
              <View className="gap-2">
                {detail.breakdown.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openBreakdownFix(item.id)}
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
              {detail.didYouKnow ? (
                <View
                  className="mt-4 rounded-3xl p-4"
                  style={{ backgroundColor: palette.surfaceSoft }}
                >
                  <Text className="text-[13px] leading-5 text-foreground">
                    {detail.didYouKnow}
                  </Text>
                </View>
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
                      if (leakId === "subs") {
                        router.push(`/leak/subscription/${item.id}`);
                        return;
                      }
                      if (leakId === "debit") {
                        router.push(getFixRoute(leakId, `pause-${item.id}`) as never);
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
                            item.status === "Active" ? palette.success : palette.blue,
                        }}
                      >
                        {leakId === "debit" ? "Tap for steps" : item.status}
                      </Text>
                    </View>
                    <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text className="mb-2 mt-8 text-[17px] font-bold text-foreground">
            How to stop this
          </Text>
          <Text className="mb-4 text-[13px] leading-5 text-muted-foreground">
            Follow the steps for this leak only. Tap an action to see exactly what to do.
          </Text>
          <FixActionsList
            leakId={leakId}
            sections={fixContent.sections}
            impact={fixContent.impact}
          />
        </View>
      </ScrollView>

      <InfoSheet
        visible={showCalc}
        title="How we calculate"
        message={
          LEAK_CALC_COPY[leakId] ??
          "We total avoidable charges linked to this leak for the selected period and compare them to your overall leaks."
        }
        onClose={() => setShowCalc(false)}
      />
    </SafeAreaView>
  );
}
