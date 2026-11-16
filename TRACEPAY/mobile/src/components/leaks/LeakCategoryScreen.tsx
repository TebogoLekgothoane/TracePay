import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Landmark,
  Layers,
  Lightbulb,
  MessageSquare,
  Smartphone,
  Store,
  Wifi,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { LockedLeakRow } from "./LockedLeakRow";
import { PotentialLeakCard } from "./PotentialLeakCard";
import { RecurringSubscriptionsSection } from "./RecurringSubscriptionsSection";
import { SubscriptionCalendar } from "./SubscriptionCalendar";
import { PeriodTabs } from "../insights/PeriodTabs";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { ChoiceMenu } from "../ui/ChoiceMenu";
import { InfoSheet } from "../ui/Modal";
import { SkeletonCard } from "../ui/SkeletonGroups";
import {
  CUSTOM_RANGES,
  formatRandAmount,
  type CustomRange,
  type Period,
} from "../../features/insights/period";
import { buildLiveLeakCategories } from "../../features/leaks/leak-categories.live";
import { LEAK_DETAILS, type LeakDetail } from "../../features/leaks/leak-details";
import { useLeakEntitlement } from "../../features/leaks/leak-entitlement.store";
import {
  getFixRoute,
  getPrimaryFixActionId,
} from "../../features/leaks/fixContent";
import { splitLeaksForPaywall } from "../../features/leaks/leak-paywall";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "../../features/leaks/potential-leaks";
import { listLiveCategoryFindings } from "../../features/leaks/potential-leaks.live";
import {
  buildWhereItGoes,
  whereItGoesHref,
  type WhereItGoesIcon,
} from "../../features/leaks/leak-where-it-goes";

const WHERE_ICONS: Record<WhereItGoesIcon, LucideIcon> = {
  calendar: Calendar,
  card: CreditCard,
  landmark: Landmark,
  message: MessageSquare,
  layers: Layers,
  wifi: Wifi,
  phone: Smartphone,
  store: Store,
  help: HelpCircle,
};
import type { LeakDetectionResult } from "../../features/leak-intelligence/leak-intelligence.types";
import type { LeakDebugCategory } from "../../features/leak-intelligence/leak-debug-categories";
import { categoryTotal } from "../../features/leak-intelligence/leak-debug-categories";
import { loadInsightsData } from "../../features/transactions/transaction.service";
import { useCachedQuery } from "../../lib/query-cache";
import { COLORS, TRACEPAY, getImpactToneStyles } from "../../theme/colors";

const LEAK_CALC_COPY: Record<string, string> = {
  fees:
    "We total monthly account fees, service charges, ATM fees, SMS alerts, and other bank charges from your statements for this period.",
  subs:
    "We flag recurring payment merchants and sum what you paid this month, including unused or inactive plans still billing you.",
  debit:
    "We list active debit-order mandates and sum the amounts collected this month that look unused or higher than needed.",
  airtime:
    "We add prepaid airtime, data bundles, and out-of-bundle charges from your bank and network-linked spend this month.",
  atm:
    "We total cash withdrawals and paid balance enquiries, especially at other banks’ ATMs where fees are highest.",
  other:
    "We group remaining findings that do not fit bank fees, subscriptions, airtime, debit orders or cash withdrawals.",
};

function detailForCategory(
  categoryKey: string,
  debugCategory?: LeakDebugCategory | null,
): LeakDetail | null {
  const known = LEAK_DETAILS[categoryKey];
  if (known) return known;
  if (!debugCategory) return null;
  return {
    title: debugCategory.title,
    subtitle: debugCategory.blurb,
    HeaderIcon: Layers,
    impact: "mediumCool",
    amount: "R0.00",
    onLabel: `on ${debugCategory.title.toLowerCase()}`,
    changeLabel: "",
    percentOfLeaks: "",
    variant: "subscriptions",
    listSectionTitle: "Findings",
    ctaTitle: "Review these findings",
    ctaSubtitle: "Open a finding for the evidence",
    ctaButton: "Review",
  };
}

type Props = {
  categoryKey: string;
  /** Used when the category is not in LEAK_DETAILS (e.g. debug "other"). */
  debugCategory?: LeakDebugCategory | null;
  result: LeakDetectionResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Extra header actions (e.g. Refresh on the debug page). */
  headerEnd?: ReactNode;
  /** Optional note under the header (e.g. synthetic source). */
  banner?: ReactNode;
  /** Where a finding card should open. Defaults to the production finding route. */
  findingHref?: (findingId: string) => string;
};

/** Exact Leaks-tab category layout, driven only by live (or synthetic) detections. */
export function LeakCategoryScreen({
  categoryKey,
  debugCategory = null,
  result,
  loading,
  error,
  onRetry,
  headerEnd,
  banner,
  findingHref = (findingId) => `/leak/${findingId}`,
}: Props) {
  const [period, setPeriod] = useState<Period>("This month");
  const [customRange, setCustomRange] = useState<CustomRange>("Last 14 days");
  const [showCalc, setShowCalc] = useState(false);
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const detail = detailForCategory(categoryKey, debugCategory);
  const tone = getImpactToneStyles(scheme, detail?.impact ?? "high");
  const periodData = useCachedQuery(`leak-category:${categoryKey}:${period}:${customRange}`, () =>
    loadInsightsData(period, customRange),
  );

  const liveCategories = useMemo(() => buildLiveLeakCategories(result), [result]);
  const liveCategory = useMemo(
    () => liveCategories.find((entry) => entry.id === categoryKey) ?? null,
    [categoryKey, liveCategories],
  );
  const { unlocked } = useLeakEntitlement();
  const categoryFindings = useMemo(
    () => listLiveCategoryFindings(result, categoryKey),
    [categoryKey, result],
  );
  const visibleFindings = useMemo(
    () =>
      filter === "all"
        ? categoryFindings
        : categoryFindings.filter((leak) => leak.status === filter),
    [categoryFindings, filter],
  );
  const findingsPaywall = useMemo(
    () => splitLeaksForPaywall(visibleFindings),
    [visibleFindings],
  );
  const whereItGoes = useMemo(
    () =>
      buildWhereItGoes(
        categoryKey,
        periodData.data?.rows ?? [],
        periodData.data?.range ?? null,
      ),
    [categoryKey, periodData.data],
  );

  const monthly = useMemo(() => {
    if (liveCategory) return liveCategory.monthly;
    if (debugCategory) return categoryTotal(debugCategory, result?.leaks ?? []).monthly;
    return 0;
  }, [debugCategory, liveCategory, result?.leaks]);

  const findingCount = useMemo(() => {
    if (liveCategory) return liveCategory.findingCount;
    if (debugCategory) return categoryTotal(debugCategory, result?.leaks ?? []).count;
    return categoryFindings.length;
  }, [categoryFindings.length, debugCategory, liveCategory, result?.leaks]);

  const openGuide = useCallback(() => {
    const actionId = getPrimaryFixActionId(categoryKey);
    if (!actionId) return;
    router.push(getFixRoute(categoryKey, actionId) as never);
  }, [categoryKey]);

  const openFinding = useCallback(
    (id: string) => {
      router.push(findingHref(id) as never);
    },
    [findingHref],
  );
  const openUnlock = useCallback(() => {
    router.push("/leaks/unlocked" as never);
  }, []);

  if (!detail) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-5" edges={["top"]}>
        <Text className="text-center text-[16px] font-semibold text-foreground">
          This leak could not be found.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  const yearlyAtThisRate = monthly * 12;
  const amountLabel = formatRandAmount(monthly);
  const changeLabel =
    findingCount === 0
      ? "No open findings in your statements"
      : `${findingCount} open ${findingCount === 1 ? "finding" : "findings"} from your statements`;

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
              <View className="min-w-0 flex-1">
                <Text className="text-[24px] font-bold text-foreground">{detail.title}</Text>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">{detail.subtitle}</Text>
              </View>
            </View>

            <View className="mt-1 flex-row items-center gap-1">
              {headerEnd}
              <IconButton
                accessibilityLabel="How we calculate"
                variant="ghost"
                onPress={() => setShowCalc(true)}
              >
                <HelpCircle color={palette.placeholder} size={20} strokeWidth={2} />
              </IconButton>
            </View>
          </View>

          {banner}

          <PeriodTabs active={period} accentColor={tone.color} onChange={setPeriod} />
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

          <View className="mt-5 rounded-3xl bg-card p-5">
            <Text className="text-[13px] text-muted-foreground">
              Lost {detail.onLabel} · from your statements
            </Text>
            {loading && !result ? (
              <View className="mt-3">
                <SkeletonCard height={72} />
              </View>
            ) : (
              <>
                <Text className="mt-1.5 text-[34px] font-bold tracking-[-0.8px] text-foreground">
                  {amountLabel}
                </Text>
                <Text className="mt-1 text-[13px] font-semibold" style={{ color: tone.color }}>
                  {changeLabel}
                </Text>
              </>
            )}

            <View className="mt-4 flex-row border-t border-border/60 pt-4">
              <View className="flex-1">
                <Text className="text-[12px] text-muted-foreground">At this rate, a year</Text>
                <Text className="mt-0.5 text-[17px] font-bold text-foreground">
                  {formatRandAmount(yearlyAtThisRate)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[12px] text-muted-foreground">Findings</Text>
                <Text className="mt-0.5 text-[17px] font-bold text-foreground">
                  {String(findingCount)}
                </Text>
              </View>
            </View>
          </View>

          <Text className="mb-1 mt-8 text-[22px] font-bold tracking-[-0.3px] text-foreground">
            Potential leaks
          </Text>
          <Text className="text-[14px] leading-5 text-muted-foreground">
            We found {categoryFindings.length} things worth reviewing.
          </Text>

          {error && !result ? (
            <View className="mt-4 rounded-3xl bg-card px-4 py-5">
              <Text className="text-[15px] font-semibold text-foreground">Findings unavailable</Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4" variant="secondary" onPress={onRetry}>
                Try again
              </Button>
            </View>
          ) : (
            <>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {REVIEW_STATUSES.map((status) => {
                  const selected = status === filter;
                  const count = categoryFindings.filter((leak) => leak.status === status).length;
                  return (
                    <Pressable
                      key={status}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFilter((current) => (current === status ? "all" : status))}
                      className="overflow-hidden rounded-full px-4 py-2.5 active:opacity-80"
                      style={{ backgroundColor: selected ? undefined : palette.card }}
                    >
                      {selected ? (
                        <LinearGradient
                          pointerEvents="none"
                          colors={[...TRACEPAY.light.summaryGradient]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : null}
                      <Text
                        className="text-[13px] font-semibold"
                        style={{ color: selected ? "#FFFFFF" : palette.foreground }}
                      >
                        {REVIEW_STATUS_LABEL[status]} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 gap-3">
                {categoryFindings.length === 0 && !(loading && !result) ? (
                  <View className="rounded-3xl bg-card px-4 py-6">
                    <Text className="text-[15px] font-semibold text-foreground">
                      Nothing flagged here
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                      No open {detail.title.toLowerCase()} findings in your imported statements
                      right now.
                    </Text>
                  </View>
                ) : visibleFindings.length === 0 ? (
                  <View className="rounded-3xl bg-card px-4 py-6">
                    <Text className="text-[15px] font-semibold text-foreground">
                      Nothing in {REVIEW_STATUS_LABEL[filter === "all" ? "new" : filter].toLowerCase()}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                      Switch filters to see the other findings.
                    </Text>
                  </View>
                ) : unlocked ? (
                  visibleFindings.map((finding) => (
                    <PotentialLeakCard key={finding.id} leak={finding} onPress={openFinding} />
                  ))
                ) : (
                  <>
                    {findingsPaywall.preview.map((finding) => (
                      <PotentialLeakCard key={finding.id} leak={finding} onPress={openFinding} />
                    ))}
                    {findingsPaywall.locked.map((finding) => (
                      <LockedLeakRow key={finding.id} leak={finding} onPress={openUnlock} />
                    ))}
                  </>
                )}
              </View>
            </>
          )}

          {whereItGoes.length > 0 ? (
            <>
              <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
                Where it goes
              </Text>
              <Text className="mb-3 text-[13px] leading-5 text-muted-foreground">
                From your statements this period. Each fee type is kept separate so you can see
                what caused every charge.
              </Text>
              <View className="gap-2">
                {whereItGoes.map((item) => {
                  const Icon = WHERE_ICONS[item.icon];
                  return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(whereItGoesHref(categoryKey, item) as never)}
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                  >
                    <View className="h-10 w-10 items-center justify-center">
                      <Icon color={tone.color} size={18} strokeWidth={2.2} />
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
                            width: `${Math.min(100, Math.max(4, item.percentValue))}%`,
                            backgroundColor: tone.color,
                          }}
                        />
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-[14px] font-bold text-foreground">{item.amount}</Text>
                      <Text className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {item.percent}
                      </Text>
                    </View>
                    <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                  </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <ReduceTipCard
            title="Review these payments"
            body={
              monthly > 0
                ? `About ${amountLabel} ${detail.onLabel} each month is worth a second look. Some of it may be payments you want to keep, so check each one before you stop it.`
                : `No open ${detail.title.toLowerCase()} findings right now. Keep importing statements so we can spot new ones.`
            }
            color={tone.color}
            palette={palette}
            onPress={getPrimaryFixActionId(categoryKey) ? openGuide : undefined}
          />

          {categoryKey === "subs" ? (
            <View className="mt-7">
              <Text className="mb-3 text-[17px] font-bold text-foreground">Billing calendar</Text>
              <Text className="mb-3 text-[14px] leading-5 text-muted-foreground">
                Subscriptions, debit orders, rent, loans, insurance and other recurring charges.
              </Text>
              <SubscriptionCalendar
                onOpenCharge={(charge) => {
                  if (charge.href) router.push(charge.href as never);
                }}
              />
              <RecurringSubscriptionsSection />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <InfoSheet
        visible={showCalc}
        title="How we calculate"
        message={
          LEAK_CALC_COPY[categoryKey] ??
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
