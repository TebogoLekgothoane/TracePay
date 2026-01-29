import React, { useMemo, useState, useEffect } from "react";
import { View, FlatList, Pressable, Modal, ActivityIndicator, Image, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { EmptyState } from "@/components/empty-state";
import { formatZar } from "@/components/utils/money";
import { getBankLogo } from "@/lib/bank-logos";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors } from "@/constants/theme";
import {
  fetchIncomeAccounts,
  fetchReroutePlan,
  updateReroutePlan,
  fetchSpendingSummaryForReroute,
  fetchPartnerRecommendations,
  type PartnerRecommendationRow,
  type SpendingByCategory,
} from "@/lib/api";

type Account = {
  id: string;
  bank: string;
  nickname: string;
  type: "salary" | "savings" | "highFee";
  currentIncome: number;
  suggestedIncome: number;
};

export default function RerouteControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { userId } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [plan, setPlan] = useState<Record<string, boolean>>({});
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spendingByCategory, setSpendingByCategory] = useState<SpendingByCategory[]>([]);
  const [partnerRecommendations, setPartnerRecommendations] = useState<PartnerRecommendationRow[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchIncomeAccounts(userId),
      fetchReroutePlan(userId),
      fetchSpendingSummaryForReroute(userId),
      fetchPartnerRecommendations(),
    ])
      .then(([accs, { planId: pid, plan: p, isApplied: applied }, spending, recommendations]) => {
        setAccounts(
          accs.map((a) => ({
            id: a.id,
            bank: a.bank,
            nickname: a.nickname,
            type: a.type,
            currentIncome: a.currentIncome,
            suggestedIncome: a.suggestedIncome,
          }))
        );
        if (pid) setPlanId(pid);
        if (p && Object.keys(p).length) setPlan(p);
        setIsApplied(applied);
        setSpendingByCategory(spending ?? []);
        setPartnerRecommendations(recommendations ?? []);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const projectedLossCut = useMemo(() => {
    const highFeeShare = accounts.find((a) => a.type === "highFee")?.currentIncome ?? 0;
    return Math.round(highFeeShare * 0.6);
  }, [accounts]);

  const summaryCardColor = isDark ? Colors.dark.info : Colors.light.info;

  const recommendationsWithSpending = useMemo(() => {
    const spendingByCat = new Map(spendingByCategory.map((s) => [s.category, s]));
    return partnerRecommendations
      .map((rec) => {
        const spending = spendingByCat.get(rec.category);
        return { rec, spending };
      })
      .filter(({ spending }) => spending && spending.totalSpent > 0)
      .slice(0, 4);
  }, [partnerRecommendations, spendingByCategory]);

  const distribution = useMemo(() => {
    const result: Record<Account["type"], number> = {
      salary: 0,
      savings: 0,
      highFee: 0,
    };
    accounts.forEach((account) => {
      const enabled = plan[account.id];
      const share = enabled ? account.suggestedIncome : account.currentIncome;
      result[account.type] += share;
    });
    return result;
  }, [accounts, plan]);

  const handleToggle = (item: Account) => {
    const currentlyEnabled = plan[item.id];
    const willEnable = !currentlyEnabled;

    if (willEnable) {
      Alert.alert(
        "Move income to this account?",
        `We'll route ${item.suggestedIncome}% of your income to ${item.nickname} (${item.bank}). Salary and debit orders can be sent here. Do you want to turn this on?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, move income here",
            onPress: () => setPlan((prev) => ({ ...prev, [item.id]: true })),
          },
        ]
      );
    } else {
      const typeLabel =
        item.type === "highFee"
          ? "stop sending new income to this high‑fee account"
          : "stop routing income to this account";
      Alert.alert(
        "Stop routing income here?",
        `No new salary or debit orders will go to ${item.nickname} (${item.bank}). Your existing balance is not affected. Are you sure you want to ${typeLabel}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, deactivate",
            style: "destructive",
            onPress: () => setPlan((prev) => ({ ...prev, [item.id]: false })),
          },
        ]
      );
    }
  };

  const renderAccount = ({ item }: { item: Account }) => {
    const enabled = plan[item.id];
    const pillColor =
      item.type === "highFee"
        ? isDark
          ? Colors.dark.alarmRed
          : Colors.light.alarmRed
        : isDark
        ? Colors.dark.hopeGreen
        : Colors.light.hopeGreen;

    const isHighFee = item.type === "highFee";

    const ctaLabel = isHighFee
      ? enabled
        ? "Account deactivated (no new income)"
        : "Tap to stop new income"
      : enabled
      ? "Account activated"
      : "Tap to move income here";

    return (
      <Pressable
        onPress={() => handleToggle(item)}
        className="rounded-xl p-4 active:scale-[0.99]"
        style={({ pressed }) => ({
          backgroundColor: theme.backgroundDefault,
          opacity: isApplied && isHighFee ? 0.7 : 1,
          transform: pressed ? [{ scale: 0.99 }] : undefined,
        })}
      >
        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-row items-center gap-2">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center mr-2 overflow-hidden"
              style={{ backgroundColor: pillColor + "20" }}
            >
              {getBankLogo(item.bank) ? (
                <Image
                  source={getBankLogo(item.bank)!}
                  className="w-10 h-10 rounded-xl"
                  resizeMode="cover"
                />
              ) : (
                <ThemedText type="body" className="text-text">
                  {item.bank[0]}
                </ThemedText>
              )}
            </View>
            <View>
              <ThemedText type="body" className="text-text">
                {item.bank}
              </ThemedText>
              <ThemedText type="small" className="text-text-muted mt-0.5">
                {item.nickname}
              </ThemedText>
            </View>
          </View>

          <View
            className="flex-row items-center rounded-full px-2 py-1"
            style={{ backgroundColor: pillColor + "20" }}
          >
            <View
              className="w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: pillColor }}
            />
            <ThemedText
              type="small"
              style={{ color: pillColor }}
            >
              {isApplied
                ? isHighFee
                  ? "No new income"
                  : "Now receiving income"
                : item.type === "highFee"
                ? "High‑fee"
                : item.type === "salary"
                ? "Salary home"
                : "Low‑fee savings"}
            </ThemedText>
          </View>
        </View>

        <View className="flex-row items-center mt-2">
          <View className="flex-1">
            <ThemedText type="small" className="text-text-muted">
              {isApplied ? "Before" : "Today"}
            </ThemedText>
            <ThemedText type="h3" className="text-text mt-0.5">
              {item.currentIncome}%
            </ThemedText>
          </View>
          <Feather
            name="arrow-right"
            size={18}
            color={theme.textSecondary}
            style={{ marginHorizontal: Spacing.sm }}
          />
          <View className="flex-1">
            <ThemedText type="small" className="text-text-muted">
              {isApplied ? "Now" : "With this plan"}
            </ThemedText>
            <ThemedText type="h3" className="text-text mt-0.5">
              {enabled ? item.suggestedIncome : item.currentIncome}%
            </ThemedText>
          </View>
        </View>

        {isApplied && isHighFee ? (
          <ThemedText type="small" className="text-text-muted mt-2">
            We&apos;ll stop sending new income here. Existing balance stays, but fresh money moves
            to safer accounts.
          </ThemedText>
        ) : null}

        <View
          className="flex-row items-center mt-4 rounded py-2 px-3 self-stretch justify-center"
          style={{ backgroundColor: enabled ? pillColor : theme.backgroundTertiary }}
        >
          <Feather
            name={enabled ? "check-circle" : "circle"}
            size={18}
            color={enabled ? "#FFFFFF" : theme.text}
          />
          <ThemedText
            type="button"
            className="ml-1"
            style={{
              color: enabled ? "#FFFFFF" : theme.text,
            }}
          >
            {ctaLabel}
          </ThemedText>
        </View>
      </Pressable>
    );
  };

  const handleApply = () => {
    if (!isApplied) setConfirmVisible(true);
  };

  const handleConfirmPlan = async () => {
    setConfirmVisible(false);
    setIsApplied(true);
    setShowSuccess(true);
    if (planId) {
      updateReroutePlan(userId, planId, plan, true).catch(() => {});
    }
  };

  const handleCancelConfirm = () => {
    setConfirmVisible(false);
  };

  const handleResetToOriginal = () => {
    const resetPlan = accounts.reduce((acc, a) => ({ ...acc, [a.id]: false }), {} as Record<string, boolean>);
    setPlan(resetPlan);
    setIsApplied(false);
    setShowSuccess(false);
    if (planId) {
      updateReroutePlan(userId, planId, resetPlan, false).catch(() => {});
    }
  };

  if (loading) {
    return (
      <ThemedView className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? Colors.dark.info : Colors.light.info} />
        <ThemedText type="body" className="text-text-muted mt-3">
          Loading income accounts…
        </ThemedText>
      </ThemedView>
    );
  }

  if (accounts.length === 0) {
    return (
      <ThemedView className="flex-1 bg-bg">
        <View className="flex-row items-center pt-4 pb-2 px-4" style={{ paddingTop: insets.top + Spacing.lg }}>
          <Pressable onPress={() => router.back()} className="p-1 mr-2" hitSlop={10}>
            <Feather name="arrow-left" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="h2" className="text-text">Route income differently</ThemedText>
        </View>
        <EmptyState
          title="No income accounts"
          description="Income accounts will appear here once they’re linked. Connect your accounts from the home screen."
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView className="flex-1 bg-bg">
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"] + Spacing.buttonHeight,
          paddingHorizontal: Spacing.lg,
        }}
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={renderAccount}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <Pressable
                onPress={() => router.back()}
                className="p-1 mr-2"
                hitSlop={10}
              >
                <Feather name="arrow-left" size={20} color={theme.text} />
              </Pressable>
              <ThemedText type="h2" className="text-text">
                Route income differently
              </ThemedText>
            </View>
            {isApplied && showSuccess ? (
              <View
                className="rounded-xl p-3 mb-4"
                style={{
                  backgroundColor:
                    (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "20",
                }}
              >
                <View className="flex-row items-center">
                  <Feather
                    name="check-circle"
                    size={18}
                    color={isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen}
                  />
                  <View className="flex-1 ml-2">
                    <ThemedText type="body" className="text-text">
                      Your safer income route is on.
                    </ThemedText>
                    <ThemedText type="small" className="text-text-muted mt-0.5">
                      We&apos;ll help you move salary and debit orders into low‑fee accounts.
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => setShowSuccess(false)}>
                    <Feather
                      name="x"
                      size={16}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ThemedText type="h2" className="text-text mb-1">
              Route income differently
            </ThemedText>
            <ThemedText type="body" className="text-text-muted mb-4">
              {isApplied
                ? "Your new route is live. Future income is steered into safer, low‑fee accounts."
                : "Choose smarter homes for your future income. We&apos;ll shift money away from high‑fee accounts into safer, low‑fee ones."}
            </ThemedText>

            <View
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: summaryCardColor + "16",
                borderColor: summaryCardColor + "60",
              }}
            >
              <View className="flex-row items-center mb-3 gap-2">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-2"
                  style={{ backgroundColor: summaryCardColor + "20" }}
                >
                  <Feather
                    name={isApplied ? "check-circle" : "shuffle"}
                    size={20}
                    color={summaryCardColor}
                  />
                </View>
                <View className="flex-1">
                  <ThemedText type="small" className="text-text-muted">
                    {isApplied ? "You are now on this plan" : "If you follow this plan"}
                  </ThemedText>
                  <ThemedText type="body" className="text-text mt-0.5">
                    {isApplied
                      ? `Around ${projectedLossCut}% of your income has been moved away from high‑fee accounts.`
                      : `Up to ${projectedLossCut}% of your income will stop flowing into high‑fee accounts.`}
                  </ThemedText>
                </View>
              </View>

              <View className="mt-2 h-1.5 rounded overflow-hidden bg-white/10">
                <View
                  className="h-full rounded"
                  style={{
                    backgroundColor: summaryCardColor,
                    width: `${projectedLossCut}%`,
                  }}
                />
              </View>

              <ThemedText type="small" className="text-text-muted mt-2">
                We&apos;ll help you send debit orders and salary into accounts that leak less.
              </ThemedText>

              {isApplied ? (
                <View className="mt-3">
                  <ThemedText type="small" className="text-text mt-3">
                    Next steps
                  </ThemedText>
                  <ThemedText type="small" className="text-text-muted mt-1">
                    • Share this split with your employer or HR so they can update where your salary
                    gets paid.
                  </ThemedText>
                  <ThemedText type="small" className="text-text-muted mt-1">
                    • Ask your bank to move debit orders into the new everyday account.
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {recommendationsWithSpending.length > 0 ? (
              <View className="mt-6">
                <ThemedText type="h3" className="text-text mb-1">
                  Better options for your money
                </ThemedText>
                <ThemedText type="small" className="text-text-muted mb-3">
                  Based on your spending, our partner retailers and telcos can help you save.
                </ThemedText>
                {recommendationsWithSpending.map(({ rec, spending }) => (
                  <View
                    key={rec.id}
                    className="rounded-xl p-4 mb-3 border"
                    style={{
                      backgroundColor: theme.backgroundDefault,
                      borderColor: (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "40",
                    }}
                  >
                    <ThemedText type="small" className="text-text-muted mb-1">
                      You spend {formatZar(spending!.totalSpent)} on {spending!.label}
                    </ThemedText>
                    <ThemedText type="body" className="text-text font-semibold">
                      {rec.partner_name}: {rec.title}
                    </ThemedText>
                    <ThemedText type="small" className="text-text-muted mt-1">
                      {rec.description}
                    </ThemedText>
                    <View className="flex-row items-center justify-between mt-3">
                      <View
                        className="px-2 py-1 rounded-lg"
                        style={{
                          backgroundColor: (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "20",
                        }}
                      >
                        <ThemedText
                          type="small"
                          style={{
                            color: isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen,
                            fontWeight: "600",
                          }}
                        >
                          {rec.savings_estimate}
                        </ThemedText>
                      </View>
                      <ThemedText type="small" className="text-primary">
                        {rec.cta_label}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
      />

      <View
        className="absolute left-0 right-0 bottom-0 px-4 pt-2 flex-row items-center"
        style={{
          paddingBottom: insets.bottom + Spacing.sm,
          backgroundColor: theme.backgroundRoot,
        }}
      >
        <View className="flex-1 mr-3">
          <ThemedText type="small" className="text-text-muted">
            New plan
          </ThemedText>
          <ThemedText type="body" className="text-text mt-1">
            {distribution.highFee}% high‑fee · {distribution.salary}% salary ·{" "}
            {distribution.savings}% savings
          </ThemedText>
          {isApplied ? (
            <ThemedText type="small" className="text-text-muted mt-1">
              Plan applied. We&apos;ll start routing income and debit orders this way.
            </ThemedText>
          ) : (
            <ThemedText type="small" className="text-text-muted mt-1">
              You&apos;re currently at 100% high‑fee · 0% salary · 0% savings. Adjust, then confirm.
            </ThemedText>
          )}

          {isApplied ? (
            <Pressable onPress={handleResetToOriginal} className="mt-2">
              <ThemedText type="small" className="text-text">
                Go back to original route
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={handleApply}
          className="h-[52px] rounded-xl px-4 items-center justify-center active:opacity-90"
          style={({ pressed }) => ({
            backgroundColor: isApplied
              ? theme.backgroundTertiary
              : isDark
              ? Colors.dark.hopeGreen
              : Colors.light.hopeGreen,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <ThemedText
            type="button"
            className={isApplied ? "text-text" : "text-white"}
          >
            {isApplied ? "Plan applied" : "Confirm plan"}
          </ThemedText>
        </Pressable>
      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelConfirm}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View
            className="w-full rounded-3xl p-6 items-center"
            style={{ backgroundColor: theme.backgroundRoot }}
          >
            <Feather
              name="alert-circle"
              size={40}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h2" className="mt-4 mb-2 text-text">
              Confirm new income route
            </ThemedText>
            <ThemedText
              type="body"
              className="text-text-secondary text-center mb-6"
            >
              We&apos;ll recommend that your salary and debit orders move to this new split:
              {"\n\n"}
              {distribution.highFee}% high‑fee · {distribution.salary}% salary ·{" "}
              {distribution.savings}% savings.
            </ThemedText>

            <View className="flex-row gap-3 w-full">
              <Pressable
                onPress={handleCancelConfirm}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{ backgroundColor: theme.backgroundDefault }}
              >
                <ThemedText type="button">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmPlan}
                className="flex-1 h-[52px] rounded-xl items-center justify-center"
                style={{
                  backgroundColor: isDark
                    ? Colors.dark.hopeGreen
                    : Colors.light.hopeGreen,
                }}
              >
                <ThemedText type="button" className="text-white">
                  Confirm
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
