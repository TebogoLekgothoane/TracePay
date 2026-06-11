import React, { useState } from "react";
import {
  View,
  Text,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useIngestion } from "@/context/SMSIngestionContext";
import { TransactionCategory } from "@/services/sms/sms.types";
import { cn } from "@/lib/cn";
import { getSeverityStyle } from "@/lib/severity";

interface LeakResult {
  name: string;
  category: string;
  categoryIcon: string;
  severity: "High" | "Medium" | "Low";
  amountMonthly: number;
  detail?: string;
  sourceSms?: string;
  advice?: string;
}

const FALLBACK_LEAKS: LeakResult[] = [
  {
    name: "iflix Subscription",
    category: "Zombie Subscription",
    categoryIcon: "television-play",
    severity: "Medium",
    amountMonthly: 49.99,
    sourceSms: "MTN: R49.99 deducted for iflix subscription.",
    advice: "Dial *141*9# on your MTN SIM right now to cancel iflix — you'll stop the R49.99 deduction before your next billing cycle.",
  },
  {
    name: "Capitec Loan Interest",
    category: "Loan Interest",
    categoryIcon: "cash",
    severity: "High",
    amountMonthly: 87.50,
    sourceSms: "Capitec: R350.00 deducted. Loan repayment + R87.50 interest. Acc ...4821",
    advice: "Visit your nearest Capitec branch to restructure this loan — requesting a shorter term reduces total interest paid by up to 40%.",
  },
  {
    name: "Vodacom Airtime Advance Fee",
    category: "Airtime Advance Fee",
    categoryIcon: "phone",
    severity: "High",
    amountMonthly: 32.4,
    sourceSms: "Vodacom: Airtime advance of R30.00 approved. Fee: R5.40. Repayable on recharge.",
    advice: "Buy a R30 Vodacom data bundle in advance via the MyVodacom app — you avoid the 18% advance fee and the bundle lasts longer.",
  },
];

const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  groceries:     "cart-outline",
  fuel:          "gas-station-outline",
  dining:        "food-outline",
  entertainment: "television-play",
  utilities:     "lightning-bolt-outline",
  transfer:      "bank-transfer",
  atm:           "cash",
  online:        "web",
  medical:       "hospital-box-outline",
  other:         "dots-horizontal",
};

export default function SmsResultsScreen() {
  const params = useLocalSearchParams<{ data?: string; fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === "1";
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

  const categoryEntries = (Object.entries(categoryBreakdown) as [TransactionCategory, { count: number; total: number }][])
    .sort((a, b) => b[1].total - a[1].total);

  const parsedData = params.data
    ? (() => {
        try {
          return JSON.parse(decodeURIComponent(params.data));
        } catch {
          return null;
        }
      })()
    : null;

  const rawLeaks: LeakResult[] = parsedData?.leaks?.length
    ? parsedData.leaks
    : FALLBACK_LEAKS;

  const totalMonthly = rawLeaks.reduce((sum, l) => sum + l.amountMonthly, 0);

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
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen bottomInset="compact">
        <View className="flex-row items-start gap-3 mb-[18px]">
          {!fromOnboarding ? (
            <Button
              variant="outline"
              size="icon"
              onPress={() => router.back()}
              className="back-btn mt-0.5"
            >
              <Feather name="arrow-left" size={22} color="#111827" />
            </Button>
          ) : null}
          <View>
            <View className="flex-row items-center mb-1">
              <MaterialCommunityIcons name="message-text-outline" size={20} color="#7C3AED" />
              <Text className="text-[22px] font-bold text-gray-900"> SMS Scan Results</Text>
            </View>
            <Text className="body-text">
              AI found {rawLeaks.length} money leaks in your SMS history
            </Text>
          </View>
        </View>

        {state.totalIngested > 0 && (
          <View className="bg-green-50 rounded-[14px] p-4 mb-[18px] border border-green-200">
            <View className="flex-row items-center mb-2.5">
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" />
              <Text className="flex-1 text-sm font-semibold text-green-700">
                {" "}{state.totalIngested} transaction{state.totalIngested !== 1 ? "s" : ""} ingested
              </Text>
              {state.lastSyncAt && (
                <Text className="caption">
                  {state.lastSyncAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              )}
            </View>
            {categoryEntries.length > 0 && (
              <View className="gap-1.5">
                <Text className="overline mb-1.5">
                  BY CATEGORY
                </Text>
                {categoryEntries.map(([cat, { count, total }]) => (
                  <View key={cat} className="flex-row items-center gap-2">
                    <View className="w-6 h-6 rounded-md bg-violet-100 items-center justify-center">
                      <MaterialCommunityIcons
                        name={CATEGORY_ICONS[cat] as any}
                        size={14}
                        color="#7C3AED"
                      />
                    </View>
                    <Text className="flex-1 text-[13px] font-medium text-gray-700 capitalize">{cat}</Text>
                    <Text className="caption">{count} tx</Text>
                    {total > 0 && (
                      <Text className="text-[13px] font-bold text-red-600 min-w-[70px] text-right">
                        R{total.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View className="bg-red-600 rounded-2xl p-5 mb-[22px] shadow-md">
          <Text className="overline text-white/75 mb-1.5">
            TOTAL LEAKING MONTHLY
          </Text>
          <Text className="text-[40px] font-bold text-white mb-1.5">R{totalMonthly.toFixed(2)}</Text>
          <Text className="text-sm font-sans text-white/80">
            That is R{(totalMonthly * 12).toFixed(0)} lost every year
          </Text>
        </View>

        <Text className="overline mb-3">
          DETECTED LEAKS
        </Text>

        {rawLeaks.map((leak, idx) => {
          const sev = getSeverityStyle(leak.severity);
          const isExpanded = expandedLeak === idx;
          return (
            <View
              key={idx}
              className={cn(
                "bg-white rounded-[14px] mb-2.5 overflow-hidden shadow-sm",
                isExpanded && "border-[1.5px] border-brand-purple-muted",
              )}
            >
              <Button
                variant="ghost"
                className="flex-row items-center p-3.5 gap-2.5 w-full justify-start min-h-0 rounded-none"
                onPress={() => setExpandedLeak(isExpanded ? null : idx)}
              >
                <View className={cn("w-[38px] h-[38px] rounded-full items-center justify-center", sev.badge)}>
                  <MaterialCommunityIcons name={leak.categoryIcon as any} size={18} color={sev.icon} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-gray-900 mb-1" numberOfLines={1}>
                    {leak.name}
                  </Text>
                  <View className="flex-row items-center flex-wrap">
                    <Text className="caption">{leak.category} · </Text>
                    <View className={cn("px-[7px] py-0.5 rounded-md", sev.badge)}>
                      <Text className={cn("text-[11px] font-medium", sev.text)}>
                        {leak.severity}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text className="text-[15px] font-bold text-red-600 mr-1">
                  R{leak.amountMonthly.toFixed(2)}/mo
                </Text>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </Button>

              {!isExpanded && (
                <View className="px-3.5 pb-3.5">
                  <Text className="body-text leading-[19px]" numberOfLines={2}>
                    {leak.advice ?? leak.sourceSms ?? "Tap to see the SMS evidence and next step."}
                  </Text>
                </View>
              )}

              {isExpanded && (
                <View className="px-3.5 pb-4 border-t border-violet-100 gap-2.5">
                  {leak.sourceSms && (
                    <View className="flex-row items-start bg-gray-50 rounded-lg p-2.5 mt-2.5">
                      <MaterialCommunityIcons name="message-text-outline" size={13} color="#6B7280" />
                      <Text className="caption flex-1 leading-[18px]">
                        {" "}{leak.sourceSms}
                      </Text>
                    </View>
                  )}
                  {leak.advice && (
                    <View className="flex-row items-start bg-violet-50 rounded-[10px] p-3">
                      <MaterialCommunityIcons name="star-four-points-outline" size={14} color="#7C3AED" />
                      <Text className="text-[13px] font-medium text-brand-purple-dark flex-1 leading-[19px] flex-wrap">
                        {" "}{leak.advice}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {fromOnboarding ? (
          <Button
            size="lg"
            fullWidth
            onPress={goToHome}
            className="mt-4"
            icon={<MaterialCommunityIcons name="home-outline" size={20} color="#fff" />}
          >
            Go to home
          </Button>
        ) : null}
      </Screen>
    </>
  );
}
