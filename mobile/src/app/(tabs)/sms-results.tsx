import React from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, EmptyStateIcon } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { router } from "expo-router";
import { useProfileStore } from "@/stores/profileStore";
import { useIngestion } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TransactionCategory } from "@/services/sms/sms.types";
import { leakAnalysisComingSoon } from "@/constants/copy";
import { CATEGORY_ICONS } from "@/constants/category-icons";

export default function SmsResultsScreen() {
  const { colors } = useColorScheme();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);
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

  const goToHome = async () => {
    if (!onboardingComplete) {
      await completeOnboarding();
    }
    router.replace("/(tabs)");
  };

  const hasTransactions = state.totalIngested > 0;

  return (
    <Screen>
      <View className="mb-6">
        <View className="mb-1 flex-row items-center gap-2">
          <MaterialCommunityIcons name="message-text-outline" size={22} color={colors.primary} />
          <AppText variant="titleLg">SMS Scan Results</AppText>
        </View>
        <AppText variant="lead">
          {hasTransactions
            ? `${state.totalIngested} transaction${state.totalIngested !== 1 ? "s" : ""} imported from your inbox`
            : "Scan complete — review your results below"}
        </AppText>
      </View>

      {hasTransactions ? (
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

      <EmptyState
        className="mb-6"
        tone="brand"
        title="No money leaks detected"
        description={
          state.totalIngested > 0
            ? leakAnalysisComingSoon(state.totalIngested)
            : "We couldn't find bank SMS messages to analyse yet. Make sure TracePay has SMS permission, then try scanning again."
        }
        icon={
          <EmptyStateIcon size="lg">
            <MaterialCommunityIcons name="shield-check-outline" size={32} color={colors.primary} />
          </EmptyStateIcon>
        }
      />

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
