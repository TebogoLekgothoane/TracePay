import React, { useState } from "react";
import {
  View,
  Alert,
  Linking,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GlassInput } from "@/components/GlassInput";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useProfileStore } from "@/stores/profileStore";
import { useLeaksStore, getActiveLeaks, DEFAULT_MONTHLY_INCOME } from "@/stores/leaksStore";
import { useVoice } from "@/hooks/useVoice";
import { useColorScheme } from "@/hooks/useColorScheme";
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
  buffer: number;
  obligations: { name: string; dueDate: string; amount: number; icon: string }[];
  playbook: PlaybookItem[];
}

type Payment = BudgetPlan["obligations"][number];

function createInitialPlan(income: number): BudgetPlan {
  const weeklyAmount = Math.round(income / 4.33);
  const dailyLimit = Math.round(weeklyAmount / 7);
  return {
    weeklyAmount,
    dailyLimit,
    buffer: Math.round(weeklyAmount * 0.15),
    obligations: [],
    playbook: [],
  };
}

const CATEGORY_ICONS: Record<string, string> = {
  Savings: "piggy-bank",
  Groceries: "cart-outline",
  Transport: "bus",
  Banking: "bank-outline",
};

const ACTION_LINKS = {
  transport: "https://www.myciti.org.za/en/myconnect-fares/get-your-myconnect-card/",
  groceries: "https://www.google.com/maps/search/?api=1&query=Shoprite%20near%20me",
};

export default function BudgetScreen() {
  const { monthlyIncome } = useProfileStore();
  const income = monthlyIncome > 0 ? monthlyIncome : DEFAULT_MONTHLY_INCOME;
  const [plan, setPlan] = useState(() => createInitialPlan(income));
  const [generating, setGenerating] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
  const [paymentName, setPaymentName] = useState("");
  const [paymentDue, setPaymentDue] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const { leaks } = useLeaksStore();
  const { speak } = useVoice();
  const { colors } = useColorScheme();

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
      return { ...current, obligations };
    });
    closePaymentModal();
  };

  const handleDeletePayment = () => {
    if (editingPaymentIndex === null) return;
    setPlan((current) => {
      const obligations = current.obligations.filter((_, index) => index !== editingPaymentIndex);
      return { ...current, obligations };
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
      const activeLeaks = getActiveLeaks(leaks);
      const income = monthlyIncome > 0 ? monthlyIncome : DEFAULT_MONTHLY_INCOME;
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
        weeklyAmount: data.weeklyAmount,
        dailyLimit: data.dailyLimit,
        buffer: data.buffer,
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

  const weekLabel = `Week of ${new Date().toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
  const totalSavings = plan.playbook.reduce((s, p) => s + (p.saving ?? 0), 0);
  const obligationsDue = plan.obligations.reduce((s, o) => s + o.amount, 0);
  const actionItems = [...plan.playbook].sort((a, b) => b.saving - a.saving).slice(0, 3);

  return (
    <>
      <Screen>
        <View className="mb-5 flex-row items-start justify-between">
          <View className="max-w-[230px]">
            <AppText variant="titleMd" className="mb-0.5">
              Budget
            </AppText>
            <AppText variant="lead">Weekly money plan from your latest SMS scan</AppText>
          </View>
          <Button
            size="sm"
            onPress={handleGenerate}
            loading={generating}
            className="min-w-[86px] rounded-full px-3.5 py-2"
            icon={!generating ? <MaterialCommunityIcons name="refresh" size={14} color="#FFFFFF" /> : undefined}
          >
            Update
          </Button>
        </View>

        <Card glass={false} className="mb-4 border-0 bg-brand-purple">
          <View className="mb-3 flex-row items-start justify-between">
            <View>
              <View className="mb-1 flex-row items-center">
                <MaterialCommunityIcons name="credit-card-outline" size={16} color="rgba(255,255,255,0.8)" />
                <AppText variant="caption" className="ml-1 uppercase tracking-wide text-white/70">
                  {weekLabel}
                </AppText>
              </View>
              <AppText variant="bodySm" className="text-white/85">
                Weekly budget
              </AppText>
            </View>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 min-h-0 rounded-full bg-white/15"
              onPress={() =>
                speak(
                  `You have R${plan.weeklyAmount.toFixed(2)} available this week, with a daily limit of R${plan.dailyLimit}.`,
                )
              }
            >
              <Ionicons name="volume-medium-outline" size={18} color="rgba(255,255,255,0.7)" />
            </Button>
          </View>

          <View className="mb-3.5 flex-row items-baseline">
            <AppText className="text-[38px] font-bold text-white">
              R{plan.weeklyAmount.toFixed(2)}
            </AppText>
            <AppText variant="title" className="ml-1 text-lg text-white/75">
              weekly
            </AppText>
          </View>

          <View className="mb-4 flex-row justify-between">
            <AppText variant="caption" className="text-white/75">
              Tap Update to refresh from your latest scan
            </AppText>
          </View>

          <View className="flex-row rounded-xl bg-white/15 p-3.5">
            <View className="flex-1 items-center">
              <AppText variant="title" className="mb-0.5 text-white">
                R{plan.dailyLimit}
              </AppText>
              <AppText variant="caption" className="uppercase tracking-wide text-white/70">
                Daily limit
              </AppText>
            </View>
            <View className="w-px bg-white/20" />
            <View className="flex-1 items-center">
              <AppText variant="title" className="mb-0.5 text-white">
                R{plan.buffer}
              </AppText>
              <AppText variant="caption" className="uppercase tracking-wide text-white/70">
                Buffer
              </AppText>
            </View>
          </View>
        </Card>

        <Card className="mb-4">
          <View className="mb-3 flex-row items-center gap-3">
            <View className="h-[42px] w-[42px] items-center justify-center rounded-[10px] bg-brand-purple-light dark:bg-primary/20">
              <MaterialCommunityIcons name="calendar-today-outline" size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <AppText variant="title">Today</AppText>
              <AppText variant="bodySm" className="mt-0.5">
                Daily spending limit
              </AppText>
            </View>
            <AppText variant="label" className="text-green-600 dark:text-green-400">
              R{plan.dailyLimit}
            </AppText>
          </View>
          <AppText variant="bodySm" className="leading-[19px]">
            Keep the buffer for taxi changes, medicine, airtime or surprise debit orders.
          </AppText>
        </Card>

        <Card className="mb-4" contentClassName="gap-0">
          <View className="mb-3.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.primary} />
              <AppText variant="title">Upcoming payments</AppText>
            </View>
            <View className="badge-danger rounded-xl">
              <AppText variant="caption" className="font-semibold text-red-600 dark:text-red-400">
                R{obligationsDue} due
              </AppText>
            </View>
          </View>
          {plan.obligations.slice(0, 4).map((ob, i) => (
            <Button
              key={`${ob.name}-${i}`}
              variant="ghost"
              className="min-h-0 flex-row items-center border-t border-border py-2.5 dark:border-white/10"
              onPress={() => openEditPayment(ob, i)}
            >
              <View className="mr-3 h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-brand-purple-light dark:bg-primary/20">
                <MaterialCommunityIcons name={ob.icon as any} size={18} color={colors.primary} />
              </View>
              <View className="flex-1">
                <AppText variant="label">{ob.name}</AppText>
                <AppText variant="caption" className="mt-0.5">
                  {ob.dueDate}
                </AppText>
              </View>
              <AppText variant="label" className="text-red-600 dark:text-red-400">
                R{ob.amount}
              </AppText>
              <View className="ml-2">
                <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.mutedForeground} />
              </View>
            </Button>
          ))}
          <Button
            variant="ghost"
            className="mt-1 min-h-0 flex-row items-center justify-center border-t border-border pt-3.5 dark:border-white/10"
            onPress={openAddPayment}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <AppText variant="label" className="ml-1 text-brand-purple dark:text-primary">
              Add payment
            </AppText>
          </Button>
        </Card>

        {actionItems.map((item, index) => {
          const category = getCategoryStyle(item.category);
          const actionIcon = CATEGORY_ICONS[item.category] ?? "piggy-bank";

          return (
            <Card key={`${item.name}-${index}`} className="mb-4">
              <View className="mb-3 flex-row items-center gap-3">
                <View className={cn("h-11 w-11 items-center justify-center rounded-[10px]", category.iconBg)}>
                  <MaterialCommunityIcons name={actionIcon as any} size={22} color={category.iconColor} />
                </View>
                <View className="flex-1">
                  <AppText variant="overlineBrand" className="mb-0.5">
                    {index === 0 ? "Best next action" : "More savings"}
                  </AppText>
                  <AppText variant="title">{item.name}</AppText>
                </View>
                <View className="badge-success rounded-xl">
                  <AppText variant="caption" className="font-bold text-green-600 dark:text-green-400">
                    +R{item.saving}/mo
                  </AppText>
                </View>
              </View>
              <AppText variant="bodySm" className="mb-3.5 leading-[21px]">
                {item.detail}
              </AppText>
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
            </Card>
          );
        })}

        <AppText variant="caption" className="my-5 text-center">
          Updated from latest SMS scan · R{totalSavings}/mo possible savings
        </AppText>
      </Screen>

      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={closePaymentModal}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={closePaymentModal}>
          <Pressable className="modal-sheet" onPress={() => {}}>
            <View className="mb-5 flex-row items-center">
              <AppText variant="titleMd" className="flex-1">
                {editingPaymentIndex === null ? "Add payment" : "Update payment"}
              </AppText>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 min-h-0 rounded-full bg-muted dark:bg-white/10"
                onPress={closePaymentModal}
              >
                <MaterialCommunityIcons name="close" size={20} color={colors.mutedForeground} />
              </Button>
            </View>

            <AppText variant="label" className="mb-2">
              Payment name
            </AppText>
            <GlassInput className="mb-4">
              <TextInput
                value={paymentName}
                onChangeText={setPaymentName}
                placeholder="Rent, transport, school fees"
                placeholderTextColor={colors.mutedForeground}
                className="flex-1 text-[15px] font-sans text-foreground"
              />
            </GlassInput>

            <AppText variant="label" className="mb-2">
              Due date
            </AppText>
            <GlassInput className="mb-4">
              <TextInput
                value={paymentDue}
                onChangeText={setPaymentDue}
                placeholder="Due Friday"
                placeholderTextColor={colors.mutedForeground}
                className="flex-1 text-[15px] font-sans text-foreground"
              />
            </GlassInput>

            <AppText variant="label" className="mb-2">
              Amount
            </AppText>
            <GlassInput className="mb-5">
              <TextInput
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder="350"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                className="flex-1 text-[15px] font-sans text-foreground"
              />
            </GlassInput>

            <Button fullWidth onPress={handleSavePayment} className="rounded-xl py-3.5">
              {editingPaymentIndex === null ? "Add payment" : "Update payment"}
            </Button>

            {editingPaymentIndex !== null ? (
              <Button
                variant="ghost"
                fullWidth
                onPress={handleDeletePayment}
                className="mt-1 py-3.5"
                textClassName="text-sm font-semibold text-red-600 dark:text-red-400"
              >
                Delete payment
              </Button>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
