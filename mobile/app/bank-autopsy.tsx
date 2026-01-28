import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { BankSummaryCard } from "@/components/bank-summary-card";
import { SavingsOpportunityCard } from "@/components/savings-opportunity-card";
import { AutopsyCauseList, type AutopsyCause } from "@/components/autopsy-cause-list";
import type { Bank } from "@/components/bank-card";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { AppHeader } from "@/components/app-header";
import { useTheme } from "@/hooks/use-theme-color";

const MOCK_BANKS: Bank[] = [
  { id: "capitec", name: "Capitec", type: "bank", totalLost: 1193.5 },
  { id: "standard-bank", name: "Standard Bank", type: "bank", totalLost: 530.2 },
  { id: "mtn-momo", name: "MTN MoMo", type: "momo", totalLost: 496.0 },
];

const MOCK_CAUSES: AutopsyCause[] = [
  { id: "hidden-fees", title: "Hidden Fees", amount: 320, percentOfIncome: 4.2 },
  { id: "mashonisa", title: "Mashonisa Interest", amount: 780, percentOfIncome: 10.3 },
  { id: "airtime", title: "Airtime Drains", amount: 210, percentOfIncome: 2.8 },
];

type LeakTag = "airtime_drain" | "hidden_fee" | "loan_shark";

type LeakTransaction = {
  id: string;
  date: string;
  merchant: string;
  description: string;
  channel: string;
  tag: LeakTag;
  amount: number;
};

type LeakDataset = Record<string, LeakTransaction[]>;

const LEAKS_BY_CAUSE: LeakDataset = {
  "hidden-fees": [
    {
      id: "hf-1",
      date: "2026-01-12",
      merchant: "Bank A",
      description: "Withdrawal Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 2.5,
    },
    {
      id: "hf-2",
      date: "2026-01-07",
      merchant: "Bank A",
      description: "SMS Notification Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 1.2,
    },
    {
      id: "hf-3",
      date: "2026-01-02",
      merchant: "Bank A",
      description: "Monthly Service Fee",
      channel: "bank_fee",
      tag: "hidden_fee",
      amount: 5.5,
    },
  ],
  mashonisa: [
    {
      id: "ms-1",
      date: "2025-12-30",
      merchant: "Informal",
      description: "Mr Dlamini Repayment",
      channel: "loan",
      tag: "loan_shark",
      amount: 1500,
    },
  ],
  airtime: [
    {
      id: "at-1",
      date: "2026-01-26",
      merchant: "Telco B",
      description: "Airtime Bundle",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 29,
    },
    {
      id: "at-2",
      date: "2026-01-25",
      merchant: "Telco B",
      description: "Data Bundle",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 5,
    },
    {
      id: "at-3",
      date: "2026-01-24",
      merchant: "Telco B",
      description: "WASP Subscription - Games",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 12,
    },
    {
      id: "at-4",
      date: "2026-01-17",
      merchant: "Telco B",
      description: "Airtime Advance Repayment",
      channel: "airtime",
      tag: "airtime_drain",
      amount: 50,
    },
  ],
};

function formatDisplayDate(value: string) {
  const date = new Date(value);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return { day, month };
}

function formatAmount(amount: number) {
  return `+R ${amount.toFixed(2)}`;
}

function TagPill({ tag }: { tag: LeakTag }) {
  const { isDark } = useTheme();

  let bgBase: string;
  let textColor: string;
  let label: string;

  if (tag === "airtime_drain") {
    bgBase = isDark ? Colors.dark.warningYellow : Colors.light.warningYellow;
    textColor = bgBase;
    label = "AIRTIME DRAIN";
  } else if (tag === "hidden_fee") {
    bgBase = isDark ? Colors.dark.alarmRed : Colors.light.alarmRed;
    textColor = bgBase;
    label = "HIDDEN FEE";
  } else {
    bgBase = isDark ? Colors.dark.text : Colors.light.text;
    textColor = "#FFFFFF";
    label = "LOAN SHARK";
  }

  const backgroundColor = tag === "loan_shark" ? bgBase : bgBase + "20";

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        backgroundColor,
      }}
    >
      <ThemedText type="small" className="text-xs" style={{ color: textColor }}>
        {label}
      </ThemedText>
    </View>
  );
}

function LeakRow({ tx }: { tx: LeakTransaction }) {
  const { theme } = useTheme();
  const { day, month } = formatDisplayDate(tx.date);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: theme.backgroundTertiary,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.xs,
        backgroundColor: theme.backgroundDefault,
      }}
    >
      <View style={{ width: 52, alignItems: "flex-start" }}>
        <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 11 }}>
          {month}
        </ThemedText>
        <ThemedText type="h3" style={{ marginTop: 2 }}>
          {day}
        </ThemedText>
      </View>

      <View style={{ flex: 1, paddingHorizontal: Spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <ThemedText type="body" style={{ flex: 1, marginRight: Spacing.sm }}>
            {tx.description}
          </ThemedText>
          <TagPill tag={tx.tag} />
        </View>

        <ThemedText type="small" style={{ marginTop: 4, color: theme.textSecondary }}>
          {tx.merchant} • {tx.channel}
        </ThemedText>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <ThemedText type="body" style={{ fontWeight: "600", color: Colors.light.hopeGreen }}>
          {formatAmount(tx.amount)}
        </ThemedText>
      </View>
    </View>
  );
}

export default function BankAutopsyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();
  const [expandedCauseId, setExpandedCauseId] = useState<string | null>(null);

  const bank = useMemo(() => {
    const found = MOCK_BANKS.find((b) => b.id === bankId);
    return found ?? MOCK_BANKS[0];
  }, [bankId]);

  const expandedLeaks = useMemo<LeakTransaction[]>(() => {
    if (!expandedCauseId) return [];
    return LEAKS_BY_CAUSE[expandedCauseId] ?? [];
  }, [expandedCauseId]);

  return (
    <ThemedView className="bg-bg flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
      >
        <View>
          <AppHeader
            title={bank.name}
            subtitle={`You lost R ${bank.totalLost.toFixed(1)} this month`}
            showBackButton
            onBackPress={() => router.back()}
          />

          <BankSummaryCard bank={bank} />

          {bank.type === "momo" ? (
            <SavingsOpportunityCard momoSpent={496} bundleCost={350} savings={146} />
          ) : null}

          <AutopsyCauseList
            causes={MOCK_CAUSES}
            onSelect={(cause) => {
              setExpandedCauseId((current) => (current === cause.id ? null : cause.id));
            }}
          />

          {expandedLeaks.length > 0 ? (
            <View
              style={{
                marginTop: Spacing["2xl"],
              }}
            >
              <ThemedText type="h3" className="text-text mb-2">
                Raw leaks for {MOCK_CAUSES.find((c) => c.id === expandedCauseId)?.title}
              </ThemedText>
              <ThemedText type="small" className="text-text-muted mb-3">
                Raw transaction data with forensic flags for {bank.name}.
              </ThemedText>

              {expandedLeaks.map((tx) => (
                <LeakRow key={tx.id} tx={tx} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Pressable
        onPress={() =>
          router.push({ pathname: "/voicemodal" as any, params: { bankId: bank.id } } as any)
        }
        className="absolute right-5 bg-accent rounded-full px-5 py-3 flex-row items-center"
        style={{ bottom: insets.bottom + 18 }}
      >
        <Feather name="mic" size={18} color="#FFFFFF" />
        <View style={{ width: 10 }} />
        <ThemedText type="button" className="text-white">
          Mamela imali yam
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

