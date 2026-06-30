import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import CircularProgress from "@/components/CircularProgress";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore, getActiveLeakStats, DEFAULT_MONTHLY_INCOME } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";
import { DEMO_LEAKS } from "@/lib/simulate";
import { PARTNERS } from "@/constants/partners";

const ACTIONS = [
  { id: "freeze", label: "Freeze\nLeaks", icon: "snowflake", bgClass: "bg-brand-purple" },
  { id: "budget", label: "Smart\nBudget", icon: "chart-bar", bgClass: "bg-brand-purple" },
  { id: "scan", label: "Rescan\nSMS", icon: "message-text-outline", bgClass: "bg-violet-400" },
  { id: "history", label: "History", icon: "chart-line", bgClass: "bg-brand-purple-muted" },
];

export default function HomeScreen() {
  const { topOffset } = useScreenInsets();
  const { colors, isDarkColorScheme } = useColorScheme();
  const { monthlyIncome, rewardPoints } = useProfileStore();
  const { leaks, fetchLeaks } = useLeaksStore();
  const { speak } = useVoice();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    (async () => {
      await fetchLeaks();
      const { leaks: current, addLeaks } = useLeaksStore.getState();
      if (current.length === 0) {
        await addLeaks(
          DEMO_LEAKS.map((l) => ({
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
    })();
  }, [fetchLeaks]);

  const { activeLeaks, totalMonthly: totalLeaking } = getActiveLeakStats(leaks);
  const estimatedIncome = monthlyIncome > 0 ? monthlyIncome : DEFAULT_MONTHLY_INCOME;
  const healthScore = Math.max(0, 100 - Math.round((totalLeaking / estimatedIncome) * 100));
  const healthColor =
    healthScore >= 70 ? colors.success : healthScore >= 40 ? colors.warning : colors.destructive;
  const healthLabel = healthScore >= 70 ? "HEALTHY" : healthScore >= 40 ? "FAIR" : "AT RISK";
  const trackColor = isDarkColorScheme ? "rgba(255, 255, 255, 0.12)" : colors.border;

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
      <Screen>
        <View className="mb-5 flex-row items-start justify-between">
          <View>
            <AppText variant="overline" className="mb-1">
              Welcome back
            </AppText>
          </View>
          <Button
            variant="outline"
            size="icon"
            className="icon-btn-circle"
            onPress={() => setShowNotifications(true)}
          >
            <Feather name="bell" size={22} color={colors.foreground} />
            {activeLeaks.length > 0 ? (
              <View className="absolute right-1.5 top-1.5 min-h-4 min-w-4 items-center justify-center rounded-lg bg-red-500 px-[3px]">
                <AppText className="text-[10px] font-bold text-white">
                  {activeLeaks.length}
                </AppText>
              </View>
            ) : null}
          </Button>
        </View>

        <Card className="mb-5" contentClassName="gap-4">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="star-four-points-outline" size={16} color={colors.primary} />
            <AppText variant="overlineBrand" className="ml-1 flex-1">
              Financial health
            </AppText>
            <Button
              variant="ghost"
              size="icon"
              onPress={() =>
                speak(
                  `Your financial health score is ${healthScore} out of 100. You are ${healthLabel}. You have ${activeLeaks.length} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`,
                )
              }
              className="min-h-0 p-1"
            >
              <MaterialCommunityIcons name="volume-high" size={16} color={colors.primary} />
            </Button>
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
                <AppText variant="titleMd" className="text-red-600 dark:text-red-400">
                  {activeLeaks.length}
                </AppText>
              </View>
              <View>
                <AppText variant="label" className="mb-0.5 text-muted-foreground">
                  Monthly savings
                </AppText>
                <AppText variant="titleMd" className="text-green-600 dark:text-green-400">
                  R{totalLeaking > 0 ? totalLeaking.toFixed(0) : "0"}
                </AppText>
              </View>
            </View>
          </View>
        </Card>

        <View className="mb-6 flex-row justify-between">
          {ACTIONS.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              className="min-h-0 flex-1 flex-col items-center"
              onPress={() => handleActionPress(action.id)}
            >
              <View
                className={cn(
                  "mb-2 h-14 w-14 items-center justify-center rounded-2xl",
                  action.bgClass,
                )}
              >
                <MaterialCommunityIcons name={action.icon as any} size={24} color="#FFFFFF" />
              </View>
              <AppText variant="caption" className="text-center font-medium text-foreground">
                {action.label}
              </AppText>
            </Button>
          ))}
        </View>

        {activeLeaks.length > 0 ? (
          <>
            <View className="mb-3 flex-row items-center justify-between">
              <AppText variant="title">Active money leaks</AppText>
              <View className="badge-danger">
                <AppText variant="caption" className="font-semibold text-red-600 dark:text-red-400">
                  -R{totalLeaking.toFixed(2)}/mo
                </AppText>
              </View>
            </View>

            {activeLeaks.slice(0, 5).map((leak) => (
              <Pressable
                key={leak.id}
                onPress={() => router.push("/(tabs)/sms-scan")}
                className="mb-2.5 active:opacity-90"
              >
                <Card contentClassName="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-purple-light dark:bg-primary/20">
                    <MaterialCommunityIcons
                      name={(leak.categoryIcon as any) ?? "credit-card-outline"}
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText variant="title" numberOfLines={1}>
                      {leak.name}
                    </AppText>
                    <AppText variant="bodySm">{leak.category}</AppText>
                  </View>
                  <View className="items-end">
                    <AppText variant="label" className="text-red-600 dark:text-red-400">
                      -R{leak.amountMonthly.toFixed(2)}
                    </AppText>
                    <AppText variant="caption">/month</AppText>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Card>
              </Pressable>
            ))}
          </>
        ) : (
          <Pressable
            onPress={() => router.push("/(tabs)/sms-scanning")}
            className="mb-5 active:opacity-90"
          >
            <Card
              glass={false}
              className="border border-brand-purple/20 bg-brand-purple-light dark:border-primary/30 dark:bg-primary/10"
              contentClassName="flex-row items-center gap-3.5"
            >
              <MaterialCommunityIcons name="magnify-scan" size={28} color={colors.primary} />
              <View className="flex-1">
                <AppText variant="title" className="text-brand-purple dark:text-primary">
                  No leaks detected yet
                </AppText>
                <AppText variant="bodySm" className="mt-0.5 text-brand-purple dark:text-primary/80">
                  Tap to scan your SMS inbox and find money leaks
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Card>
          </Pressable>
        )}

        <View className="mb-3 mt-6 flex-row items-start justify-between">
          <View>
            <AppText variant="title">Rewards & perks</AppText>
            <AppText variant="caption" className="mt-0.5">
              {rewardPoints} pts · Earned by stopping leaks
            </AppText>
          </View>
          <View className="chip-purple">
            <MaterialCommunityIcons name="star-circle" size={14} color={colors.primary} />
            <AppText variant="caption" className="font-bold text-brand-purple dark:text-primary">
              {rewardPoints} pts
            </AppText>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-[18px]"
          contentContainerClassName="gap-3 px-[18px] pb-1"
        >
          {PARTNERS.map((r) => (
            <Card key={r.id} className="w-[140px]" contentClassName="gap-0">
              <View className={cn("mb-2.5 h-11 w-11 items-center justify-center rounded-xl", r.iconBg)}>
                <MaterialCommunityIcons name={r.icon as any} size={26} color={r.color} />
              </View>
              <AppText variant="label" className="mb-0.5">
                {r.name}
              </AppText>
              <AppText variant="caption" className="mb-2 leading-4">
                {r.offer}
              </AppText>
              <View className="mb-2.5 flex-row items-center gap-[3px]">
                <MaterialCommunityIcons name="star-circle-outline" size={12} color={colors.primary} />
                <AppText variant="caption" className="text-brand-purple dark:text-primary">
                  {r.pts} pts
                </AppText>
              </View>
              <Button
                size="sm"
                fullWidth
                disabled={rewardPoints < r.pts}
                className="rounded-lg py-[7px]"
                textClassName={cn(rewardPoints < r.pts && "text-muted-foreground")}
              >
                {rewardPoints >= r.pts ? "Redeem" : "Need more pts"}
              </Button>
            </Card>
          ))}
        </ScrollView>
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
              <View className="items-center gap-3 py-10">
                <Feather name="bell-off" size={32} color={colors.mutedForeground} />
                <AppText variant="bodyMuted">No new alerts</AppText>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <AppText variant="overline" className="mb-3">
                  Active money leaks
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
                          {leak.category} · R{leak.amountMonthly.toFixed(2)}/mo
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
