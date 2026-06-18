import React, { useState } from "react";
import {
  View,
  Text,
  Alert,
  Linking,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";
import { simulateBudgetGenerate } from "@/lib/simulate";
import { getCategoryStyle } from "@/lib/category-colors";
import { cn } from "@/lib/cn";

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
  obligations: { name: string; dueDate: string; amount: number; icon: string }[];
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
    <Screen>
      <View className="flex-row justify-between items-start mb-5">
        <View>
          <Text className="heading-lg mb-0.5">Budget</Text>
          <Text className="body-text max-w-[230px]">
            Weekly money plan from your latest SMS scan
          </Text>
        </View>
        <Button
          size="sm"
          onPress={handleGenerate}
          loading={generating}
          className="px-3.5 py-2 rounded-full min-w-[86px]"
          icon={!generating ? <MaterialCommunityIcons name="refresh" size={14} color="#FFFFFF" /> : undefined}
        >
          Update
        </Button>
      </View>

      <View className="bg-brand-purple rounded-[18px] p-5 mb-4 shadow-lg">
        <View className="flex-row justify-between items-start mb-3">
          <View>
            <View className="flex-row items-center mb-1">
              <MaterialCommunityIcons name="credit-card-outline" size={16} color="rgba(255,255,255,0.8)" />
              <Text className="text-[11px] font-medium text-white/70 tracking-wide"> {weekLabel}</Text>
            </View>
            <Text className="text-sm font-medium text-white/85">Left to spend this week</Text>
          </View>
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 rounded-full bg-white/15 min-h-0"
            onPress={() =>
              speak(
                `You have R${weekLeft.toFixed(2)} left this week. You have spent R${weekSpent} from a weekly budget of R${plan.weeklyAmount}.`,
              )
            }
          >
            <Ionicons name="volume-medium-outline" size={18} color="rgba(255,255,255,0.7)" />
          </Button>
        </View>

        <Text className="text-[38px] font-bold text-white mb-3.5">
          R{weekLeft.toFixed(2)} <Text className="text-lg font-sans text-white/75">left</Text>
        </Text>

        <View className="h-2 bg-white/25 rounded overflow-hidden mb-2">
          <View className="progress-fill progress-fill-green" style={{ width: `${weekUsedPct}%` }} />
        </View>
        <View className="flex-row justify-between mb-4">
          <Text className="text-xs font-medium text-white/75">R{weekSpent} spent</Text>
          <Text className="text-xs font-medium text-white/75">R{plan.weeklyAmount} budget</Text>
        </View>

        <View className="flex-row bg-white/15 rounded-xl p-3.5">
          <View className="flex-1 items-center">
            <Text className="text-[17px] font-bold text-white mb-0.5">R{plan.dailyLimit}</Text>
            <Text className="text-[10px] font-medium text-white/70 tracking-wide">DAILY LIMIT</Text>
          </View>
          <View className="w-px bg-white/20" />
          <View className="flex-1 items-center">
            <Text className="text-[17px] font-bold text-white mb-0.5">R{plan.buffer}</Text>
            <Text className="text-[10px] font-medium text-white/70 tracking-wide">BUFFER</Text>
          </View>
        </View>
      </View>

      <View className="card mb-4">
        <View className="flex-row items-center mb-3">
          <View className="w-[42px] h-[42px] rounded-[10px] bg-brand-purple-light items-center justify-center mr-3">
            <MaterialCommunityIcons name="calendar-today-outline" size={20} color="#7C3AED" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-strong mb-0.5">Today</Text>
            <Text className="body-text">R{todaySpent} of R{plan.dailyLimit} used</Text>
          </View>
          <Text className="text-[15px] font-bold text-green-600">R{todayLeft} left</Text>
        </View>
        <View className="h-[7px] bg-gray-200 rounded overflow-hidden mb-2.5">
          <View className="progress-fill progress-fill-purple" style={{ width: `${todayUsedPct}%` }} />
        </View>
        <Text className="body-text leading-[19px]">
          Keep the buffer for taxi changes, medicine, airtime or surprise debit orders.
        </Text>
      </View>

      <View className="card mb-4">
        <View className="flex-row justify-between items-center mb-3.5">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#7C3AED" />
            <Text className="text-base font-bold text-strong"> Upcoming Payments</Text>
          </View>
          <View className="badge-danger rounded-xl">
            <Text className="text-xs font-semibold text-red-600">R{obligationsDue} due</Text>
          </View>
        </View>
        {plan.obligations.slice(0, 4).map((ob, i) => (
          <Button
            key={`${ob.name}-${i}`}
            variant="ghost"
            className="flex-row items-center py-2.5 border-t border-gray-100"
            onPress={() => openEditPayment(ob, i)}
          >
            <View className="w-[38px] h-[38px] rounded-[10px] bg-brand-purple-light items-center justify-center mr-3">
              <MaterialCommunityIcons name={ob.icon as any} size={18} color="#7C3AED" />
            </View>
            <View className="flex-1">
              <Text className="list-row-title mb-0.5">{ob.name}</Text>
              <Text className="caption">{ob.dueDate}</Text>
            </View>
            <Text className="text-[15px] font-bold text-red-600">R{ob.amount}</Text>
            <View className="ml-2">
              <MaterialCommunityIcons name="pencil-outline" size={16} color="#9CA3AF" />
            </View>
          </Button>
        ))}
        <Button variant="ghost" className="flex-row items-center justify-center border-t border-gray-100 pt-3.5 mt-1" onPress={openAddPayment}>
          <MaterialCommunityIcons name="plus" size={16} color="#7C3AED" />
          <Text className="text-sm font-semibold text-brand-purple"> Add payment</Text>
        </Button>
      </View>

      {actionItems.map((item, index) => {
        const category = getCategoryStyle(item.category);
        const actionIcon = CATEGORY_ICONS[item.category] ?? "piggy-bank";

        return (
          <View key={`${item.name}-${index}`} className="card mb-4">
            <View className="flex-row items-center mb-3">
              <View className={cn("w-11 h-11 rounded-[10px] items-center justify-center mr-3", category.iconBg)}>
                <MaterialCommunityIcons name={actionIcon as any} size={22} color={category.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="overline-brand mb-0.5">
                  {index === 0 ? "Best next action" : "More savings"}
                </Text>
                <Text className="text-base font-bold text-strong">{item.name}</Text>
              </View>
              <View className="badge-success rounded-xl">
                <Text className="text-xs font-bold text-green-600">+R{item.saving}/mo</Text>
              </View>
            </View>
            <Text className="text-sm font-sans text-gray-700 leading-[21px] mb-3.5">{item.detail}</Text>
            <Button
              className={cn("rounded-[10px] py-3", category.btn)}
              onPress={() => handleActionPress(item)}
              icon={
                <MaterialCommunityIcons
                  name={getActionUrl(item)?.startsWith("tel:") ? "phone" : "open-in-new"}
                  size={15}
                  color="#FFFFFF"
                />
              }
            >
              {item.btnText}
            </Button>
          </View>
        );
      })}

      <Text className="caption text-center my-5">
        Updated from latest SMS scan · R{totalSavings}/mo possible savings
      </Text>

      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={closePaymentModal}>
        <Pressable className="flex-1 bg-gray-900/45 justify-end" onPress={closePaymentModal}>
          <Pressable className="modal-sheet" onPress={() => {}}>
            <View className="flex-row items-center mb-[18px]">
              <Text className="flex-1 heading-lg">
                {editingPaymentIndex === null ? "Add payment" : "Update payment"}
              </Text>
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full bg-gray-100 min-h-0" onPress={closePaymentModal}>
                <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
              </Button>
            </View>

            <Text className="field-label">Payment name</Text>
            <TextInput
              value={paymentName}
              onChangeText={setPaymentName}
              placeholder="Rent, transport, school fees"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 input-field mb-3.5"
            />

            <Text className="field-label">Due date</Text>
            <TextInput
              value={paymentDue}
              onChangeText={setPaymentDue}
              placeholder="Due Friday"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 input-field mb-3.5"
            />

            <Text className="field-label">Amount</Text>
            <TextInput
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="350"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 input-field mb-3.5"
            />

            <Button fullWidth onPress={handleSavePayment} className="rounded-xl py-3.5 mt-1">
              {editingPaymentIndex === null ? "Add payment" : "Update payment"}
            </Button>

            {editingPaymentIndex !== null && (
              <Button variant="ghost" fullWidth onPress={handleDeletePayment} className="py-3.5 mt-1" textClassName="text-sm font-semibold text-red-600">
                Delete payment
              </Button>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
