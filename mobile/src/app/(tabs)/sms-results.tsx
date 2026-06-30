import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useIngestion } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TransactionCategory } from "@/services/sms/sms.types";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";
import { DEMO_LEAKS, type SimulatedLeak } from "@/lib/simulate";
import { CATEGORY_ICONS } from "@/constants/category-icons";

type LeakResult = SimulatedLeak & { detail?: string };

type LeakCardProps = {
  leak: LeakResult;
  expanded: boolean;
  onToggle: () => void;
};

function LeakCard({ leak, expanded, onToggle }: LeakCardProps) {
  const { colors } = useColorScheme();
  const sev = getSeverityStyle(leak.severity);

  return (
    <Card
      className={cn("mb-3", expanded && "border border-primary/40")}
      contentClassName="gap-0"
    >
      <Pressable
        onPress={onToggle}
        className="flex-row items-center gap-3 active:opacity-90"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View className={cn("h-10 w-10 items-center justify-center rounded-full", sev.badge)}>
          <MaterialCommunityIcons name={leak.categoryIcon as any} size={18} color={sev.icon} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText variant="title" numberOfLines={1}>
            {leak.name}
          </AppText>
          <View className="mt-1 flex-row flex-wrap items-center gap-1">
            <AppText variant="caption">{leak.category}</AppText>
            <View className={cn("rounded-md px-2 py-0.5", sev.badge)}>
              <AppText variant="caption" className={sev.text}>
                {leak.severity}
              </AppText>
            </View>
          </View>
        </View>
        <AppText variant="label" className="text-red-600 dark:text-red-400">
          R{leak.amountMonthly.toFixed(2)}/mo
        </AppText>
        <Feather
          name="chevron-down"
          size={18}
          color={colors.mutedForeground}
          style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {!expanded ? (
        <AppText variant="bodySm" className="mt-3 leading-5" numberOfLines={2}>
          {leak.advice ?? leak.sourceSms ?? "Tap to see the SMS evidence and next step."}
        </AppText>
      ) : (
        <View className="mt-4 gap-3 border-t border-white/10 pt-4">
          {leak.sourceSms ? (
            <View className="flex-row items-start gap-2 rounded-xl bg-muted p-3 dark:bg-white/5">
              <MaterialCommunityIcons name="message-text-outline" size={14} color={colors.mutedForeground} />
              <AppText variant="caption" className="flex-1 leading-[18px]">
                {leak.sourceSms}
              </AppText>
            </View>
          ) : null}
          {leak.advice ? (
            <View className="flex-row items-start gap-2 rounded-xl bg-brand-purple-light p-3 dark:bg-primary/15">
              <MaterialCommunityIcons name="star-four-points-outline" size={14} color={colors.primary} />
              <AppText variant="bodySm" className="flex-1 text-brand-purple dark:text-primary">
                {leak.advice}
              </AppText>
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

export default function SmsResultsScreen() {
  const params = useLocalSearchParams<{ data?: string }>();
  const { colors } = useColorScheme();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const addLeaks = useLeaksStore((s) => s.addLeaks);
  const [expandedLeak, setExpandedLeak] = useState<number | null>(0);

  const { state, transactions } = useIngestion();

  const categoryBreakdown = transactions.reduce<
    Record<TransactionCategory, { count: number; total: number }>
  >((acc, tx) => {
    const entry = acc[tx.category] ?? { count: 0, total: 0 };
    acc[tx.category] = {
      count: entry.count + 1,
      total: entry.total + (tx.type === "debit" ? tx.amount : 0),
    };
    return acc;
  }, {} as Record<TransactionCategory, { count: number; total: number }>);

  const categoryEntries = (
    Object.entries(categoryBreakdown) as [TransactionCategory, { count: number; total: number }][]
  ).sort((a, b) => b[1].total - a[1].total);

  const parsedData = params.data
    ? (() => {
        try {
          return JSON.parse(decodeURIComponent(params.data));
        } catch {
          return null;
        }
      })()
    : null;

  const rawLeaks: LeakResult[] = parsedData?.leaks?.length ? parsedData.leaks : DEMO_LEAKS;
  const totalMonthly = rawLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);

  const goToHome = async () => {
    if (rawLeaks.length > 0) {
      await addLeaks(
        rawLeaks.map((l) => ({
          name: l.name,
          category: l.category,
          categoryIcon: l.categoryIcon,
          amountMonthly: l.amountMonthly,
          severity: l.severity,
          status: "active",
          sourceSms: l.sourceSms,
          advice: l.advice,
        })),
      );
    }
    if (!onboardingComplete) {
      await completeOnboarding();
    }
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <View className="mb-6">
        <View className="mb-1 flex-row items-center gap-2">
          <MaterialCommunityIcons name="message-text-outline" size={22} color={colors.primary} />
          <AppText variant="titleLg">SMS Scan Results</AppText>
        </View>
        <AppText variant="lead">
          AI found {rawLeaks.length} money leaks in your SMS history
        </AppText>
      </View>

      {state.totalIngested > 0 ? (
        <Card className="mb-5">
          <View className="mb-3 flex-row items-center gap-2">
            <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.success} />
            <AppText variant="title" className="flex-1 text-green-700 dark:text-green-400">
              {state.totalIngested} transaction{state.totalIngested !== 1 ? "s" : ""} ingested
            </AppText>
            {state.lastSyncAt ? (
              <AppText variant="caption">
                {state.lastSyncAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
              </AppText>
            ) : null}
          </View>
          {categoryEntries.length > 0 ? (
            <View className="gap-2">
              <AppText variant="overline">By category</AppText>
              {categoryEntries.map(([cat, { count, total }]) => (
                <View key={cat} className="flex-row items-center gap-2">
                  <View className="h-7 w-7 items-center justify-center rounded-lg bg-brand-purple-light dark:bg-primary/20">
                    <MaterialCommunityIcons
                      name={CATEGORY_ICONS[cat] as any}
                      size={14}
                      color={colors.primary}
                    />
                  </View>
                  <AppText variant="bodySm" className="flex-1 capitalize">
                    {cat}
                  </AppText>
                  <AppText variant="caption">{count} tx</AppText>
                  {total > 0 ? (
                    <AppText variant="label" className="min-w-[70px] text-right text-red-600 dark:text-red-400">
                      R{total.toFixed(2)}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card glass={false} className="mb-6 border-0 bg-red-600">
        <AppText variant="overline" className="text-white/75">
          Total leaking monthly
        </AppText>
        <AppText variant="display" className="my-2 text-white">
          R{totalMonthly.toFixed(2)}
        </AppText>
        <AppText variant="bodySm" className="text-white/80">
          That is R{(totalMonthly * 12).toFixed(0)} lost every year
        </AppText>
      </Card>

      <AppText variant="overline" className="mb-3">
        Detected leaks
      </AppText>

      {rawLeaks.map((leak, idx) => (
        <LeakCard
          key={idx}
          leak={leak}
          expanded={expandedLeak === idx}
          onToggle={() => setExpandedLeak(expandedLeak === idx ? null : idx)}
        />
      ))}

      <Button
        size="lg"
        fullWidth
        onPress={goToHome}
        className="mt-4 h-14 rounded-[24px]"
        icon={<MaterialCommunityIcons name="home-outline" size={20} color="#fff" />}
      >
        Go to home
      </Button>
    </Screen>
  );
}
