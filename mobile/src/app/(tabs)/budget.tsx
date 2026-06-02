import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";
import { simulateBudgetGenerate } from "@/lib/simulate";

interface PlaybookItem {
  name: string;
  category: string;
  saving: number;
  detail: string;
  actionText: string;
  btnText: string;
}

interface BudgetPlan {
  weeklyAmount: number;
  dailyLimit: number;
  obligationsTotal: number;
  buffer: number;
  billsPct: number;
  bufferPct: number;
  freePct: number;
  riskLevel: string;
  riskDescription: string;
  obligations: Array<{ name: string; dueDate: string; amount: number; icon: string }>;
  playbook: PlaybookItem[];
}

type Payment = BudgetPlan["obligations"][number];

const DEFAULT_PLAN: BudgetPlan = {
  weeklyAmount: 1522,
  dailyLimit: 218,
  obligationsTotal: 2969,
  buffer: 1275,
  billsPct: 35,
  bufferPct: 15,
  freePct: 50,
  riskLevel: "Low",
  riskDescription: "Your spending is stable with no high-risk leaks.",
  obligations: [
    { name: "Stokvel Contribution", dueDate: "Due 15 Apr", amount: 200, icon: "calendar-month-outline" },
    { name: "Planet Fitness Debit", dueDate: "Due 01 Apr", amount: 199, icon: "calendar-month-outline" },
    { name: "Groceries", dueDate: "Due Weekly", amount: 650, icon: "cart-outline" },
    { name: "Transport Costs", dueDate: "Due Weekly", amount: 100, icon: "bus" },
  ],
  playbook: [
    {
      name: "Use MyCiTi or Rea Vaya for commute",
      category: "Transport",
      saving: 300,
      detail: "A monthly public transport card can cost less than repeated metered trips. Put the first R300 aside for transport before weekend spending.",
      actionText: "SWITCH",
      btnText: "Get MyCiTi card",
    },
    {
      name: "Shop at Shoprite instead of Checkers",
      category: "Groceries",
      saving: 200,
      detail: "Moving one weekly essentials shop to Shoprite or Boxer can lower your grocery spend without changing the basics you buy.",
      actionText: "SWITCH",
      btnText: "Find nearest Shoprite",
    },
    {
      name: "Cancel iflix via MTN USSD",
      category: "Savings",
      saving: 50,
      detail: "You're being charged R49.99/month for iflix. Dial *141*9# on your MTN SIM to cancel it.",
      actionText: "CANCEL",
      btnText: "Dial *141*9# to cancel",
    },
  ],
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Savings: { bg: "#EDE9FE", text: "#7C3AED" },
  Groceries: { bg: "#DCFCE7", text: "#16A34A" },
  Transport: { bg: "#DBEAFE", text: "#2563EB" },
  Banking: { bg: "#FEF3C7", text: "#D97706" },
};

const CATEGORY_ICONS: Record<string, string> = {
  Savings: "piggy-bank",
  Groceries: "cart-outline",
  Transport: "bus",
  Banking: "bank-outline",
};

const WEEK_SPEND_RATIO = 0.42;
const DAY_SPEND_RATIO = 0.38;
const ACTION_LINKS = {
  transport: "https://www.myciti.org.za/en/myconnect-fares/get-your-myconnect-card/",
  groceries: "https://www.google.com/maps/search/?api=1&query=Shoprite%20near%20me",
  iflix: "tel:*141*9%23",
};

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [plan, setPlan] = useState<BudgetPlan>(DEFAULT_PLAN);
  const [generating, setGenerating] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
  const [paymentName, setPaymentName] = useState("");
  const [paymentDue, setPaymentDue] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const { monthlyIncome } = useProfileStore();
  const { leaks } = useLeaksStore();
  const { speak } = useVoice();

  const openAddPayment = () => {
    setEditingPaymentIndex(null);
    setPaymentName("");
    setPaymentDue("");
    setPaymentAmount("");
    setPaymentModalVisible(true);
  };

  const openEditPayment = (payment: Payment, index: number) => {
    setEditingPaymentIndex(index);
    setPaymentName(payment.name);
    setPaymentDue(payment.dueDate);
    setPaymentAmount(String(payment.amount));
    setPaymentModalVisible(true);
  };

  const closePaymentModal = () => {
    setPaymentModalVisible(false);
  };

  const handleSavePayment = () => {
    const amount = Number(paymentAmount.replace(/[^\d.]/g, ""));
    const name = paymentName.trim();
    const dueDate = paymentDue.trim() || "Due soon";

    if (!name || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Payment needed", "Add a payment name and amount greater than R0.");
      return;
    }

    const payment: Payment = {
      name,
      dueDate,
      amount: Math.round(amount),
      icon: "calendar-month-outline",
    };

    setPlan((current) => {
      const obligations = [...current.obligations];
      if (editingPaymentIndex === null) {
        obligations.push(payment);
      } else {
        obligations[editingPaymentIndex] = payment;
      }
      return {
        ...current,
        obligations,
        obligationsTotal: obligations.reduce((sum, item) => sum + item.amount, 0),
      };
    });
    closePaymentModal();
  };

  const handleDeletePayment = () => {
    if (editingPaymentIndex === null) return;
    setPlan((current) => {
      const obligations = current.obligations.filter((_, index) => index !== editingPaymentIndex);
      return {
        ...current,
        obligations,
        obligationsTotal: obligations.reduce((sum, item) => sum + item.amount, 0),
      };
    });
    closePaymentModal();
  };

  const getActionUrl = (item: PlaybookItem) => {
    const label = `${item.name} ${item.btnText}`.toLowerCase();
    if (label.includes("myciti") || label.includes("rea vaya") || label.includes("transport")) {
      return ACTION_LINKS.transport;
    }
    if (label.includes("shoprite") || label.includes("boxer") || label.includes("grocery")) {
      return ACTION_LINKS.groceries;
    }
    if (label.includes("iflix") || label.includes("*141*9")) {
      return ACTION_LINKS.iflix;
    }
    return null;
  };

  const handleActionPress = async (item: PlaybookItem) => {
    const url = getActionUrl(item);
    if (!url) {
      speak(item.detail);
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Cannot open action", "This device cannot open that link right now.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Cannot open action", "Please try again in a moment.");
    }
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const activeLeaks = leaks.filter((l) => l.status === "active");
      const income = monthlyIncome > 0 ? monthlyIncome : 8500;
      const data = simulateBudgetGenerate(
        income,
        activeLeaks.map((l) => ({
          name: l.name,
          amountMonthly: l.amountMonthly,
          category: l.category,
        })),
      );
      const mergedPlaybook: PlaybookItem[] = (data.playbook ?? []).map((p) => ({
        name: p.name ?? "",
        category: p.category ?? "Savings",
        saving: p.saving ?? 0,
        detail: p.detail ?? "Tap to hear this saving opportunity.",
        actionText: p.actionText ?? "ACT",
        btnText: p.btnText ?? "Hear action",
      }));
      setPlan((current) => ({
        weeklyAmount: data.weeklyAmount ?? current.weeklyAmount,
        dailyLimit: data.dailyLimit ?? current.dailyLimit,
        obligationsTotal: current.obligations.reduce((sum, item) => sum + item.amount, 0),
        buffer: data.buffer ?? current.buffer,
        billsPct: data.billsPct ?? current.billsPct,
        bufferPct: data.bufferPct ?? current.bufferPct,
        freePct: data.freePct ?? current.freePct,
        riskLevel: data.riskLevel ?? current.riskLevel,
        riskDescription: data.riskDescription ?? current.riskDescription,
        obligations: current.obligations,
        playbook: mergedPlaybook.length ? mergedPlaybook : current.playbook,
      }));
      Alert.alert(
        "Budget updated",
        `Your weekly budget is R${data.weeklyAmount}. Daily limit is R${data.dailyLimit}.`,
      );
      speak(
        `Your budget is updated. You can safely spend R${data.weeklyAmount} this week, with a daily limit of R${data.dailyLimit}.`,
      );
    } catch {
      Alert.alert("Error", "Could not update your budget. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const weekLabel = `WEEK OF ${new Date().toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase()}`;
  const totalSavings = plan.playbook.reduce((s, p) => s + (p.saving ?? 0), 0);
  const weekSpent = Math.round(plan.weeklyAmount * WEEK_SPEND_RATIO);
  const weekLeft = Math.max(0, plan.weeklyAmount - weekSpent);
  const weekUsedPct = Math.min(100, Math.round((weekSpent / Math.max(plan.weeklyAmount, 1)) * 100));
  const todaySpent = Math.round(plan.dailyLimit * DAY_SPEND_RATIO);
  const todayLeft = Math.max(0, plan.dailyLimit - todaySpent);
  const todayUsedPct = Math.min(100, Math.round((todaySpent / Math.max(plan.dailyLimit, 1)) * 100));
  const obligationsDue = plan.obligations.reduce((s, o) => s + o.amount, 0);
  const actionItems = [...plan.playbook].sort((a, b) => b.saving - a.saving).slice(0, 3);

  return (
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
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.title}>Budget</Text>
          <Text style={styles.subtitle}>Weekly money plan from your latest SMS scan</Text>
        </View>
        <TouchableOpacity
          style={[styles.updateBtn, generating && styles.updateBtnLoading]}
          onPress={handleGenerate}
          activeOpacity={0.8}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.updateText}> Update</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.weeklyCard}>
        <View style={styles.weeklyTop}>
          <View>
            <View style={styles.weeklyIconRow}>
              <MaterialCommunityIcons name="credit-card-outline" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.weeklyWeekLabel}> {weekLabel}</Text>
            </View>
            <Text style={styles.weeklySafeLabel}>Left to spend this week</Text>
          </View>
          <TouchableOpacity
            style={styles.speakerBtn}
            onPress={() =>
              speak(
                `You have R${weekLeft.toFixed(2)} left this week. You have spent R${weekSpent} from a weekly budget of R${plan.weeklyAmount}.`,
              )
            }
          >
            <Ionicons name="volume-medium-outline" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <Text style={styles.weeklyAmount}>
          R{weekLeft.toFixed(2)} <Text style={styles.weeklyPer}>left</Text>
        </Text>

        <View style={styles.weekProgressTrack}>
          <View style={[styles.weekProgressFill, { width: `${weekUsedPct}%` }]} />
        </View>
        <View style={styles.weekSummaryRow}>
          <Text style={styles.weekSummaryText}>R{weekSpent} spent</Text>
          <Text style={styles.weekSummaryText}>R{plan.weeklyAmount} budget</Text>
        </View>

        <View style={styles.weeklyStats}>
          <View style={styles.weeklyStat}>
            <Text style={styles.weeklyStatValue}>R{plan.dailyLimit}</Text>
            <Text style={styles.weeklyStatLabel}>DAILY LIMIT</Text>
          </View>
          <View style={styles.weeklyStatDivider} />
          <View style={styles.weeklyStat}>
            <Text style={styles.weeklyStatValue}>R{plan.buffer}</Text>
            <Text style={styles.weeklyStatLabel}>BUFFER</Text>
          </View>
        </View>
      </View>

      <View style={styles.todayCard}>
        <View style={styles.todayHeader}>
          <View style={styles.todayIcon}>
            <MaterialCommunityIcons name="calendar-today-outline" size={20} color="#7C3AED" />
          </View>
          <View style={styles.todayText}>
            <Text style={styles.todayTitle}>Today</Text>
            <Text style={styles.todaySub}>R{todaySpent} of R{plan.dailyLimit} used</Text>
          </View>
          <Text style={styles.todayLeft}>R{todayLeft} left</Text>
        </View>
        <View style={styles.todayProgressTrack}>
          <View style={[styles.todayProgressFill, { width: `${todayUsedPct}%` }]} />
        </View>
        <Text style={styles.todayNote}>Keep the buffer for taxi changes, medicine, airtime or surprise debit orders.</Text>
      </View>

      <View style={styles.obligationsCard}>
        <View style={styles.obligationsHeader}>
          <View style={styles.obligationsTitleRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#7C3AED" />
            <Text style={styles.obligationsTitle}> Upcoming Payments</Text>
          </View>
          <View style={styles.obligationsBadge}>
            <Text style={styles.obligationsBadgeText}>R{obligationsDue} due</Text>
          </View>
        </View>
        {plan.obligations.slice(0, 4).map((ob, i) => (
          <TouchableOpacity
            key={`${ob.name}-${i}`}
            style={styles.obligationRow}
            activeOpacity={0.75}
            onPress={() => openEditPayment(ob, i)}
          >
            <View style={styles.obIconBox}>
              <MaterialCommunityIcons name={ob.icon as any} size={18} color="#7C3AED" />
            </View>
            <View style={styles.obInfo}>
              <Text style={styles.obName}>{ob.name}</Text>
              <Text style={styles.obDue}>{ob.dueDate}</Text>
            </View>
            <Text style={styles.obAmount}>R{ob.amount}</Text>
            <MaterialCommunityIcons name="pencil-outline" size={16} color="#9CA3AF" style={styles.editIcon} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addObligationBtn} activeOpacity={0.75} onPress={openAddPayment}>
          <MaterialCommunityIcons name="plus" size={16} color="#7C3AED" />
          <Text style={styles.addObligationText}> Add payment</Text>
        </TouchableOpacity>
      </View>

      {actionItems.map((item, index) => {
        const actionColors = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.Savings;
        const actionIcon = CATEGORY_ICONS[item.category] ?? "piggy-bank";

        return (
          <View key={`${item.name}-${index}`} style={styles.nextActionCard}>
            <View style={styles.nextActionHeader}>
              <View style={[styles.nextActionIcon, { backgroundColor: actionColors.bg }]}>
                <MaterialCommunityIcons name={actionIcon as any} size={22} color={actionColors.text} />
              </View>
              <View style={styles.nextActionText}>
                <Text style={styles.nextActionLabel}>
                  {index === 0 ? "Best next action" : "More savings"}
                </Text>
                <Text style={styles.nextActionTitle}>{item.name}</Text>
              </View>
              <View style={styles.nextActionSaving}>
                <Text style={styles.nextActionSavingText}>+R{item.saving}/mo</Text>
              </View>
            </View>
            <Text style={styles.nextActionDetail}>{item.detail}</Text>
            <TouchableOpacity
              style={[styles.nextActionBtn, { backgroundColor: actionColors.text }]}
              activeOpacity={0.85}
              onPress={() => handleActionPress(item)}
            >
              <MaterialCommunityIcons
                name={getActionUrl(item)?.startsWith("tel:") ? "phone" : "open-in-new"}
                size={15}
                color="#FFFFFF"
              />
              <Text style={styles.nextActionBtnText}> {item.btnText}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <Text style={styles.generatedText}>
        Updated from latest SMS scan · R{totalSavings}/mo possible savings
      </Text>

      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={closePaymentModal}>
        <Pressable style={styles.modalOverlay} onPress={closePaymentModal}>
          <Pressable style={styles.paymentSheet} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPaymentIndex === null ? "Add payment" : "Update payment"}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closePaymentModal}>
                <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Payment name</Text>
            <TextInput
              value={paymentName}
              onChangeText={setPaymentName}
              placeholder="Rent, transport, school fees"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Due date</Text>
            <TextInput
              value={paymentDue}
              onChangeText={setPaymentDue}
              placeholder="Due Friday"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Amount</Text>
            <TextInput
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="350"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              style={styles.input}
            />

            <TouchableOpacity style={styles.savePaymentBtn} activeOpacity={0.85} onPress={handleSavePayment}>
              <Text style={styles.savePaymentText}>
                {editingPaymentIndex === null ? "Add payment" : "Update payment"}
              </Text>
            </TouchableOpacity>

            {editingPaymentIndex !== null && (
              <TouchableOpacity style={styles.deletePaymentBtn} activeOpacity={0.75} onPress={handleDeletePayment}>
                <Text style={styles.deletePaymentText}>Delete payment</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6FB" },
  content: { paddingHorizontal: 18 },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", maxWidth: 230 },
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7C3AED",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 86,
    justifyContent: "center",
  },
  updateBtnLoading: { opacity: 0.7 },
  updateText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  weeklyCard: {
    backgroundColor: "#7C3AED",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  weeklyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  weeklyIconRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  weeklyWeekLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  weeklySafeLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.85)" },
  speakerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyAmount: { fontSize: 38, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 14 },
  weeklyPer: { fontSize: 18, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  weekProgressTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.24)",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  weekProgressFill: { height: "100%", backgroundColor: "#4ADE80", borderRadius: 4 },
  weekSummaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  weekSummaryText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.75)" },
  weeklyStats: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 14 },
  weeklyStat: { flex: 1, alignItems: "center" },
  weeklyStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  weeklyStatValue: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
  weeklyStatLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  todayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  todayHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  todayIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  todayText: { flex: 1 },
  todayTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  todaySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280" },
  todayLeft: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#16A34A" },
  todayProgressTrack: { height: 7, backgroundColor: "#E5E7EB", borderRadius: 4, overflow: "hidden", marginBottom: 10 },
  todayProgressFill: { height: "100%", backgroundColor: "#7C3AED", borderRadius: 4 },
  todayNote: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 19 },
  obligationsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  obligationsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  obligationsTitleRow: { flexDirection: "row", alignItems: "center" },
  obligationsTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827" },
  obligationsBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  obligationsBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  obligationRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  obIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  obInfo: { flex: 1 },
  obName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827", marginBottom: 2 },
  obDue: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  obAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#DC2626" },
  editIcon: { marginLeft: 8 },
  addObligationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 14,
    marginTop: 4,
  },
  addObligationText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7C3AED" },
  nextActionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  nextActionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  nextActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  nextActionText: { flex: 1 },
  nextActionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#7C3AED", marginBottom: 2 },
  nextActionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827" },
  nextActionSaving: { backgroundColor: "#DCFCE7", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  nextActionSavingText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#16A34A" },
  nextActionDetail: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 21, marginBottom: 14 },
  nextActionButtons: { flexDirection: "row", gap: 10 },
  nextActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 12,
  },
  nextActionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  generatedText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", textAlign: "center", marginVertical: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.45)",
    justifyContent: "flex-end",
  },
  paymentSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  modalTitle: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827" },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  inputLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 8 },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    marginBottom: 14,
  },
  savePaymentBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  savePaymentText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  deletePaymentBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  deletePaymentText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
});
