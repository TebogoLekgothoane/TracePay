import { router } from "expo-router";
import {
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Coins,
  Repeat2,
  ShoppingBag,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import {
  buildSpendingPatterns,
  type SpendingPatternInsight,
} from "../../features/insights/spending-patterns";
import type { TransactionRow } from "../../features/transactions/transaction.types";
import { COLORS, withAlpha } from "../../theme/colors";

const patternIcons = [CircleAlert, Coins, Repeat2, ShoppingBag] as const;

export function SpendingPatternsSection() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const patterns = buildSpendingPatterns(DEMO_TRANSACTIONS);

  return (
    <View className="mt-8">
      <View className="mb-1 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[17px] font-bold text-foreground">
            Your Spending Patterns
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Clear signals from your recent transactions.
          </Text>
        </View>
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
        >
          <BarChart3 color={palette.primary} size={19} strokeWidth={2.2} />
        </View>
      </View>
      <View className="mt-3 self-start rounded-full bg-muted px-3 py-1.5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.8px] text-muted-foreground">
          Demo data
        </Text>
      </View>

      <TodaySummary patterns={patterns} palette={palette} />
      <View className="mt-3 gap-3">
        {patterns.insights.map((insight, index) => (
          <PatternCard
            key={insight.id}
            insight={insight}
            icon={patternIcons[index % patternIcons.length]}
            palette={palette}
          />
        ))}
      </View>
    </View>
  );
}

const DEMO_TRANSACTIONS = createDemoTransactions();

function createDemoTransactions(): TransactionRow[] {
  const rows: TransactionRow[] = [
    demoRow("takeaway-today", 320, 0, "Fast Food", "Takeaway"),
    demoRow("alcohol-today", 689.99, 0, "Alcohol", "Liquor store"),
    demoRow("airtime-today-1", 50, 0, "Airtime", "Airtime"),
    demoRow("airtime-today-2", 50, 0, "Airtime", "Airtime"),
  ];

  for (let index = 0; index < 8; index += 1) {
    rows.push(
      demoRow(
        `uber-${index}`,
        155,
        index % 6,
        "Ride Hailing",
        "Uber",
      ),
    );
  }

  for (let index = 0; index < 18; index += 1) {
    rows.push(
      demoRow(
        `small-${index}`,
        index % 3 === 0 ? 40 : 35,
        index % 7,
        "Shopping",
        "Small purchase",
      ),
    );
  }

  for (let index = 0; index < 10; index += 1) {
    rows.push(
      demoRow(
        `baseline-${index}`,
        180,
        10 + index,
        "Groceries",
        "Groceries",
      ),
    );
  }

  return rows;
}

function demoRow(
  id: string,
  amount: number,
  daysAgo: number,
  category: string,
  merchant: string,
): TransactionRow {
  return {
    id,
    date: dateDaysAgo(new Date(), daysAgo),
    description: merchant,
    amount: String(amount),
    type: "debit",
    balance: daysAgo,
    currency: "ZAR",
    account_id: "demo-account",
    statement_id: "demo-statement",
    source: "statement",
    transaction_class: "spending",
    is_duplicate: false,
    category_id: category.toLowerCase().replace(/\s+/g, "-"),
    category_source: "automatic",
    merchantName: merchant,
    categories: { name: category },
    account: null,
    occurredAt: null,
  };
}

function dateDaysAgo(date: Date, daysAgo: number): string {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - daysAgo);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TodaySummary({
  patterns,
  palette,
}: {
  patterns: ReturnType<typeof buildSpendingPatterns>;
  palette: typeof COLORS.light | typeof COLORS.dark;
}) {
  return (
    <View className="mt-4 rounded-3xl border border-border/60 bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[13px] font-medium text-muted-foreground">
            Today’s spending
          </Text>
          <Text className="mt-1 text-[26px] font-bold tracking-[-0.4px] text-foreground">
            {formatRand(patterns.todayTotal)}
          </Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            {patterns.todayCount === 0
              ? "No spending recorded today"
              : `${patterns.todayCount} ${patterns.todayCount === 1 ? "payment" : "payments"} recorded`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View today's transactions"
          className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-2 active:opacity-70"
          onPress={() => router.push("/(tabs)/transactions")}
        >
          <Text className="text-[12px] font-semibold text-foreground">View</Text>
          <ArrowUpRight color={palette.foreground} size={14} strokeWidth={2.2} />
        </Pressable>
      </View>

      {patterns.todayCategories.length > 0 ? (
        <View className="mt-4 gap-2 border-t border-border/60 pt-3">
          {patterns.todayCategories.slice(0, 4).map((category) => (
            <View key={category.name} className="flex-row items-center justify-between">
              <Text className="text-[13px] text-muted-foreground">{category.name}</Text>
              <Text className="text-[13px] font-semibold text-foreground">
                {formatRand(category.amount)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PatternCard({
  insight,
  icon: Icon,
  palette,
}: {
  insight: SpendingPatternInsight;
  icon: (typeof patternIcons)[number];
  palette: typeof COLORS.light | typeof COLORS.dark;
}) {
  return (
    <View className="rounded-3xl border border-border/60 bg-card p-4">
      <View className="flex-row items-start gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(palette.accent, 0.12) }}
        >
          <Icon color={palette.accent} size={18} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-foreground">
            {insight.title}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {insight.detail}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 self-start active:opacity-70"
            onPress={() => router.push("/(tabs)/transactions")}
          >
            <Text className="text-[13px] font-semibold text-primary">{insight.action}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatRand(value: number): string {
  return `R${value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
