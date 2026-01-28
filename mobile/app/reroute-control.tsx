import React, { useMemo, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

type Account = {
  id: string;
  bank: string;
  nickname: string;
  type: "salary" | "savings" | "highFee";
  currentIncome: number;
  suggestedIncome: number;
};

const ACCOUNTS: Account[] = [
  {
    id: "1",
    bank: "Absa",
    nickname: "High‑fee current account",
    type: "highFee",
    currentIncome: 100,
    suggestedIncome: 10,
  },
  {
    id: "2",
    bank: "Capitec",
    nickname: "Everyday account",
    type: "salary",
    currentIncome: 0,
    suggestedIncome: 40,
  },
  {
    id: "3",
    bank: "Nedbank",
    nickname: "Low‑fee savings pocket",
    type: "savings",
    currentIncome: 0,
    suggestedIncome: 50,
  },
];

export default function RerouteControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  // plan[id] = true means "use suggestedIncome for this account" (part of the new route)
  // false means "keep currentIncome share"
  // Start in the "original" state: all income flows to the high‑fee account.
  const [plan, setPlan] = useState<Record<string, boolean>>({
    "1": false,
    "2": false,
    "3": false,
  });
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
   const [showSuccess, setShowSuccess] = useState(false);

  const projectedLossCut = useMemo(() => {
    // Rough example: moving away from high-fee accounts cuts 60% of their losses
    const highFeeShare = ACCOUNTS.find((a) => a.type === "highFee")?.currentIncome ?? 0;
    return Math.round(highFeeShare * 0.6);
  }, []);

  const summaryCardColor = isDark ? Colors.dark.info : Colors.light.info;

  const distribution = useMemo(() => {
    const result: Record<Account["type"], number> = {
      salary: 0,
      savings: 0,
      highFee: 0,
    };

    ACCOUNTS.forEach((account) => {
      const enabled = plan[account.id];
      const share = enabled ? account.suggestedIncome : account.currentIncome;
      result[account.type] += share;
    });

    return result;
  }, [plan]);

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

    const handleToggle = () => {
      setPlan((prev) => ({
        ...prev,
        [item.id]: !prev[item.id],
      }));
    };

    return (
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.backgroundDefault,
            opacity: isApplied && isHighFee ? 0.7 : 1,
          },
          pressed && { transform: [{ scale: 0.99 }] },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.bankRow}>
            <View style={[styles.bankIcon, { backgroundColor: pillColor + "20" }]}>
              <ThemedText type="body" className="text-text">
                {item.bank[0]}
              </ThemedText>
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
            style={[
              styles.typePill,
              {
                backgroundColor: pillColor + "20",
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: pillColor,
                },
              ]}
            />
            <ThemedText
              type="small"
              style={{
                color: pillColor,
              }}
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

        <View style={styles.splitRow}>
          <View style={{ flex: 1 }}>
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
          <View style={{ flex: 1 }}>
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
          style={[
            styles.toggleButton,
            {
              backgroundColor: enabled ? pillColor : theme.backgroundTertiary,
            },
          ]}
        >
          <Feather
            name={enabled ? "check-circle" : "circle"}
            size={18}
            color={enabled ? "#FFFFFF" : theme.text}
          />
          <ThemedText
            type="button"
            style={{
              marginLeft: Spacing.xs,
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
    if (!isApplied) {
      setConfirmVisible(true);
    }
  };

  const handleConfirmPlan = () => {
    setConfirmVisible(false);
    setIsApplied(true);
    setShowSuccess(true);
  };

  const handleCancelConfirm = () => {
    setConfirmVisible(false);
  };

  const handleResetToOriginal = () => {
    // Go back to a state where only the original high‑fee account receives income
    setPlan({
      "1": false, // use currentIncome (100%) on the original account
      "2": false,
      "3": false,
    });
    setIsApplied(false);
    setShowSuccess(false);
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"] + Spacing.buttonHeight,
          paddingHorizontal: Spacing.lg,
        }}
        data={ACCOUNTS}
        keyExtractor={(item) => item.id}
        renderItem={renderAccount}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing["2xl"] }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.md }}>
              <Pressable
                onPress={() => router.back()}
                style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
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
                style={[
                  styles.successBanner,
                  {
                    backgroundColor:
                      (isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen) + "20",
                  },
                ]}
              >
                <View style={styles.successBannerRow}>
                  <Feather
                    name="check-circle"
                    size={18}
                    color={isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen}
                  />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
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
              style={[
                styles.summaryCard,
                {
                  backgroundColor: summaryCardColor + "16",
                  borderColor: summaryCardColor + "60",
                },
              ]}
            >
              <View style={styles.summaryRow}>
                <View style={styles.summaryIcon}>
                  <Feather
                    name={isApplied ? "check-circle" : "shuffle"}
                    size={20}
                    color={summaryCardColor}
                  />
                </View>
                <View style={{ flex: 1 }}>
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

              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: summaryCardColor,
                      width: `${projectedLossCut}%`,
                    },
                  ]}
                />
              </View>

              <ThemedText type="small" className="text-text-muted mt-2">
                We&apos;ll help you send debit orders and salary into accounts that leak less.
              </ThemedText>

              {isApplied ? (
                <View style={{ marginTop: Spacing.md }}>
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
          </View>
        }
      />

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + Spacing.sm,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: Spacing.md }}>
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
            <Pressable onPress={handleResetToOriginal} style={{ marginTop: Spacing.sm }}>
              <ThemedText type="small" className="text-text">
                Go back to original route
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={handleApply}
          style={({ pressed }) => [
            styles.applyButton,
            {
              backgroundColor: isApplied
                ? theme.backgroundTertiary
                : isDark
                ? Colors.dark.hopeGreen
                : Colors.light.hopeGreen,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <ThemedText
            type="button"
            style={{
              color: isApplied ? theme.text : "#FFFFFF",
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
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.backgroundRoot,
              },
            ]}
          >
            <Feather
              name="alert-circle"
              size={40}
              color={isDark ? Colors.dark.warningYellow : Colors.light.warningYellow}
            />
            <ThemedText type="h2" style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>
              Confirm new income route
            </ThemedText>
            <ThemedText
              type="body"
              className="text-text-secondary"
              style={{ textAlign: "center", marginBottom: Spacing["2xl"] }}
            >
              We&apos;ll recommend that your salary and debit orders move to this new split:
              {"\n\n"}
              {distribution.highFee}% high‑fee · {distribution.salary}% salary ·{" "}
              {distribution.savings}% savings.
            </ThemedText>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleCancelConfirm}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: theme.backgroundDefault,
                  },
                ]}
              >
                <ThemedText type="button">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmPlan}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.hopeGreen
                      : Colors.light.hopeGreen,
                  },
                ]}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF" }}>
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

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bankIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.xs,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  summaryCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  progressBar: {
    marginTop: Spacing.sm,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffff10",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  successBanner: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  successBannerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  applyButton: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  modalContent: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
