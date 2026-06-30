import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import CircularProgress from "@/components/CircularProgress";
import { Screen } from "@/components/Screen";
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
  { id: "shoprite", partner: "Shoprite", offer: "5% off groceries", icon: "cart-outline", color: "#DC2626", iconBg: "bg-red-100", ptsNeeded: 150 },
  { id: "pnp", partner: "Pick n Pay", offer: "R20 voucher", icon: "shopping-outline", color: "#16A34A", iconBg: "bg-green-100", ptsNeeded: 200 },
  { id: "checkers", partner: "Checkers", offer: "3% cashback", icon: "cash-check", color: "#0085C7", iconBg: "bg-blue-100", ptsNeeded: 180 },
  { id: "mrprice", partner: "Mr Price", offer: "10% off clothing", icon: "hanger", color: "#D97706", iconBg: "bg-amber-100", ptsNeeded: 120 },
  { id: "clicks", partner: "Clicks", offer: "R15 off pharmacy", icon: "medical-bag", color: "#7C3AED", iconBg: "bg-brand-purple-light", ptsNeeded: 100 },
  { id: "woolworths", partner: "Woolworths", offer: "8% off food", icon: "food-apple-outline", color: "#111827", iconBg: "bg-gray-100", ptsNeeded: 160 },
];

const ACTIONS = [
  { id: "freeze", label: "Freeze\nLeaks", icon: "snowflake", bgClass: "bg-brand-purple" },
  { id: "budget", label: "Smart\nBudget", icon: "chart-bar", bgClass: "bg-brand-purple" },
  { id: "scan", label: "Rescan\nSMS", icon: "message-text-outline", bgClass: "bg-violet-400" },
  { id: "history", label: "History", icon: "chart-line", bgClass: "bg-brand-purple-muted" },
];

export default function HomeScreen() {
  const { topOffset } = useScreenInsets();
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
  const healthColor = healthScore >= 70 ? "#16A34A" : healthScore >= 40 ? "#D97706" : "#DC2626";
  const healthLabel = healthScore >= 70 ? "HEALTHY" : healthScore >= 40 ? "FAIR" : "AT RISK";

  const handleActionPress = (id: string) => {
    if (id === "history") {
      router.push("/history");
    } else if (id === "budget") {
      router.push("/(tabs)/budget");
    } else if (id === "freeze") {
      router.push("/(tabs)/sms-scan");
    } else if (id === "scan") {
      router.push("/sms-scanning");
    }
  };

  const firstName = name.split(" ")[0] ?? name;

  return (
    <>
    <Screen>
      <View className="flex-row justify-between items-start mb-5">
        <View>
          <Text className="overline mb-1">WELCOME BACK</Text>
          <Text className="heading-lg">{firstName} 👋</Text>
        </View>
        <Button variant="outline" size="icon" className="icon-btn-circle" onPress={() => setShowNotifications(true)}>
          <Feather name="bell" size={22} color="#374151" />
          {activeLeaks.length > 0 && (
            <View className="absolute top-1.5 right-1.5 bg-red-500 rounded-lg min-w-4 h-4 items-center justify-center px-[3px]">
              <Text className="text-[10px] font-bold text-white">{activeLeaks.length}</Text>
            </View>
          )}
        </Button>
      </View>

      <View className="card p-[18px] mb-5 shadow-md">
        <View className="flex-row items-center mb-4">
          <MaterialCommunityIcons name="star-four-points-outline" size={16} color="#7C3AED" />
          <Text className="flex-1 overline-brand"> FINANCIAL HEALTH</Text>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => speak(`Your financial health score is ${healthScore} out of 100. You are ${healthLabel}. You have ${activeLeaks.length} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`)}
            className="p-1 min-h-0"
          >
            <MaterialCommunityIcons name="volume-high" size={16} color="#7C3AED" />
          </Button>
        </View>
        <View className="flex-row items-center gap-6">
          <CircularProgress
            value={healthScore}
            max={100}
            size={110}
            strokeWidth={9}
            color={healthColor}
            trackColor="#E5E7EB"
            label={String(healthScore)}
            sublabel={healthLabel}
          />
          <View className="flex-1 gap-4">
            <View>
              <Text className="label-sm text-gray-500 mb-0.5">Leaks Found</Text>
              <Text className="text-[22px] font-bold text-red-600">{activeLeaks.length}</Text>
            </View>
            <View>
              <Text className="label-sm text-gray-500 mb-0.5">Monthly Savings</Text>
              <Text className="text-[22px] font-bold text-green-600">
                R{totalLeaking > 0 ? totalLeaking.toFixed(0) : "0"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="flex-row justify-between mb-6">
        {ACTIONS.map((action) => (
          <Button
            key={action.id}
            variant="ghost"
            className="flex-col items-center flex-1 min-h-0"
            onPress={() => handleActionPress(action.id)}
          >
            <View className={cn("w-14 h-14 rounded-2xl items-center justify-center mb-2", action.bgClass)}>
              <MaterialCommunityIcons name={action.icon as any} size={24} color="#FFFFFF" />
            </View>
            <Text className="text-xs font-medium text-gray-700 text-center">{action.label}</Text>
          </Button>
        ))}
      </View>

      {activeLeaks.length > 0 && (
        <>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="heading-md">Active Money Leaks</Text>
            <View className="badge-danger">
              <Text className="text-xs font-semibold text-red-600">-R{totalLeaking.toFixed(2)}/mo</Text>
            </View>
          </View>

          {activeLeaks.slice(0, 5).map((leak) => (
            <Button
              key={leak.id}
              variant="ghost"
              className="card-row"
              onPress={() => router.push("/(tabs)/sms-scan")}
            >
              <View className="w-10 h-10 rounded-[10px] bg-brand-purple-light items-center justify-center mr-3">
                <MaterialCommunityIcons
                  name={(leak.categoryIcon as any) ?? "credit-card-outline"}
                  size={20}
                  color="#7C3AED"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-strong mb-0.5" numberOfLines={1}>{leak.name}</Text>
                <Text className="body-text">{leak.category}</Text>
              </View>
              <View className="items-end mr-1.5">
                <Text className="text-[15px] font-bold text-red-600">-R{leak.amountMonthly.toFixed(2)}</Text>
                <Text className="caption">/month</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#9CA3AF" />
            </Button>
          ))}
        </>
      )}

      {activeLeaks.length === 0 && (
        <Button
          variant="outline"
          className="flex-row items-center gap-3.5 bg-brand-purple-light rounded-[14px] p-[18px] mb-5"
          onPress={() => router.push("/sms-scanning")}
        >
          <MaterialCommunityIcons name="magnify-scan" size={28} color="#7C3AED" />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-brand-purple-dark">No leaks detected yet</Text>
            <Text className="text-[13px] font-sans text-brand-purple mt-0.5">Tap to scan your SMS inbox and find money leaks</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        </Button>
      )}

      <View className="flex-row justify-between items-start mt-6 mb-3">
        <View>
          <Text className="heading-md">Rewards & Perks</Text>
          <Text className="caption mt-0.5">{rewardPoints} pts · Earned by stopping leaks</Text>
        </View>
        <View className="chip-purple">
          <MaterialCommunityIcons name="star-circle" size={14} color="#7C3AED" />
          <Text className="text-xs font-bold text-brand-purple">{rewardPoints} pts</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px]"
        contentContainerClassName="px-[18px] gap-3 pb-1"
      >
        {REWARDS.map((r) => (
          <View key={r.id} className="card w-[140px] dark:border-0 border border-gray-100">
            <View className={cn("w-11 h-11 rounded-xl items-center justify-center mb-2.5", r.iconBg)}>
              <MaterialCommunityIcons name={r.icon as any} size={26} color={r.color} />
            </View>
            <Text className="text-[13px] font-bold text-strong mb-0.5">{r.partner}</Text>
            <Text className="text-xs font-sans text-gray-700 mb-2 leading-4">{r.offer}</Text>
            <View className="flex-row items-center gap-[3px] mb-2.5">
              <MaterialCommunityIcons name="star-circle-outline" size={12} color="#7C3AED" />
              <Text className="text-[11px] font-medium text-brand-purple">{r.ptsNeeded} pts</Text>
            </View>
            <Button
              size="sm"
              fullWidth
              disabled={rewardPoints < r.ptsNeeded}
              className="rounded-lg py-[7px]"
              textClassName={cn(rewardPoints < r.ptsNeeded && "text-gray-400")}
            >
              {rewardPoints >= r.ptsNeeded ? "Redeem" : "Need more pts"}
            </Button>
          </View>
        ))}
      </ScrollView>

      <View className="flex-row justify-between items-center mb-3">
        <Text className="heading-md">Recent Transactions</Text>
        <Button variant="link" onPress={() => router.push("/history")}>
          See all
        </Button>
      </View>

      {SAMPLE_TRANSACTIONS.map((tx) => (
        <View key={tx.id} className="card-row">
          <View className={cn("w-[38px] h-[38px] rounded-[10px] items-center justify-center mr-3", tx.isLeak ? "bg-red-100" : "bg-gray-100")}>
            {tx.isLeak ? (
              <Feather name="alert-triangle" size={16} color="#DC2626" />
            ) : (
              <Feather name="arrow-up-right" size={16} color="#6B7280" />
            )}
          </View>
          <View className="flex-1">
            <Text className="list-row-title mb-0.5">{tx.name}</Text>
            <Text className="caption">{tx.date}</Text>
          </View>
          <View className="items-end gap-1">
            <Text className="text-sm font-bold text-strong">{tx.amount}</Text>
            {tx.isLeak && (
              <View className="badge-danger py-0.5">
                <Text className="text-[11px] font-semibold text-red-600">Leak</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </Screen>

    <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
      <Pressable className="flex-1 bg-black/40 justify-start" onPress={() => setShowNotifications(false)}>
        <Pressable
          className="surface-panel px-5 pb-8 max-h-[75%] rounded-b-3xl shadow-xl"
          style={{ paddingTop: topOffset }}
          onPress={() => {}}
        >
          <View className="flex-row items-center py-4 border-b border-gray-100 mb-3">
            <Text className="flex-1 heading-md">Notifications</Text>
            <Button variant="ghost" size="icon" onPress={() => setShowNotifications(false)} className="w-[34px] h-[34px] rounded-full bg-gray-100 min-h-0">
              <Feather name="x" size={20} color="#6B7280" />
            </Button>
          </View>

          {activeLeaks.length === 0 ? (
            <View className="items-center py-10 gap-3">
              <Feather name="bell-off" size={32} color="#D1D5DB" />
              <Text className="text-[15px] font-sans text-gray-400">No new alerts</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="overline mb-3">ACTIVE MONEY LEAKS</Text>
              {activeLeaks.map((leak, i) => {
                const sev = getSeverityStyle(leak.severity);
                return (
                  <Button
                    key={leak.id ?? i}
                    variant="ghost"
                    className="flex-row items-center gap-3 py-3 border-b border-gray-50"
                    onPress={() => {
                      setShowNotifications(false);
                        router.push("/(tabs)/sms-scan");
                    }}
                  >
                    <View className={cn("w-[38px] h-[38px] rounded-[10px] items-center justify-center shrink-0", sev.badge)}>
                      <MaterialCommunityIcons name={leak.categoryIcon as any ?? "alert"} size={16} color={sev.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className="list-row-title mb-0.5">{leak.name}</Text>
                      <Text className="caption">{leak.category} · R{leak.amountMonthly.toFixed(2)}/mo</Text>
                    </View>
                    <View className={cn("px-2 py-[3px] rounded-md", sev.badge)}>
                      <Text className={cn("text-[11px] font-semibold", sev.text)}>{leak.severity}</Text>
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
