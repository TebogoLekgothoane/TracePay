import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CircularProgress from "@/components/CircularProgress";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";

const SAMPLE_TRANSACTIONS = [
  { id: "1", name: "MTN Airtime Advance", date: "20 Apr · MTN Advance", amount: "-R11", isLeak: true },
  { id: "2", name: "Cash Payment - S. Nkosi", date: "20 Apr · S. Nkosi", amount: "-R350", isLeak: true },
  { id: "3", name: "ATM Withdrawal - Capitec", date: "19 Apr · Capitec ATM", amount: "-R300", isLeak: true },
  { id: "4", name: "Woolworths Groceries", date: "18 Apr · Woolworths", amount: "-R425", isLeak: false },
  { id: "5", name: "Taxi Fare - Mdantsane", date: "18 Apr · MoMo Transfer", amount: "-R25", isLeak: false },
];

const REWARDS = [
  { id: "shoprite", partner: "Shoprite", offer: "5% off groceries", icon: "cart-outline", color: "#DC2626", ptsNeeded: 150 },
  { id: "pnp", partner: "Pick n Pay", offer: "R20 voucher", icon: "shopping-outline", color: "#16A34A", ptsNeeded: 200 },
  { id: "checkers", partner: "Checkers", offer: "3% cashback", icon: "cash-check", color: "#0085C7", ptsNeeded: 180 },
  { id: "mrprice", partner: "Mr Price", offer: "10% off clothing", icon: "hanger", color: "#D97706", ptsNeeded: 120 },
  { id: "clicks", partner: "Clicks", offer: "R15 off pharmacy", icon: "medical-bag", color: "#7C3AED", ptsNeeded: 100 },
  { id: "woolworths", partner: "Woolworths", offer: "8% off food", icon: "food-apple-outline", color: "#111827", ptsNeeded: 160 },
];

const ACTIONS = [
  { id: "freeze", label: "Freeze\nLeaks", icon: "snowflake", color: "#7C3AED" },
  { id: "budget", label: "Smart\nBudget", icon: "chart-bar", color: "#7C3AED" },
  { id: "scan", label: "Rescan\nSMS", icon: "message-text-outline", color: "#A78BFA" },
  { id: "history", label: "History", icon: "chart-line", color: "#C4B5FD" },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: isWeb ? 67 + 16 : insets.top + 16,
          paddingBottom: isWeb ? 34 + 80 : 80 + insets.bottom,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeLabel}>WELCOME BACK</Text>
          <Text style={styles.userName}>{firstName} 👋</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn} activeOpacity={0.7} onPress={() => setShowNotifications(true)}>
          <Feather name="bell" size={22} color="#374151" />
          {activeLeaks.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeLeaks.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.healthCard}>
        <View style={styles.healthHeader}>
          <MaterialCommunityIcons name="star-four-points-outline" size={16} color="#7C3AED" />
          <Text style={styles.healthTitle}> FINANCIAL HEALTH</Text>
          <TouchableOpacity
            onPress={() => speak(`Your financial health score is ${healthScore} out of 100. You are ${healthLabel}. You have ${activeLeaks.length} active money leaks totalling R${totalLeaking.toFixed(2)} per month.`)}
            style={styles.speakBtn}
          >
            <MaterialCommunityIcons name="volume-high" size={16} color="#7C3AED" />
          </TouchableOpacity>
        </View>
        <View style={styles.healthBody}>
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
          <View style={styles.healthStats}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Leaks Found</Text>
              <Text style={[styles.statValue, { color: "#DC2626" }]}>{activeLeaks.length}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Monthly Savings</Text>
              <Text style={[styles.statValue, { color: "#16A34A" }]}>
                R{totalLeaking > 0 ? totalLeaking.toFixed(0) : "0"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.actionBtn}
            activeOpacity={0.75}
            onPress={() => handleActionPress(action.id)}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.color }]}>
              <MaterialCommunityIcons name={action.icon as any} size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeLeaks.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Money Leaks</Text>
            <View style={styles.leakBadge}>
              <Text style={styles.leakBadgeText}>-R{totalLeaking.toFixed(2)}/mo</Text>
            </View>
          </View>

          {activeLeaks.slice(0, 5).map((leak) => (
            <TouchableOpacity
              key={leak.id}
              style={styles.leakCard}
              activeOpacity={0.7}
              onPress={() => router.push("/(tabs)/sms-scan")}
            >
              <View style={styles.leakIconBox}>
                <MaterialCommunityIcons
                  name={(leak.categoryIcon as any) ?? "credit-card-outline"}
                  size={20}
                  color="#7C3AED"
                />
              </View>
              <View style={styles.leakInfo}>
                <Text style={styles.leakName} numberOfLines={1}>{leak.name}</Text>
                <Text style={styles.leakCategory}>{leak.category}</Text>
              </View>
              <View style={styles.leakRight}>
                <Text style={styles.leakAmount}>-R{leak.amountMonthly.toFixed(2)}</Text>
                <Text style={styles.leakPeriod}>/month</Text>
              </View>
              <Feather name="chevron-right" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </>
      )}

      {activeLeaks.length === 0 && (
        <TouchableOpacity
          style={styles.scanPromptCard}
          onPress={() => router.push("/sms-scanning")}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="magnify-scan" size={28} color="#7C3AED" />
          <View style={styles.scanPromptText}>
            <Text style={styles.scanPromptTitle}>No leaks detected yet</Text>
            <Text style={styles.scanPromptSub}>Tap to scan your SMS inbox and find money leaks</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      )}

      <View style={styles.rewardsHeader}>
        <View>
          <Text style={styles.sectionTitle}>Rewards & Perks</Text>
          <Text style={styles.rewardsPts}>{rewardPoints} pts · Earned by stopping leaks</Text>
        </View>
        <View style={styles.ptsChip}>
          <MaterialCommunityIcons name="star-circle" size={14} color="#7C3AED" />
          <Text style={styles.ptsChipText}>{rewardPoints} pts</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rewardsScroll}
        style={styles.rewardsScrollWrap}
      >
        {REWARDS.map((r) => (
          <View key={r.id} style={styles.rewardCard}>
            <View style={[styles.rewardIconBox, { backgroundColor: r.color + "18" }]}>
              <MaterialCommunityIcons name={r.icon as any} size={26} color={r.color} />
            </View>
            <Text style={styles.rewardPartner}>{r.partner}</Text>
            <Text style={styles.rewardOffer}>{r.offer}</Text>
            <View style={styles.rewardPtsRow}>
              <MaterialCommunityIcons name="star-circle-outline" size={12} color="#7C3AED" />
              <Text style={styles.rewardPtsNeeded}>{r.ptsNeeded} pts</Text>
            </View>
            <TouchableOpacity
              style={[styles.redeemBtn, rewardPoints < r.ptsNeeded && styles.redeemBtnDisabled]}
              activeOpacity={0.7}
            >
              <Text style={[styles.redeemBtnText, rewardPoints < r.ptsNeeded && styles.redeemBtnTextDisabled]}>
                {rewardPoints >= r.ptsNeeded ? "Redeem" : "Need more pts"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={() => router.push("/history")}>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {SAMPLE_TRANSACTIONS.map((tx) => (
        <View key={tx.id} style={styles.txCard}>
          <View style={[styles.txIcon, tx.isLeak ? styles.txIconLeak : styles.txIconNormal]}>
            {tx.isLeak ? (
              <Feather name="alert-triangle" size={16} color="#DC2626" />
            ) : (
              <Feather name="arrow-up-right" size={16} color="#6B7280" />
            )}
          </View>
          <View style={styles.txInfo}>
            <Text style={styles.txName}>{tx.name}</Text>
            <Text style={styles.txDate}>{tx.date}</Text>
          </View>
          <View style={styles.txRight}>
            <Text style={styles.txAmount}>{tx.amount}</Text>
            {tx.isLeak && (
              <View style={styles.txLeakBadge}>
                <Text style={styles.txLeakBadgeText}>Leak</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </ScrollView>

    <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setShowNotifications(false)}>
        <Pressable style={[styles.notifPanel, { paddingTop: isWeb ? 67 : insets.top + 12 }]} onPress={() => {}}>
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotifications(false)} style={styles.notifClose}>
              <Feather name="x" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {activeLeaks.length === 0 ? (
            <View style={styles.notifEmpty}>
              <Feather name="bell-off" size={32} color="#D1D5DB" />
              <Text style={styles.notifEmptyText}>No new alerts</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.notifSectionLabel}>ACTIVE MONEY LEAKS</Text>
              {activeLeaks.map((leak, i) => {
                const sevColor = leak.severity === "High" ? "#DC2626" : leak.severity === "Medium" ? "#D97706" : "#CA8A04";
                const sevBg = leak.severity === "High" ? "#FEE2E2" : "#FEF3C7";
                return (
                  <TouchableOpacity
                    key={leak.id ?? i}
                    style={styles.notifItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowNotifications(false);
                        router.push("/(tabs)/sms-scan");
                    }}
                  >
                    <View style={[styles.notifDot, { backgroundColor: sevBg }]}>
                      <MaterialCommunityIcons name={leak.categoryIcon as any ?? "alert"} size={16} color={sevColor} />
                    </View>
                    <View style={styles.notifItemText}>
                      <Text style={styles.notifItemTitle}>{leak.name}</Text>
                      <Text style={styles.notifItemSub}>{leak.category} · R{leak.amountMonthly.toFixed(2)}/mo</Text>
                    </View>
                    <View style={[styles.notifSevBadge, { backgroundColor: sevBg }]}>
                      <Text style={[styles.notifSevText, { color: sevColor }]}>{leak.severity}</Text>
                    </View>
                  </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  welcomeLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  userName: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827" },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  healthCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  healthHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  healthTitle: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#7C3AED", letterSpacing: 1 },
  speakBtn: { padding: 4 },
  healthBody: { flexDirection: "row", alignItems: "center", gap: 24 },
  healthStats: { flex: 1, gap: 16 },
  statRow: {},
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", marginBottom: 2 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  actionBtn: { alignItems: "center", flex: 1 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151", textAlign: "center" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111827" },
  leakBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  leakBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#7C3AED" },
  leakCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  leakIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  leakInfo: { flex: 1 },
  leakName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  leakCategory: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  leakRight: { alignItems: "flex-end", marginRight: 6 },
  leakAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#DC2626" },
  leakPeriod: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  scanPromptCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#EDE9FE",
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
  },
  scanPromptText: { flex: 1 },
  scanPromptTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#5B21B6" },
  scanPromptSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#7C3AED", marginTop: 2 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txIconLeak: { backgroundColor: "#FEE2E2" },
  txIconNormal: { backgroundColor: "#F3F4F6" },
  txInfo: { flex: 1 },
  txName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111827" },
  txLeakBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  txLeakBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#DC2626" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-start" },
  notifPanel: {
    backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingBottom: 32,
    maxHeight: "75%",
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  notifHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", marginBottom: 12 },
  notifTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827" },
  notifClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  notifEmpty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  notifEmptyText: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  notifSectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#6B7280", letterSpacing: 1.2, marginBottom: 12 },
  notifItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F9FAFB",
  },
  notifDot: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifItemText: { flex: 1 },
  notifItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  notifItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  notifSevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  notifSevText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  rewardsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 24, marginBottom: 12 },
  rewardsPts: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", marginTop: 2 },
  ptsChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  ptsChipText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#7C3AED" },
  rewardsScrollWrap: { marginHorizontal: -18 },
  rewardsScroll: { paddingHorizontal: 18, gap: 12, paddingBottom: 4 },
  rewardCard: {
    width: 140, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: "#F3F4F6",
  },
  rewardIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  rewardPartner: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  rewardOffer: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#374151", marginBottom: 8, lineHeight: 16 },
  rewardPtsRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 10 },
  rewardPtsNeeded: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#7C3AED" },
  redeemBtn: { backgroundColor: "#7C3AED", borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  redeemBtnDisabled: { backgroundColor: "#F3F4F6" },
  redeemBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  redeemBtnTextDisabled: { color: "#9CA3AF" },
});
