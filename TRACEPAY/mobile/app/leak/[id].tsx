import { router, useLocalSearchParams } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Banknote,
  Calendar,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Smartphone,
  Store,
  Wifi,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ForYouSection } from "../../src/components/dashboard/ForYouSection";
import { FindingReview } from "../../src/components/leaks/FindingReview";
import { FixActionsList } from "../../src/components/leaks/FixActionsList";
import { categoryReview } from "../../src/features/leaks/category-review";
import {
  readLeakResponse,
  saveLeakResponse,
  type StoredLeakResponse,
} from "../../src/features/leaks/leak-response.store";
import { getPotentialLeak } from "../../src/features/leaks/potential-leaks";
import type { ActionType } from "../../src/features/guidance/finding-guidance.model";
import { PeriodTabs } from "../../src/components/insights/PeriodTabs";
import { Button } from "../../src/components/ui/Button";
import { InfoSheet, SelectionSheet } from "../../src/components/ui/Modal";
import { useForYouCards } from "../../src/features/for-you/for-you.preferences";
import type { ForYouCard } from "../../src/features/for-you/for-you.types";
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
  COLORS,
  type ImpactTone,
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


export default function LeakDetailScreen() {
  const params = useLocalSearchParams<{ id: string; view?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const detail = leakId ? LEAK_DETAILS[leakId] : undefined;
  const potential = leakId ? getPotentialLeak(leakId) : null;
  const fixContent = leakId ? getFixContent(leakId) : null;
  const [response, setResponse] = useState<StoredLeakResponse | null>(null);
  const [savingResponse, setSavingResponse] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const factor = periodFactor(period, customRange);
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
    if (!leakId) return;
    let active = true;
    void readLeakResponse(leakId).then((value) => {
      if (active) setResponse(value);
    });
    return () => {
      active = false;
    };
  }, [leakId]);

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

  if (!leakId || (!potential && (!detail || !fixContent || !scaledDetail))) {
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
          potential.relatedLeakId ? () => openGuide(potential.relatedLeakId as string) : undefined
        }
        onSave={onSaveResponse}
      />
    );
  }

  if (!detail || !fixContent || !scaledDetail) {
    return null;
  }

  const review = categoryReview({
    leakId,
    subtitle: detail.subtitle,
    changeLabel: scaledDetail.changeLabel,
    percentOfLeaks: detail.percentOfLeaks,
    why:
      scaledDetail.didYouKnow ??
      LEAK_CALC_COPY[leakId] ??
      "We total avoidable charges linked to this leak for the selected period.",
    breakdown: scaledDetail.breakdown,
    subscriptions: scaledDetail.subscriptions,
  });

  const openTransaction = (itemId: string) => {
    if (detail.variant === "breakdown") {
      const actionId = BREAKDOWN_FIX_ACTION[leakId]?.[itemId];
      if (!actionId) return;
      router.push(getFixRoute(leakId, actionId) as never);
      return;
    }
    if (leakId === "subs") {
      router.push(`/leak/subscription/${itemId}`);
      return;
    }
    if (leakId === "debit") {
      router.push(getFixRoute(leakId, `pause-${itemId}`) as never);
    }
  };

  return (
    <>
      <FindingReview
        amount={scaledDetail.amount}
        evidence={review.evidence}
        guidanceExtra={
          <View className="mt-6">
            <Text className="mb-2 text-[17px] font-bold text-foreground">How to stop this</Text>
            <Text className="mb-4 text-[13px] leading-5 text-muted-foreground">
              These actions stay on this leak. Tap one for the step-by-step guide.
            </Text>
            <FixActionsList
              impact={fixContent.impact}
              leakId={leakId}
              sections={fixContent.sections}
            />
            {leakId === "subs" && forYouCards.length > 0 ? (
              <View className="mt-7">
                <ForYouSection
                  cards={forYouCards}
                  onAction={openForYouCard}
                  onIgnore={dismissForYouCard}
                />
              </View>
            ) : null}
          </View>
        }
        history={review.history}
        historyExtra={
          <View>
            <PeriodTabs active={period} selectedColor={palette.primary} onChange={handlePeriodChange} />
            {period === "Custom" ? (
              <Pressable
                className="mt-2 self-start rounded-full bg-muted px-3 py-1.5 active:opacity-75"
                onPress={() => setShowCustomSheet(true)}
              >
                <Text className="text-[12px] font-medium text-foreground">
                  Range: {customRange}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        icon={review.icon}
        known={review.known}
        response={response}
        saveError={saveError}
        saving={savingResponse}
        status={review.status}
        steps={review.steps}
        subtitle={detail.subtitle}
        title={detail.title}
        transactions={review.transactions}
        uncertain={review.uncertain}
        nextCharge={review.nextCharge}
        why={
          scaledDetail.didYouKnow ??
          LEAK_CALC_COPY[leakId] ??
          "We total avoidable charges linked to this leak for the selected period."
        }
        onInfo={() => setShowCalc(true)}
        onOpenGuide={() => openGuide(leakId)}
        onSave={onSaveResponse}
        onTransactionPress={openTransaction}
      />
      <InfoSheet
        visible={showCalc}
        title="How we calculate"
        message={
          LEAK_CALC_COPY[leakId] ??
          "We total avoidable charges linked to this leak for the selected period and compare them to your overall leaks."
        }
        onClose={() => setShowCalc(false)}
      />
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
    </>
  );
}
