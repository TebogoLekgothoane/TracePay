import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Filter,
  Fuel,
  List,
  Search,
  ShoppingCart,
  Tv,
  UtensilsCrossed,
  Zap,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { IconButton } from "../../src/components/ui/IconButton";
import { COLORS, TRACEPAY, withAlpha } from "../../src/theme/colors";

const TABS = ["All", "Money in", "Money out", "Transfers"] as const;
type Tab = (typeof TABS)[number];

type TransactionType = "income" | "expense" | "transfer";

type Transaction = {
  id: string;
  title: string;
  category: string;
  amount: string;
  time: string;
  type: TransactionType;
  Icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  categoryColor: string;
  categoryBg: string;
};

const TRANSACTIONS: { label: string; items: Transaction[] }[] = [
  {
    label: "Today",
    items: [
      {
        id: "1",
        title: "Pick n Pay",
        category: "Shopping",
        amount: "-R452.60",
        time: "14:32",
        type: "expense",
        Icon: ShoppingCart,
        iconColor: "#F97316",
        iconBg: "rgba(249, 115, 22, 0.14)",
        categoryColor: "#F97316",
        categoryBg: "rgba(249, 115, 22, 0.12)",
      },
      {
        id: "2",
        title: "Salary",
        category: "Income",
        amount: "+R8,500.00",
        time: "08:00",
        type: "income",
        Icon: ArrowDownLeft,
        iconColor: "#14B8A6",
        iconBg: "rgba(20, 184, 166, 0.14)",
        categoryColor: "#14B8A6",
        categoryBg: "rgba(20, 184, 166, 0.12)",
      },
    ],
  },
  {
    label: "Yesterday",
    items: [
      {
        id: "3",
        title: "Netflix",
        category: "Subscriptions",
        amount: "-R159.00",
        time: "21:15",
        type: "expense",
        Icon: Tv,
        iconColor: "#7955E7",
        iconBg: "rgba(121, 85, 231, 0.14)",
        categoryColor: "#7955E7",
        categoryBg: "rgba(121, 85, 231, 0.12)",
      },
      {
        id: "4",
        title: "Sasol",
        category: "Transport",
        amount: "-R650.00",
        time: "18:42",
        type: "expense",
        Icon: Fuel,
        iconColor: "#327DFC",
        iconBg: "rgba(50, 125, 252, 0.14)",
        categoryColor: "#327DFC",
        categoryBg: "rgba(50, 125, 252, 0.12)",
      },
      {
        id: "5",
        title: "Transfer to Mom",
        category: "Transfers",
        amount: "-R500.00",
        time: "10:20",
        type: "transfer",
        Icon: ArrowUpRight,
        iconColor: "#77788C",
        iconBg: "rgba(119, 120, 140, 0.14)",
        categoryColor: "#77788C",
        categoryBg: "rgba(119, 120, 140, 0.12)",
      },
    ],
  },
  {
    label: "18 May 2024",
    items: [
      {
        id: "6",
        title: "Nedbank",
        category: "Income",
        amount: "+R2,000.00",
        time: "16:30",
        type: "income",
        Icon: Building2,
        iconColor: "#14B8A6",
        iconBg: "rgba(20, 184, 166, 0.14)",
        categoryColor: "#14B8A6",
        categoryBg: "rgba(20, 184, 166, 0.12)",
      },
      {
        id: "7",
        title: "KFC",
        category: "Food & Dining",
        amount: "-R120.00",
        time: "12:45",
        type: "expense",
        Icon: UtensilsCrossed,
        iconColor: "#F651C2",
        iconBg: "rgba(246, 81, 194, 0.14)",
        categoryColor: "#F651C2",
        categoryBg: "rgba(246, 81, 194, 0.12)",
      },
    ],
  },
  {
    label: "17 May 2024",
    items: [
      {
        id: "8",
        title: "Eskom",
        category: "Bills & utilities",
        amount: "-R760.00",
        time: "09:10",
        type: "expense",
        Icon: Zap,
        iconColor: "#14B8A6",
        iconBg: "rgba(20, 184, 166, 0.14)",
        categoryColor: "#14B8A6",
        categoryBg: "rgba(20, 184, 166, 0.12)",
      },
    ],
  },
];

function SegmentTabs({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="rounded-2xl bg-muted p-1.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
      >
        {TABS.map((tab) => {
          const selected = tab === active;

          if (selected) {
            return (
              <Pressable key={tab} onPress={() => onChange(tab)}>
                <LinearGradient
                  colors={[trace.splashPayStart, trace.primary, trace.splashPayEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Text
                    style={{ color: trace.primaryForeground }}
                    className="text-[13px] font-semibold"
                  >
                    {tab}
                  </Text>
                </LinearGradient>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={tab}
              onPress={() => onChange(tab)}
              className="rounded-full px-4 py-2.5 active:opacity-75"
            >
              <Text className="text-[13px] font-medium text-muted-foreground">
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  Icon,
  iconColor,
  valueColor,
}: {
  label: string;
  value: string;
  Icon: LucideIcon;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-muted px-3 py-3.5">
      <View
        className="mb-2 h-7 w-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: withAlpha(iconColor, 0.12) }}
      >
        <Icon color={iconColor} size={14} strokeWidth={2.2} />
      </View>
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
      <Text
        className="mt-0.5 text-[14px] font-bold tracking-[-0.2px]"
        style={{ color: valueColor }}
      >
        {value}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  Icon,
  iconColor,
}: {
  label: string;
  Icon: LucideIcon;
  iconColor: string;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <Pressable className="flex-1 flex-row items-center gap-2 rounded-2xl bg-muted px-3.5 py-3 active:opacity-75">
      <View
        className="h-7 w-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: withAlpha(iconColor, 0.12) }}
      >
        <Icon color={iconColor} size={14} strokeWidth={2.2} />
      </View>
      <Text className="flex-1 text-[13px] font-medium text-foreground">
        {label}
      </Text>
      <ChevronDown color={palette.placeholder} size={16} strokeWidth={2} />
    </Pressable>
  );
}

function TransactionRow({
  item,
  palette,
}: {
  item: Transaction;
  palette: (typeof COLORS)["light"] | (typeof COLORS)["dark"];
}) {
  const amountColor =
    item.type === "income" ? palette.success : palette.destructive;

  return (
    <Pressable
      onPress={() => router.push(`/transactions/${item.id}`)}
      className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: item.iconBg }}
      >
        <item.Icon color={item.iconColor} size={20} strokeWidth={2.2} />
      </View>

      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold text-foreground">
          {item.title}
        </Text>
        <Text className="mt-0.5 text-[12px] text-muted-foreground">
          {item.time}
        </Text>
      </View>

      <View
        className="rounded-full px-2.5 py-1"
        style={{ backgroundColor: item.categoryBg }}
      >
        <Text
          className="text-[10px] font-semibold"
          style={{ color: item.categoryColor }}
        >
          {item.category}
        </Text>
      </View>

      <Text
        className="min-w-[72px] text-right text-[14px] font-bold"
        style={{ color: amountColor }}
      >
        {item.amount}
      </Text>

      <ChevronRight color={palette.placeholder} size={18} strokeWidth={2} />
    </Pressable>
  );
}

export default function TransactionsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  const sections = useMemo(() => {
    return TRANSACTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (activeTab === "All") return true;
        if (activeTab === "Money in") return item.type === "income";
        if (activeTab === "Money out") return item.type === "expense";
        return item.type === "transfer";
      }),
    })).filter((section) => section.items.length > 0);
  }, [activeTab]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
                Transactions
              </Text>
              <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
                See where your money goes
              </Text>
            </View>

            <View className="flex-row gap-2 pt-1">
              <IconButton accessibilityLabel="Search transactions" variant="soft">
                <Search color={palette.primary} size={18} strokeWidth={2} />
              </IconButton>
              <IconButton accessibilityLabel="Filter transactions" variant="soft">
                <Filter color={palette.primary} size={18} strokeWidth={2} />
              </IconButton>
            </View>
          </View>

          <View className="mt-5">
            <SegmentTabs active={activeTab} onChange={setActiveTab} />
          </View>

          <View className="mt-4 flex-row gap-2.5">
            <SummaryCard
              label="Total in"
              value="R12,540.00"
              Icon={ArrowDownLeft}
              iconColor={palette.success}
            />
            <SummaryCard
              label="Total out"
              value="R6,680.45"
              Icon={ArrowUpRight}
              iconColor={palette.destructive}
            />
            <SummaryCard
              label="Net flow"
              value="+R5,859.55"
              Icon={List}
              iconColor={palette.primary}
              valueColor={palette.primary}
            />
          </View>

          <View className="mt-3 flex-row gap-2.5">
            <FilterChip
              label="All accounts"
              Icon={CreditCard}
              iconColor={palette.primary}
            />
            <FilterChip
              label="This month"
              Icon={Calendar}
              iconColor={palette.primary}
            />
          </View>

          {sections.map((section) => (
            <View key={section.label} className="mt-6">
              <Text className="mb-3 text-[13px] font-semibold text-muted-foreground">
                {section.label}
              </Text>
              <View className="gap-2">
                {section.items.map((item) => (
                  <TransactionRow key={item.id} item={item} palette={palette} />
                ))}
              </View>
            </View>
          ))}

        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
