import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  Layers,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Store,
  Wifi,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ForYouSection } from "../../src/components/dashboard/ForYouSection";
import { FindingReview } from "../../src/components/leaks/FindingReview";
import { FixActionsList } from "../../src/components/leaks/FixActionsList";
import { resolveMarkColor } from "../../src/components/leaks/LeakFlowShell";
import { PeriodTabs } from "../../src/components/insights/PeriodTabs";
import { BrandLogo } from "../../src/components/ui/BrandLogo";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { InfoSheet, Modal, SelectionSheet } from "../../src/components/ui/Modal";
import { SimpleBrandLogo } from "../../src/components/ui/SimpleBrandLogo";
import type { ActionType } from "../../src/features/guidance/finding-guidance.model";
import { useForYouCards } from "../../src/features/for-you/for-you.preferences";
import type { ForYouCard } from "../../src/features/for-you/for-you.types";
import {
  readLeakResponse,
  saveLeakResponse,
  type StoredLeakResponse,
} from "../../src/features/leaks/leak-response.store";
import { useLeakEntitlement } from "../../src/features/leaks/leak-entitlement.store";
import { isLeakLocked } from "../../src/features/leaks/leak-paywall";
import { getPotentialLeak, listPotentialLeaks } from "../../src/features/leaks/potential-leaks";
import {
  getFixContent,
  getFixRoute,
  getPrimaryFixActionId,
} from "../../src/features/leaks/fixContent";
import {
  CUSTOM_RANGES,
  periodChangeLabel,
  periodFactor,
  scaleRandAmount,
  type CustomRange,
  type Period,
} from "../../src/features/insights/period";
import {
  listUpcomingSubscriptions,
  type UpcomingSubscription,
} from "../../src/features/leaks/subscriptions.catalog";
import {
  COLORS,
  type ImpactTone,
  getImpactToneStyles,
  withAlpha,
} from "../../src/theme/colors";

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

function daysUntilLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

type BreakdownItem = {
  id: string;
  title: string;
  description: string;
  amount: string;
  percent: string;
  Icon: LucideIcon;
};

type FeeTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
};

type SubscriptionItem = {
  id: string;
  name: string;
  category: string;
  billing: string;
  amount: string;
  status: "Active" | "Inactive";
  /** Simple Icons brand id and/or Hunter domain for logo lookup. */
  brandId?: string;
  logoDomain?: string;
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
        Icon: Layers,
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
        brandId: "netflix",
        logoDomain: "netflix.com",
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
        logoDomain: "showmax.com",
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
        brandId: "spotify",
        logoDomain: "spotify.com",
        mark: "♪",
        markColor: "success",
      },
      {
        id: "youtube",
        name: "YouTube Premium",
        category: "Music",
        billing: "Billed monthly",
        amount: "R72.00",
        status: "Active",
        brandId: "youtube",
        logoDomain: "youtube.com",
        mark: "▶",
        markColor: "destructive",
      },
      {
        id: "adobe",
        name: "Adobe Acrobat",
        category: "Productivity",
        billing: "Billed yearly",
        amount: "R519.00",
        status: "Inactive",
        logoDomain: "adobe.com",
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
        logoDomain: "canva.com",
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
        logoDomain: "dstv.com",
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
        Icon: Layers,
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

const FEE_TRANSACTIONS: Record<string, FeeTransaction[]> = {
  monthly: [
    { id: "account-1", date: "20 May", description: "Monthly account fee", amount: "165.00" },
  ],
  service: [
    { id: "service-1", date: "04 May", description: "Immediate payment fee", amount: "25.00" },
    { id: "service-2", date: "11 May", description: "Cash deposit fee", amount: "48.40" },
    { id: "service-3", date: "27 May", description: "Payment service fee", amount: "175.00" },
  ],
  atm: [
    { id: "atm-1", date: "06 May", description: "Other-bank ATM fee", amount: "85.00" },
    { id: "atm-2", date: "19 May", description: "Other-bank ATM fee", amount: "69.50" },
  ],
  sms: [
    { id: "sms-1", date: "03 May", description: "SMS notification fee", amount: "24.00" },
    { id: "sms-2", date: "14 May", description: "SMS notification fee", amount: "24.00" },
    { id: "sms-3", date: "25 May", description: "SMS notification fee", amount: "24.00" },
  ],
  other: [
    { id: "other-1", date: "09 May", description: "Balance enquiry fee", amount: "30.00" },
    { id: "other-2", date: "22 May", description: "Card replacement fee", amount: "42.60" },
  ],
  data: [
    { id: "data-1", date: "05 May", description: "Mobile data bundle", amount: "99.00" },
    { id: "data-2", date: "18 May", description: "Mobile data top-up", amount: "75.00" },
  ],
  airtime: [
    { id: "airtime-1", date: "07 May", description: "Airtime top-up", amount: "35.00" },
    { id: "airtime-2", date: "16 May", description: "Airtime top-up", amount: "32.15" },
  ],
  "out-of-bundle": [
    { id: "oob-1", date: "28 May", description: "Out-of-bundle data charge", amount: "40.00" },
  ],
  "other-bank": [
    { id: "other-atm-1", date: "06 May", description: "Other-bank ATM withdrawal fee", amount: "85.00" },
  ],
  retail: [
    { id: "retail-1", date: "13 May", description: "Retail cash-back fee", amount: "35.00" },
  ],
  balance: [
    { id: "balance-1", date: "22 May", description: "Paid balance enquiry", amount: "30.00" },
  ],
  dstv: [
    { id: "dstv-1", date: "01 May", description: "DSTV Premium debit order", amount: "899.00" },
    { id: "dstv-2", date: "01 Apr", description: "DSTV Premium debit order", amount: "899.00" },
  ],
  gym: [
    { id: "gym-1", date: "03 May", description: "Gym membership debit order", amount: "450.00" },
    { id: "gym-2", date: "03 Apr", description: "Gym membership debit order", amount: "450.00" },
  ],
  insurance: [
    { id: "insurance-1", date: "15 May", description: "Insurance premium debit order", amount: "320.75" },
    { id: "insurance-2", date: "15 Apr", description: "Insurance premium debit order", amount: "320.75" },
  ],
};

export default function LeakDetailScreen() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { unlocked, hydrated } = useLeakEntitlement();

  if (!hydrated) return null;
  if (leakId && isLeakLocked(listPotentialLeaks(), leakId, unlocked)) {
    return <Redirect href="/upgrade" />;
  }
  return <LeakDetailContent />;
}

function LeakDetailContent() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<{
    title: string;
    amount: string;
    transactions: FeeTransaction[];
    mitigation: string;
    route: string | null;
  } | null>(null);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const detail = leakId ? LEAK_DETAILS[leakId] : undefined;
  const potential = leakId ? getPotentialLeak(leakId) : null;
  const upcomingSubscriptions = useMemo(() => listUpcomingSubscriptions(), []);
  const fixContent = leakId ? getFixContent(leakId) : null;
  const tone = getImpactToneStyles(scheme, detail?.impact ?? "high");
  const factor = periodFactor(period, customRange);
  const [response, setResponse] = useState<StoredLeakResponse | null>(null);
  const [savingResponse, setSavingResponse] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { cards: forYouCards, ignore: ignoreForYouCard } = useForYouCards();
  const openForYouCard = useCallback((card: ForYouCard) => {
    router.push(card.href as never);
  }, []);
  const dismissForYouCard = useCallback(
    (cardId: string) => {
      void ignoreForYouCard(cardId);
    },
    [ignoreForYouCard],
  );

  const scaledDetail = useMemo(() => {
    if (!detail) return null;

    const changeLabel =
      period === "This month"
        ? detail.changeLabel
        : periodChangeLabel(period);

    return {
      ...detail,
      amount: scaleRandAmount(detail.amount, factor),
      changeLabel,
      breakdown: detail.breakdown?.map((item) => ({
        ...item,
        amount: scaleRandAmount(item.amount, factor),
      })),
      subscriptions: detail.subscriptions?.map((item) => ({
        ...item,
        amount: scaleRandAmount(item.amount, factor),
      })),
      didYouKnow: detail.didYouKnow
        ? detail.didYouKnow.replace(
            detail.amount,
            scaleRandAmount(detail.amount, factor),
          )
        : undefined,
    };
  }, [detail, factor, period]);

  useEffect(() => {
    if (!leakId || !potential) return;
    let active = true;
    void readLeakResponse(leakId).then((value) => {
      if (active) setResponse(value);
    });
    return () => {
      active = false;
    };
  }, [leakId, potential]);

  const onSaveResponse = useCallback(
    async (action: ActionType, note: string) => {
      if (!leakId || savingResponse) return false;
      setSavingResponse(true);
      setSaveError(null);
      try {
        const saved = await saveLeakResponse(leakId, action, note);
        setResponse(saved);
        return true;
      } catch (caught) {
        setSaveError(
          caught instanceof Error ? caught.message : "The response could not be saved.",
        );
        return false;
      } finally {
        setSavingResponse(false);
      }
    },
    [leakId, savingResponse],
  );

  const handlePeriodChange = (next: Period) => {
    setPeriod(next);
    if (next === "Custom") setShowCustomSheet(true);
  };

  const openGuide = (targetLeakId: string) => {
    const actionId = getPrimaryFixActionId(targetLeakId);
    if (!actionId) return;
    router.push(getFixRoute(targetLeakId, actionId) as never);
  };

  if (potential) {
    return (
      <FindingReview
        amount={potential.amount}
        evidence={potential.evidence}
        history={[
          {
            title: "Status",
            detail:
              "This label is how the finding looks now. Saving a response does not change it.",
          },
        ]}
        icon={potential.icon}
        known={potential.known}
        response={response}
        saveError={saveError}
        saving={savingResponse}
        status={potential.status}
        steps={potential.steps}
        subtitle={potential.subtitle}
        title={potential.title}
        transactions={potential.transactions}
        uncertain={potential.uncertain}
        nextCharge={potential.nextCharge}
        why={potential.why}
        onOpenGuide={
          potential.relatedLeakId
            ? () => openGuide(potential.relatedLeakId as string)
            : undefined
        }
        onSave={onSaveResponse}
      />
    );
  }

  if (!leakId || !detail || !fixContent || !scaledDetail) {
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

  const listTitle =
    detail.listSectionTitle ??
    (leakId === "debit" ? "Your debit orders" : "Your subscriptions");

  const openBreakdownFix = (itemId: string) => {
    const actionId = BREAKDOWN_FIX_ACTION[leakId]?.[itemId];
    if (!actionId) return;
    router.push(getFixRoute(leakId, actionId) as never);
  };

  const openTransactionEvidence = (itemId: string, title: string, amount: string) => {
    const transactions = FEE_TRANSACTIONS[itemId] ?? [];
    if (transactions.length === 0) {
      openBreakdownFix(itemId);
      return;
    }
    const actionId = BREAKDOWN_FIX_ACTION[leakId]?.[itemId];
    const route = actionId
      ? getFixRoute(leakId, actionId)
      : leakId === "debit"
        ? getFixRoute(leakId, `pause-${itemId}`)
        : null;
    setSelectedEvidence({
      title,
      amount,
      transactions,
      mitigation:
        leakId === "debit"
          ? "Confirm whether this debit order is still needed, then pause or cancel it with the provider if appropriate."
          : "Review the entries, then open the relevant guide to reduce or avoid similar charges.",
      route,
    });
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
              <View className="h-11 w-11 items-center justify-center">
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

          <PeriodTabs
            active={period}
            onChange={handlePeriodChange}
            selectedColor={tone.color}
          />
          {period === "Custom" ? (
            <Pressable
              onPress={() => setShowCustomSheet(true)}
              className="mt-2 self-start rounded-full bg-muted px-3 py-1.5 active:opacity-75"
            >
              <Text className="text-[12px] font-medium text-foreground">
                Range: {customRange}
              </Text>
            </Pressable>
          ) : null}

          <View className="mt-5 flex-row items-end justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] text-muted-foreground">
                {scaledDetail.variant === "subscriptions" ? "You're paying" : "Total"}
              </Text>
              <Text className="mt-1 text-[28px] font-bold tracking-[-0.5px] text-foreground">
                {scaledDetail.amount}
              </Text>
              <Text className="mt-1 text-[13px] text-muted-foreground">
                {scaledDetail.onLabel}
              </Text>
            </View>
            <View
              className="mb-1 rounded-full px-3 py-1.5"
              style={{ backgroundColor: withAlpha(tone.color, 0.14) }}
            >
              <Text className="text-[12px] font-semibold" style={{ color: tone.color }}>
                {scaledDetail.changeLabel}
              </Text>
            </View>
          </View>

          {scaledDetail.variant === "breakdown" && scaledDetail.breakdown ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                Where it comes from
              </Text>
              <View className="gap-2">
                {scaledDetail.breakdown.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      openTransactionEvidence(item.id, item.title, item.amount)
                    }
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                  >
                    <View className="h-10 w-10 items-center justify-center">
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
              {scaledDetail.didYouKnow ? (
                <View
                  className="mt-4 rounded-3xl p-4"
                  style={{ backgroundColor: palette.surfaceSoft }}
                >
                  <Text className="text-[13px] leading-5 text-foreground">
                    {scaledDetail.didYouKnow}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {scaledDetail.variant === "subscriptions" && scaledDetail.subscriptions ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                {listTitle}
              </Text>
              <View className="gap-2">
                {scaledDetail.subscriptions.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (leakId === "subs") {
                        router.push(`/leak/subscription/${item.id}`);
                        return;
                      }
                      if (leakId === "debit") {
                        openTransactionEvidence(item.id, item.name, item.amount);
                      }
                    }}
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                  >
                    {item.logoDomain ? (
                      <BrandLogo
                        name={item.name}
                        logoDomain={item.logoDomain}
                        size={40}
                        fallbackColor={resolveMarkColor(palette, item.markColor)}
                        shape="squircle"
                      />
                    ) : item.brandId ? (
                      <SimpleBrandLogo
                        name={item.name}
                        brandId={item.brandId}
                        size={40}
                        fallbackColor={resolveMarkColor(palette, item.markColor)}
                        shape="squircle"
                      />
                    ) : (
                      <View className="h-10 w-10 items-center justify-center">
                        <Text
                          className="text-[14px] font-bold"
                          style={{ color: resolveMarkColor(palette, item.markColor) }}
                        >
                          {item.mark}
                        </Text>
                      </View>
                    )}
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
              {leakId === "subs" ? (
                <UpcomingSubscriptionsSection
                  items={upcomingSubscriptions}
                  palette={palette}
                />
              ) : null}
            </>
          ) : null}

          {leakId === "subs" && forYouCards.length > 0 ? (
            <View className="mt-7">
              <ForYouSection
                cards={forYouCards}
                onAction={openForYouCard}
                onIgnore={dismissForYouCard}
              />
            </View>
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
      <Modal
        visible={selectedEvidence !== null}
        onClose={() => setSelectedEvidence(null)}
      >
        {selectedEvidence ? (
          <TransactionEvidenceContent
            evidence={selectedEvidence}
            factor={factor}
            onClose={() => setSelectedEvidence(null)}
            onMitigate={() => {
              const route = selectedEvidence.route;
              setSelectedEvidence(null);
              if (route) router.push(route as never);
            }}
          />
        ) : null}
      </Modal>
      <SelectionSheet
        visible={showCustomSheet}
        title="Custom range"
        selected={customRange}
        onSelect={setCustomRange}
        onClose={() => setShowCustomSheet(false)}
        options={CUSTOM_RANGES.map((range) => ({
          value: range,
          label: range,
        }))}
      />
    </SafeAreaView>
  );
}

function UpcomingSubscriptionsSection({
  items,
  palette,
}: {
  items: UpcomingSubscription[];
  palette: typeof COLORS.light | typeof COLORS.dark;
}) {
  if (items.length === 0) return null;
  return (
    <View className="mt-7">
      <View className="mb-3 flex-row items-end justify-between">
        <View>
          <Text className="text-[17px] font-bold text-foreground">Upcoming charges</Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            Your next subscription payments
          </Text>
        </View>
        <Calendar color={palette.primary} size={18} strokeWidth={2.2} />
      </View>
      <View className="gap-2">
        {items.map((item) => {
          const markColor = resolveMarkColor(palette, item.markColor);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, next charge ${item.nextChargeLabel}`}
              className="flex-row items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5 active:opacity-80"
              onPress={() => router.push(`/leak/subscription/${item.id}`)}
            >
              {item.logoDomain ? (
                <BrandLogo
                  name={item.name}
                  logoDomain={item.logoDomain}
                  size={38}
                  fallbackColor={markColor}
                  shape="squircle"
                />
              ) : item.brandId ? (
                <SimpleBrandLogo
                  name={item.name}
                  brandId={item.brandId}
                  size={38}
                  fallbackColor={markColor}
                  shape="squircle"
                />
              ) : (
                <View className="h-[38px] w-[38px] items-center justify-center rounded-xl bg-muted">
                  <Text className="text-[14px] font-bold" style={{ color: markColor }}>
                    {item.mark}
                  </Text>
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {item.nextChargeLabel} · {daysUntilLabel(item.daysUntil)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold text-foreground">{item.amount}</Text>
                <Text className="mt-0.5 text-[11px] font-semibold text-primary">Upcoming</Text>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TransactionEvidenceContent({
  evidence,
  factor,
  onClose,
  onMitigate,
}: {
  evidence: {
    title: string;
    amount: string;
    transactions: FeeTransaction[];
    mitigation: string;
    route: string | null;
  };
  factor: number;
  onClose: () => void;
  onMitigate: () => void;
}) {
  return (
    <View>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[19px] font-bold text-foreground">{evidence.title}</Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Transactions included in this period
          </Text>
        </View>
        <Text className="text-[16px] font-bold text-foreground">
          {scaleRandAmount(evidence.amount, factor)}
        </Text>
      </View>
      <View className="mt-4 gap-2">
        {evidence.transactions.map((transaction) => (
          <View
            key={transaction.id}
            className="flex-row items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 py-3"
          >
            <View className="min-w-0 flex-1 pr-3">
              <Text className="text-[13px] font-medium text-foreground">
                {transaction.description}
              </Text>
              <Text className="mt-0.5 text-[11px] text-muted-foreground">
                {transaction.date}
              </Text>
            </View>
            <Text className="text-[13px] font-semibold text-foreground">
              {scaleRandAmount(transaction.amount, factor)}
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-4 rounded-2xl bg-muted px-3.5 py-3">
        <Text className="text-[12px] font-semibold text-foreground">How to mitigate</Text>
        <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {evidence.mitigation}
        </Text>
      </View>
      <View className="mt-4 flex-row gap-2">
        <Button className="flex-1" size="md" variant="outline" onPress={onClose}>
          Close
        </Button>
        {evidence.route ? (
          <Button className="flex-1" size="md" onPress={onMitigate}>
            See ways to mitigate
          </Button>
        ) : null}
      </View>
    </View>
  );
}
