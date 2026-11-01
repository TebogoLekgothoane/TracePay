import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Calendar, ChevronLeft, ChevronRight, HelpCircle, Lightbulb } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ForYouSection } from "../../src/components/dashboard/ForYouSection";
import { FindingReview } from "../../src/components/leaks/FindingReview";
import { listHiddenLeaks, yearlyCost } from "../../src/features/leaks/hidden-leaks";
import { HiddenLeaksSection } from "../../src/components/leaks/HiddenLeaksSection";
import { resolveMarkColor } from "../../src/components/leaks/LeakFlowShell";
import { PeriodTabs } from "../../src/components/insights/PeriodTabs";
import { BrandLogo } from "../../src/components/ui/BrandLogo";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { ChoiceMenu } from "../../src/components/ui/ChoiceMenu";
import { InfoSheet } from "../../src/components/ui/Modal";
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
import {
  LEAK_DETAILS,
} from "../../src/features/leaks/leak-details";
import { getPotentialLeak, listPotentialLeaks } from "../../src/features/leaks/potential-leaks";
import {
  getFixRoute,
  getPrimaryFixActionId,
} from "../../src/features/leaks/fixContent";
import {
  CUSTOM_RANGES,
  formatRandAmount,
  parseRandAmount,
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
  getImpactToneStyles,
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
  const params = useLocalSearchParams<{ id: string; view?: string; filter?: string }>();
  const leakId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [showCalc, setShowCalc] = useState(false);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  const detail = leakId ? LEAK_DETAILS[leakId] : undefined;
  const potential = leakId ? getPotentialLeak(leakId) : null;
  const upcomingSubscriptions = useMemo(() => listUpcomingSubscriptions(), []);
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

  if (!leakId || !detail || !scaledDetail) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background px-5"
        edges={["top"]}
      >
        <Text className="text-center text-[16px] font-semibold text-foreground">
          This leak could not be found.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  const hiddenLeaks = listHiddenLeaks(leakId);
  const yearlyAtThisRate = parseRandAmount(detail.amount) * 12;
  const avoidableYearly = hiddenLeaks.reduce((sum, leak) => sum + yearlyCost(leak), 0);

  const listTitle =
    detail.listSectionTitle ??
    (leakId === "debit" ? "Your debit orders" : "Your subscriptions");

  const openLineItem = (itemId: string) => {
    const query = `period=${encodeURIComponent(period)}&range=${encodeURIComponent(customRange)}`;
    router.push(`/leak/${leakId}/item/${itemId}?${query}` as never);
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
            onChange={setPeriod}
            selectedColor={tone.color}
          />
          {period === "Custom" ? (
            <View className="mt-2 flex-row">
              <ChoiceMenu
                value={customRange}
                options={CUSTOM_RANGES}
                onChange={setCustomRange}
                accessibilityLabel="Custom range"
              />
            </View>
          ) : null}

          {/* The answer first: what this category costs, where it is heading, what is avoidable. */}
          <View className="mt-5 rounded-3xl bg-card p-5">
            <Text className="text-[13px] text-muted-foreground">
              Lost {scaledDetail.onLabel} · {period.toLowerCase()}
            </Text>
            <Text className="mt-1.5 text-[34px] font-bold tracking-[-0.8px] text-foreground">
              {scaledDetail.amount}
            </Text>
            <Text className="mt-1 text-[13px] font-semibold" style={{ color: tone.color }}>
              {scaledDetail.changeLabel}
            </Text>

            <View className="mt-4 flex-row border-t border-border/60 pt-4">
              <View className="flex-1">
                <Text className="text-[12px] text-muted-foreground">At this rate, a year</Text>
                <Text className="mt-0.5 text-[17px] font-bold text-foreground">
                  {formatRandAmount(yearlyAtThisRate)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[12px] text-muted-foreground">
                  {avoidableYearly > 0 ? "Could be avoided" : "Findings"}
                </Text>
                <Text className="mt-0.5 text-[17px] font-bold text-foreground">
                  {avoidableYearly > 0
                    ? `${formatRandAmount(avoidableYearly)} a year`
                    : String(scaledDetail.breakdown?.length ?? scaledDetail.subscriptions?.length ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          <HiddenLeaksSection
            leaks={hiddenLeaks}
            color={tone.color}
            onOpenGuide={getPrimaryFixActionId(leakId) ? () => openGuide(leakId) : undefined}
          />

          {scaledDetail.variant === "breakdown" && scaledDetail.breakdown ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                Where it goes
              </Text>
              <View className="gap-2">
                {scaledDetail.breakdown.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openLineItem(item.id)}
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
                      <View
                        className="mt-2 h-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: palette.surfaceSoft }}
                      >
                        <View
                          className="h-1 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(4, Number.parseFloat(item.percent) || 0))}%`,
                            backgroundColor: tone.color,
                          }}
                        />
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-[14px] font-bold text-foreground">
                        {item.amount}
                      </Text>
                      <Text className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {item.percent}
                      </Text>
                    </View>
                    <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {scaledDetail.variant === "subscriptions" && scaledDetail.subscriptions ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                {listTitle} ({scaledDetail.subscriptions.length})
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
                        openLineItem(item.id);
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

          <ReduceTipCard
            title="Stop the drain"
            body={
              scaledDetail.didYouKnow ??
              `You're paying ${scaledDetail.amount} ${scaledDetail.onLabel}. Review the items above and stop what you don't need.`
            }
            color={tone.color}
            palette={palette}
            onPress={getPrimaryFixActionId(leakId) ? () => openGuide(leakId) : undefined}
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

function ReduceTipCard({
  title,
  body,
  color,
  palette,
  onPress,
}: {
  title: string;
  body: string;
  color: string;
  palette: typeof COLORS.light | typeof COLORS.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      className="mt-5 flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-80"
      style={{ backgroundColor: palette.surfaceSoft }}
    >
      <Lightbulb color={color} size={22} strokeWidth={2.2} />
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-bold text-foreground">{title}</Text>
        <Text className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">{body}</Text>
      </View>
      {onPress ? <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} /> : null}
    </Pressable>
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
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-80"
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
