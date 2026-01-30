import React, { useMemo, useState, useEffect } from "react";
import { View, FlatList, ScrollView, Pressable, Modal, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { EmptyState } from "@/components/empty-state";
import { AccountRowSkeleton, Skeleton } from "@/components/ui/skeleton";
import { formatZar } from "@/components/utils/money";
import { getBankLogo } from "@/lib/bank-logos";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import {
  fetchIncomeAccounts,
  fetchReroutePlan,
  updateReroutePlan,
  fetchSpendingSummaryForReroute,
  fetchPartnerRecommendations,
  fetchAnalysis,
  type PartnerRecommendationRow,
  type SpendingByCategory,
} from "@/lib/api";

const NAVY = "#1e40af";
const navyTint = "rgba(30, 64, 175, 0.15)";

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
  const [toggleModalVisible, setToggleModalVisible] = useState(false);
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null);
  const [pendingEnable, setPendingEnable] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spendingByCategory, setSpendingByCategory] = useState<SpendingByCategory[]>([]);
  const [partnerRecommendations, setPartnerRecommendations] = useState<PartnerRecommendationRow[]>([]);
  const [totalLoss, setTotalLoss] = useState<number>(0);

  const navyTintBg = navyTint;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchIncomeAccounts(userId),
      fetchReroutePlan(userId),
      fetchSpendingSummaryForReroute(userId),
      fetchPartnerRecommendations(),
      fetchAnalysis(userId),
    ])
      .then(([accs, { planId: pid, plan: p, isApplied: applied }, spending, recommendations, analysis]) => {
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
        setTotalLoss(analysis?.totalLoss ?? 0);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const projectedLossCut = useMemo(() => {
    const highFeeShare = accounts.find((a) => a.type === "highFee")?.currentIncome ?? 0;
    return Math.round(highFeeShare * 0.6);
  }, [accounts]);

  const summaryCardColor = NAVY;

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentlyEnabled = plan[item.id];
    const willEnable = !currentlyEnabled;
    setPendingAccount(item);
    setPendingEnable(willEnable);
    setToggleModalVisible(true);
  };

  const handleConfirmToggle = () => {
    if (pendingAccount) {
      setPlan((prev) => ({ ...prev, [pendingAccount.id]: pendingEnable }));
    }
    setToggleModalVisible(false);
    setPendingAccount(null);
  };

  const handleCancelToggle = () => {
    setToggleModalVisible(false);
    setPendingAccount(null);
  };

  const renderAccount = ({ item, index }: { item: Account; index: number }) => {
    const enabled = plan[item.id];
    const pillColor =
      item.type === "highFee"
        ? NAVY
        : isDark
        ? Colors.dark.hopeGreen
        : Colors.light.hopeGreen;

    const isHighFee = item.type === "highFee";

    const ctaLabel = isHighFee
      ? enabled
        ? "No new income"
        : "Stop new income here"
      : enabled
      ? "Receiving income"
      : "Move income here";

    return (
      <Animated.View
        entering={FadeInDown.delay(80 + index * 40).springify()}
        style={{ marginBottom: Spacing.md }}
      >
        <Pressable
          onPress={() => handleToggle(item)}
          style={({ pressed }) => ({
            padding: Spacing.lg,
            borderRadius: BorderRadius.lg,
            backgroundColor: theme.backgroundSecondary,
            borderWidth: 1,
            borderLeftWidth: 4,
            borderColor: theme.backgroundTertiary,
            borderLeftColor: pillColor,
            opacity: isApplied && isHighFee ? 0.7 : 1,
            transform: pressed ? [{ scale: 0.99 }] : undefined,
          })}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: BorderRadius.sm,
                  backgroundColor: pillColor + "22",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: Spacing.md,
                  overflow: "hidden",
                }}
              >
                {getBankLogo(item.bank) ? (
                  <Image
                    source={getBankLogo(item.bank)!}
                    style={{ width: 40, height: 40 }}
                    resizeMode="cover"
                  />
                ) : (
                  <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
                    {item.bank[0]}
                  </ThemedText>
                )}
              </View>
              <View>
                <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>
                  {item.bank}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2, fontSize: 14 }}>
                  {item.nickname}
                </ThemedText>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: pillColor + "20",
                paddingVertical: 4,
                paddingHorizontal: Spacing.sm,
                borderRadius: BorderRadius.full,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  marginRight: 6,
                  backgroundColor: pillColor,
                }}
              />
              <ThemedText type="small" style={{ color: pillColor, fontSize: 12 }}>
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

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13 }}>
                {isApplied ? "Before" : "Today"}
              </ThemedText>
              <ThemedText type="h3" style={{ color: theme.text, marginTop: 4, fontSize: 18 }}>
                {item.currentIncome}%
              </ThemedText>
            </View>
            <Feather
              name="arrow-right"
              size={18}
              color={theme.textSecondary}
              style={{ marginHorizontal: Spacing.sm }}
            />
            <View style={{ flex: 1 }}>
              <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13 }}>
                {isApplied ? "Now" : "With this plan"}
              </ThemedText>
              <ThemedText type="h3" style={{ color: theme.text, marginTop: 4, fontSize: 18 }}>
                {enabled ? item.suggestedIncome : item.currentIncome}%
              </ThemedText>
            </View>
          </View>

          {isApplied && isHighFee ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm, lineHeight: 20 }}>
              We&apos;ll stop sending new income here. Existing balance stays, but fresh money moves to safer accounts.
            </ThemedText>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: Spacing.lg,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              borderRadius: BorderRadius.lg,
              backgroundColor: enabled ? theme.backgroundTertiary : NAVY,
              borderWidth: enabled ? 1 : 0,
              borderColor: theme.backgroundTertiary,
            }}
          >
            <Feather
              name={enabled ? "check-circle" : "arrow-right-circle"}
              size={18}
              color={enabled ? theme.text : "#FFFFFF"}
            />
            <ThemedText
              type="button"
              style={{
                marginLeft: 6,
                color: enabled ? theme.text : "#FFFFFF",
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {ctaLabel}
            </ThemedText>
          </View>
        </Pressable>
      </Animated.View>
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
      <ThemedView className="flex-1 bg-bg">
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing["4xl"],
            paddingHorizontal: Spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center mb-3">
            <Pressable onPress={() => router.back()} className="p-1 mr-2" hitSlop={10}>
              <Feather name="arrow-left" size={20} color={theme.text} />
            </Pressable>
            <Skeleton width={220} height={24} />
          </View>
          <Skeleton width="100%" height={80} style={{ marginBottom: 16, borderRadius: 12 }} />
          <View className="mb-2">
            <AccountRowSkeleton />
          </View>
          <View className="h-3" />
          <AccountRowSkeleton />
          <View className="h-3" />
          <AccountRowSkeleton />
          <View className="h-3" />
          <AccountRowSkeleton />
        </ScrollView>
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
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing["2xl"] }}>
              <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: Spacing.sm, marginRight: Spacing.sm }}>
                <Feather name="arrow-left" size={22} color={theme.text} />
              </Pressable>
              <ThemedText type="h2" style={{ color: theme.text }}>
                Route income differently
              </ThemedText>
            </View>

            {isApplied && showSuccess ? (
              <View
                style={{
                  borderRadius: BorderRadius.lg,
                  padding: Spacing.lg,
                  marginBottom: Spacing.lg,
                  backgroundColor: (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "20",
                  borderWidth: 1,
                  borderColor: (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "45",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Feather
                    name="check-circle"
                    size={18}
                    color={isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen}
                  />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
                      Your safer income route is on.
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4, fontSize: 14 }}>
                      We&apos;ll help you move salary and debit orders into low‑fee accounts.
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => setShowSuccess(false)} hitSlop={10}>
                    <Feather name="x" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: BorderRadius.xs,
                  backgroundColor: navyTintBg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: Spacing.sm,
                }}
              >
                <Feather name="shuffle" size={18} color={NAVY} />
              </View>
              <ThemedText type="h3" style={{ color: theme.text, fontSize: 18 }}>
                Your income accounts
              </ThemedText>
            </View>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.sm, lineHeight: 22 }}>
              {isApplied
                ? "Your new route is live. Future income is steered into safer, low‑fee accounts."
                : "Choose smarter homes for your future income. We'll shift money away from high‑fee accounts into safer, low‑fee ones."}
            </ThemedText>
            {totalLoss > 0 ? (
              <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 }}>
                You&apos;re losing about {formatZar(totalLoss)} this month. Moving income to low‑fee accounts helps reduce what ends up in fees and leaks.
              </ThemedText>
            ) : null}

            <View
              style={{
                borderRadius: BorderRadius.lg,
                padding: Spacing.lg,
                marginBottom: Spacing.lg,
                backgroundColor: summaryCardColor + "16",
                borderWidth: 1,
                borderColor: summaryCardColor + "55",
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
          style={({ pressed }) => ({
            height: 52,
            borderRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isApplied ? theme.backgroundTertiary : NAVY,
            borderWidth: isApplied ? 1 : 0,
            borderColor: theme.backgroundTertiary,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <ThemedText
            type="button"
            style={{
              color: isApplied ? theme.text : "#FFFFFF",
              fontWeight: "600",
            }}
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: Spacing["2xl"] }}>
          <Animated.View
            entering={FadeIn}
            style={{
              width: "100%",
              borderRadius: BorderRadius["2xl"],
              padding: Spacing["2xl"],
              alignItems: "center",
              backgroundColor: theme.backgroundRoot,
              borderWidth: 1,
              borderColor: theme.backgroundTertiary,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: navyTintBg,
                borderWidth: 1,
                borderColor: NAVY + "45",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Spacing.lg,
              }}
            >
              <Feather name="alert-circle" size={36} color={NAVY} />
            </View>
            <ThemedText type="h2" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              Confirm new income route
            </ThemedText>
            <ThemedText
              type="body"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginBottom: Spacing["2xl"],
                lineHeight: 22,
              }}
            >
              {totalLoss > 0
                ? `Your leaks this month are about ${formatZar(totalLoss)}. `
                : ""}
              We&apos;ll recommend that your salary and debit orders move to this new split:{"\n\n"}
              {distribution.highFee}% high‑fee · {distribution.salary}% salary · {distribution.savings}% savings.
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.md, width: "100%" }}>
              <Pressable
                onPress={handleCancelConfirm}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: theme.backgroundTertiary,
                }}
              >
                <ThemedText type="button" style={{ color: theme.text, fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmPlan}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NAVY,
                }}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Confirm
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={toggleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelToggle}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: Spacing["2xl"] }}>
          <Animated.View
            entering={FadeIn}
            style={{
              width: "100%",
              borderRadius: BorderRadius["2xl"],
              padding: Spacing["2xl"],
              alignItems: "center",
              backgroundColor: theme.backgroundRoot,
              borderWidth: 1,
              borderColor: theme.backgroundTertiary,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: navyTintBg,
                borderWidth: 1,
                borderColor: NAVY + "45",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Spacing.lg,
              }}
            >
              <Feather name="alert-circle" size={36} color={NAVY} />
            </View>
            <ThemedText type="h2" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              {pendingEnable ? "Move income to this account?" : "Stop routing income here?"}
            </ThemedText>
            <ThemedText
              type="body"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginBottom: Spacing["2xl"],
                lineHeight: 22,
              }}
            >
              {pendingAccount && pendingEnable
                ? `We'll route ${pendingAccount.suggestedIncome}% of your income to ${pendingAccount.nickname} (${pendingAccount.bank}). Salary and debit orders can be sent here. Do you want to turn this on?`
                : pendingAccount
                ? `No new salary or debit orders will go to ${pendingAccount.nickname} (${pendingAccount.bank}). Your existing balance is not affected. Are you sure?`
                : ""}
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.md, width: "100%" }}>
              <Pressable
                onPress={handleCancelToggle}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: theme.backgroundTertiary,
                }}
              >
                <ThemedText type="button" style={{ color: theme.text, fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmToggle}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NAVY,
                }}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  {pendingEnable ? "Move income here" : "Yes, deactivate"}
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ThemedView>
  );
}
