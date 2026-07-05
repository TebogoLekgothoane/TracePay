import React, { useEffect, useState } from "react";
import { View, ScrollView, Modal, Pressable, AppState } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useScreenInsets } from "@/hooks/useScreenInsets";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import CircularProgress from "@/components/CircularProgress";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore, getActiveLeakStats, DEFAULT_MONTHLY_INCOME } from "@/stores/leaksStore";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";
import { PARTNERS } from "@/constants/partners";
import { useIngestion } from "@/context/SMSIngestionContext";
import { TransactionRow } from "@/components/TransactionRow";
import { PartnerDealCard } from "@/components/PartnerDealCard";

const ACTIONS = [
  { id: "freeze", label: "Freeze\nLeaks", icon: "snowflake" },
  { id: "budget", label: "Smart\nBudget", icon: "chart-bar" },
  { id: "scan", label: "Rescan\nSMS", icon: "message-text-outline" },
  { id: "history", label: "History", icon: "chart-line" },
] as const;

function QuickActionCard({
  label,
  icon,
  iconColor,
  onPress,
}: {
  label: string;
  icon: string;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-90">
      <Card className="h-[126px] p-0" contentClassName="flex-1 items-center justify-center gap-3 py-4">
        <MaterialCommunityIcons name={icon as any} size={28} color={iconColor} />
        <AppText variant="bodySm" className="text-center font-medium text-foreground">
          {label}
        </AppText>
      </Card>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { topOffset } = useScreenInsets();
  const { colors, isDarkColorScheme } = useColorScheme();
  const { monthlyIncome, rewardPoints, name } = useProfileStore();
  const ensureDailyCheckIn = useProfileStore((s) => s.ensureDailyCheckIn);
  const { leaks, fetchLeaks } = useLeaksStore();
  const { transactions } = useIngestion();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    void fetchLeaks();
  }, [fetchLeaks]);

  useEffect(() => {
    void ensureDailyCheckIn();
  }, [ensureDailyCheckIn]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void ensureDailyCheckIn();
      }
    });

    return () => sub.remove();
  }, [ensureDailyCheckIn]);

  const { activeLeaks, totalMonthly: totalLeaking } = getActiveLeakStats(leaks);
  const estimatedIncome = monthlyIncome > 0 ? monthlyIncome : DEFAULT_MONTHLY_INCOME;
  const healthScore = Math.max(0, 100 - Math.round((totalLeaking / estimatedIncome) * 100));
  const healthColor =
    healthScore >= 70 ? colors.success : healthScore >= 40 ? colors.warning : colors.destructive;
  const healthLabel = healthScore >= 70 ? "HEALTHY" : healthScore >= 40 ? "FAIR" : "AT RISK";
  const trackColor = isDarkColorScheme ? "rgba(255, 255, 255, 0.12)" : colors.border;
  const recentTransactions = transactions.slice(0, 5);
  const firstName = name.trim().split(/\s+/).filter(Boolean)[0] ?? "there";

  const handleActionPress = (id: string) => {
    if (id === "history") {
      router.push("/(tabs)/history");
    } else if (id === "budget") {
      router.push("/(tabs)/budget");
    } else if (id === "freeze") {
      router.push("/(tabs)/sms-scan");
    } else if (id === "scan") {
      router.push("/(tabs)/sms-scanning");
    }
  };

  return (
    <>
      <Screen contentClassName="pb-6">
          <View className="mb-6 flex-row items-start justify-between pt-2">
            <View className="flex-1 pr-4">
              <AppText variant="titleLg" className="text-[30px] leading-[36px]">
                Welcome back, {firstName}
              </AppText>
              <AppText variant="lead" className="mt-1">
                Here&apos;s your financial overview
              </AppText>
            </View>
            <Button
              variant="outline"
              size="icon"
              className="icon-btn-circle relative"
              onPress={() => setShowNotifications(true)}
            >
              <Feather name="bell" size={22} color={colors.foreground} />
              {activeLeaks.length > 0 ? (
                <View className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-violet-500" />
              ) : null}
            </Button>
          </View>

          <Card className="mb-5" contentClassName="gap-4">
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.primary} />
              <AppText variant="overlineBrand" className="ml-1 flex-1">
                Financial health
              </AppText>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </View>

            <View className="flex-row items-center gap-6">
              <CircularProgress
                value={healthScore}
                max={100}
                size={112}
                strokeWidth={9}
                color={healthColor}
                trackColor={trackColor}
                label={String(healthScore)}
                sublabel={healthLabel}
              />
              <View className="flex-1 gap-4">
                <View>
                  <AppText variant="label" className="mb-0.5 text-muted-foreground">
                    Leaks found
                  </AppText>
                  <AppText variant="titleMd" className="text-green-600 dark:text-green-400">
                    {activeLeaks.length}
                  </AppText>
                  <AppText variant="caption" className="mt-1">
                    {activeLeaks.length > 0
                      ? "Review active leaks to lower your monthly spend."
                      : "Great job! No leaks detected."}
                  </AppText>
                </View>
                <View className="h-px bg-border dark:bg-white/10" />
                <View>
                  <AppText variant="label" className="mb-0.5 text-muted-foreground">
                    Monthly savings
                  </AppText>
                  <AppText variant="titleMd" className="text-green-600 dark:text-green-400">
                    R{totalLeaking > 0 ? totalLeaking.toFixed(0) : "0"}
                  </AppText>
                  <AppText variant="caption" className="mt-1">
                    Keep it up and grow your savings.
                  </AppText>
                </View>
              </View>
            </View>
          </Card>

          <View className="mb-6 flex-row gap-3">
            {ACTIONS.map((action) => (
              <QuickActionCard
                key={action.id}
                label={action.label}
                icon={action.icon}
                iconColor={colors.foreground}
                onPress={() => handleActionPress(action.id)}
              />
            ))}
          </View>

          {activeLeaks.length > 0 ? (
            <>
              <View className="mb-3 flex-row items-center justify-between">
                <View>
                  <AppText variant="title">Active leaks</AppText>
                  <AppText variant="caption" className="mt-0.5">
                    {activeLeaks.length} active - R{totalLeaking.toFixed(2)}/mo
                  </AppText>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-0 px-0"
                  onPress={() => router.push("/(tabs)/sms-results")}
                >
                  <AppText variant="label" className="text-brand-purple dark:text-primary">
                    See all
                  </AppText>
                </Button>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-[18px] mb-6"
                contentContainerClassName="gap-3 px-[18px] pb-1"
              >
                {activeLeaks.slice(0, 3).map((leak) => (
                  <Card key={leak.id} className="w-[150px]" contentClassName="gap-0">
                    <MaterialCommunityIcons
                      name={(leak.categoryIcon as any) ?? "credit-card-outline"}
                      size={22}
                      color={colors.primary}
                    />
                    <AppText variant="label" className="mb-0.5" numberOfLines={1}>
                      {leak.name}
                    </AppText>
                    <AppText variant="caption" className="mb-2" numberOfLines={1}>
                      {leak.category}
                    </AppText>
                    <AppText variant="title" className="text-red-600 dark:text-red-400">
                      -R{leak.amountMonthly.toFixed(2)}
                    </AppText>
                    <AppText variant="caption">/month</AppText>
                  </Card>
                ))}
              </ScrollView>
            </>
          ) : (
            <Card className="mb-6" contentClassName="flex-row items-center gap-4">
              <MaterialCommunityIcons name="file-search-outline" size={42} color={colors.primary} />
              <View className="min-w-0 flex-1">
                <AppText variant="titleMd">No leaks detected yet</AppText>
                <AppText variant="bodySm" className="mt-2 leading-6">
                  Your SMS transactions are imported. We&apos;re analysing your data to uncover hidden
                  charges and recurring fees.
                </AppText>
                <Pressable onPress={() => router.push("/(tabs)/sms-scanning")} className="mt-4 self-start">
                  <AppText variant="label" className="text-brand-purple dark:text-primary">
                    Scan SMS inbox
                  </AppText>
                </Pressable>
              </View>
            </Card>
          )}

          <View className="mb-3 flex-row items-start">
            <View>
              <AppText variant="title">Rewards & perks</AppText>
              <AppText variant="caption" className="mt-0.5">
                {rewardPoints} pts - Earned by stopping leaks
              </AppText>
            </View>
            <View className="chip-purple justify-center">
              <MaterialCommunityIcons name="star-circle" size={14} color={colors.primary} />
              <AppText variant="caption" className="font-bold text-brand-purple dark:text-primary">
                {rewardPoints} pts
              </AppText>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-[18px] mb-6"
            contentContainerClassName="gap-3 px-[18px] pb-1"
          >
            {PARTNERS.map((r) => (
              <PartnerDealCard key={r.id} partner={r} pointsBalance={rewardPoints} />
            ))}
          </ScrollView>

          <View className="mb-3 flex-row items-center justify-between">
            <AppText variant="title">Recent transactions</AppText>
            {transactions.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-0 px-0"
                onPress={() => router.push("/(tabs)/history")}
              >
                <AppText variant="label" className="text-brand-purple dark:text-primary">
                  View all
                </AppText>
              </Button>
            ) : null}
          </View>

          {recentTransactions.length > 0 ? (
            recentTransactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                className="mb-2.5"
                tx={tx}
                onPress={() => router.push("/(tabs)/history")}
              />
            ))
          ) : (
            <EmptyState
              description="No transactions yet. Scan your SMS inbox to import bank activity."
              onPress={() => router.push("/(tabs)/sms-scanning")}
              icon={
                <MaterialCommunityIcons name="message-text-outline" size={24} color={colors.mutedForeground} />
              }
            />
          )}
      </Screen>

      <Modal
        visible={showNotifications}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifications(false)}
      >
        <Pressable
          className="flex-1 justify-start bg-black/40"
          onPress={() => setShowNotifications(false)}
        >
          <Pressable
            className="surface-panel max-h-[75%] rounded-b-3xl px-5 pb-8 shadow-xl"
            style={{ paddingTop: topOffset }}
            onPress={() => {}}
          >
            <View className="mb-3 flex-row items-center border-b border-border py-4 dark:border-white/10">
              <AppText variant="title" className="flex-1">
                Notifications
              </AppText>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => setShowNotifications(false)}
                className="min-h-0 h-[34px] w-[34px] rounded-full bg-muted dark:bg-white/10"
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Button>
            </View>

            {activeLeaks.length === 0 ? (
              <EmptyState
                card={false}
                description="No new alerts"
                icon={<Feather name="bell-off" size={32} color={colors.mutedForeground} />}
              />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <AppText variant="overline" className="mb-3">
                  Active leaks
                </AppText>
                {activeLeaks.map((leak, i) => {
                  const sev = getSeverityStyle(leak.severity);
                  return (
                    <Button
                      key={leak.id ?? i}
                      variant="ghost"
                      className="min-h-0 flex-row items-center gap-3 border-b border-border py-3 dark:border-white/10"
                      onPress={() => {
                        setShowNotifications(false);
                        router.push("/(tabs)/sms-scan");
                      }}
                    >
                      <View
                        className={cn(
                          "h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]",
                          sev.badge,
                        )}
                      >
                        <MaterialCommunityIcons
                          name={(leak.categoryIcon as any) ?? "alert"}
                          size={16}
                          color={sev.icon}
                        />
                      </View>
                      <View className="flex-1">
                        <AppText variant="label" className="mb-0.5">
                          {leak.name}
                        </AppText>
                        <AppText variant="caption">
                          {leak.category} - R{leak.amountMonthly.toFixed(2)}/mo
                        </AppText>
                      </View>
                      <View className={cn("rounded-md px-2 py-[3px]", sev.badge)}>
                        <AppText variant="caption" className={cn("font-semibold", sev.text)}>
                          {leak.severity}
                        </AppText>
                      </View>
                    </Button>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
