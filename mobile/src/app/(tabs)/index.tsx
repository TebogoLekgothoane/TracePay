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
import { useLeaksStore } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";

const SAMPLE_TRANSACTIONS = [
  { id: "1", name: "MTN Airtime Advance", date: "20 Apr · MTN Advance", amount: "-R11", isLeak: true },
  { id: "2", name: "Cash Payment - S. Nkosi", date: "20 Apr · S. Nkosi", amount: "-R350", isLeak: true },
  { id: "3", name: "ATM Withdrawal - Capitec", date: "19 Apr · Capitec ATM", amount: "-R300", isLeak: true },
  { id: "4", name: "Woolworths Groceries", date: "18 Apr · Woolworths", amount: "-R425", isLeak: false },
  { id: "5", name: "Taxi Fare - Mdantsane", date: "18 Apr · MoMo Transfer", amount: "-R25", isLeak: false },
];

const REWARDS = [
  { id: "shoprite", partner: "Shoprite", offer: "5% off groceries", icon: "cart-outline", color: "#DC2626", iconBg: "bg-red-100 dark:bg-red-900/40", ptsNeeded: 150 },
  { id: "pnp", partner: "Pick n Pay", offer: "R20 voucher", icon: "shopping-outline", color: "#16A34A", iconBg: "bg-green-100 dark:bg-green-900/40", ptsNeeded: 200 },
  { id: "checkers", partner: "Checkers", offer: "3% cashback", icon: "cash-check", color: "#0085C7", iconBg: "bg-blue-100 dark:bg-blue-900/40", ptsNeeded: 180 },
  { id: "mrprice", partner: "Mr Price", offer: "10% off clothing", icon: "hanger", color: "#D97706", iconBg: "bg-amber-100 dark:bg-amber-900/40", ptsNeeded: 120 },
  { id: "clicks", partner: "Clicks", offer: "R15 off pharmacy", icon: "medical-bag", color: "#7C3AED", iconBg: "bg-brand-purple-light dark:bg-primary/20", ptsNeeded: 100 },
  { id: "woolworths", partner: "Woolworths", offer: "8% off food", icon: "food-apple-outline", color: "#111827", iconBg: "bg-gray-100 dark:bg-white/10", ptsNeeded: 160 },
];

const ACTIONS = [
  { id: "freeze", label: "Freeze\nLeaks", icon: "snowflake", bgClass: "bg-brand-purple" },
  { id: "budget", label: "Smart\nBudget", icon: "chart-bar", bgClass: "bg-brand-purple" },
  { id: "scan", label: "Rescan\nSMS", icon: "message-text-outline", bgClass: "bg-violet-400" },
  { id: "history", label: "History", icon: "chart-line", bgClass: "bg-brand-purple-muted" },
];

export default function HomeScreen() {
  const { topOffset } = useScreenInsets();
  const { colors, isDarkColorScheme } = useColorScheme();
  const { name, monthlyIncome, rewardPoints } = useProfileStore();
  const { leaks, fetchLeaks } = useLeaksStore();
  const { speak } = useVoice();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    (async () => {
      await fetchLeaks();
      const { leaks: current, addLeaks } = useLeaksStore.getState();
      if (current.length === 0) {
        await addLeaks([
          {
            name: "iflix Subscription",
            category: "Zombie Subscription",
            categoryIcon: "television-play",
            amountMonthly: 49.99,
            severity: "Medium",
            status: "active",
            sourceSms: "MTN: R49.99 deducted for iflix subscription.",
            advice: "Dial *141*9# on your MTN SIM to cancel iflix and stop the R49.99 monthly charge.",
          },
          {
            name: "Capitec Loan Interest",
            category: "Loan Interest",
            categoryIcon: "cash",
            amountMonthly: 87.50,
            severity: "High",
            status: "active",
            sourceSms: "Capitec: R350.00 deducted. Loan repayment + R87.50 interest. Acc ...4821",
            advice: "Visit Capitec and request a loan restructure — a shorter term reduces total interest by up to 40%.",
          },
          {
            name: "MTN Caller Tune",
            category: "Zombie Subscription",
            categoryIcon: "phone",
            amountMonthly: 39.96,
            severity: "Low",
            status: "active",
            sourceSms: "MTN: Caller Tune subscription renewed. R39.96 deducted.",
            advice: "Dial *135*5# on your MTN SIM to cancel Caller Tune and save R39.96 every month.",
          },
        ]);
      }
    })();
  }, [fetchLeaks]);

  const activeLeaks = leaks.filter((l) => l.status === "active");
  const totalLeaking = activeLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);
  const estimatedIncome = monthlyIncome > 0 ? monthlyIncome : 8500;
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

  const firstName = name.split(" ")[0] ?? name;

  return (
    <>
      <Screen>
        <View className="mb-5 flex-row items-start justify-between">
          <View>
            <AppText variant="overline" className="mb-1">
              Welcome back
            </AppText>
            <AppText variant="titleMd">{firstName} 👋</AppText>
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
          {REWARDS.map((r) => (
            <Card key={r.id} className="w-[140px]" contentClassName="gap-0">
              <View className={cn("mb-2.5 h-11 w-11 items-center justify-center rounded-xl", r.iconBg)}>
                <MaterialCommunityIcons name={r.icon as any} size={26} color={r.color} />
              </View>
              <AppText variant="label" className="mb-0.5">
                {r.partner}
              </AppText>
              <AppText variant="caption" className="mb-2 leading-4">
                {r.offer}
              </AppText>
              <View className="mb-2.5 flex-row items-center gap-[3px]">
                <MaterialCommunityIcons name="star-circle-outline" size={12} color={colors.primary} />
                <AppText variant="caption" className="text-brand-purple dark:text-primary">
                  {r.ptsNeeded} pts
                </AppText>
              </View>
              <Button
                size="sm"
                fullWidth
                disabled={rewardPoints < r.ptsNeeded}
                className="rounded-lg py-[7px]"
                textClassName={cn(rewardPoints < r.ptsNeeded && "text-muted-foreground")}
              >
                {rewardPoints >= r.ptsNeeded ? "Redeem" : "Need more pts"}
              </Button>
            </Card>
          ))}
        </ScrollView>

        <View className="mb-3 flex-row items-center justify-between">
          <AppText variant="title">Recent transactions</AppText>
          <Button variant="link" onPress={() => router.push("/(tabs)/history")}>
            See all
          </Button>
        </View>

        {SAMPLE_TRANSACTIONS.map((tx) => (
          <Card key={tx.id} className="mb-2.5" contentClassName="flex-row items-center gap-3">
            <View
              className={cn(
                "h-[38px] w-[38px] items-center justify-center rounded-[10px]",
                tx.isLeak ? "bg-red-100 dark:bg-red-900/40" : "bg-muted dark:bg-white/10",
              )}
            >
              {tx.isLeak ? (
                <Feather name="alert-triangle" size={16} color={colors.destructive} />
              ) : (
                <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
              )}
            </View>
            <View className="flex-1">
              <AppText variant="label" className="mb-0.5">
                {tx.name}
              </AppText>
              <AppText variant="caption">{tx.date}</AppText>
            </View>
            <View className="items-end gap-1">
              <AppText variant="label">{tx.amount}</AppText>
              {tx.isLeak ? (
                <View className="badge-danger py-0.5">
                  <AppText variant="caption" className="font-semibold text-red-600 dark:text-red-400">
                    Leak
                  </AppText>
                </View>
              ) : null}
            </View>
          </Card>
        ))}
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
