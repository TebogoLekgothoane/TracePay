import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { router, Stack } from "expo-router";
import { useIngestion } from "@/context/SMSIngestionContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ParsedTransaction, TransactionCategory } from "@/services/sms/sms.types";
import { cn } from "@/lib/cn";
import { getTransactionHeadline, getTransactionSummary } from "@/lib/transaction-display";
import {
  DATE_RANGE_OPTIONS,
  DateRangeFilter,
  filterTransactionsByDateRange,
} from "@/lib/transaction-filters";

type ListItem =
  | { type: "header"; key: string; label: string }
  | { type: "transaction"; key: string; tx: ParsedTransaction };

const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  groceries:     "cart-outline",
  fuel:          "gas-station-outline",
  dining:        "food-outline",
  entertainment: "television-play",
  utilities:     "lightning-bolt-outline",
  transfer:      "bank-transfer",
  atm:           "cash",
  online:        "web",
  medical:       "hospital-box-outline",
  other:         "dots-horizontal",
};

function formatDateLabel(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = now.getTime() - d.getTime();
  if (diff === 0) return "TODAY";
  if (diff === 86_400_000) return "YESTERDAY";
  return date.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).toUpperCase();
}

function buildListItems(transactions: ParsedTransaction[], search: string): ListItem[] {
  const filtered = search
    ? transactions.filter(
        (tx) => {
          const headline = getTransactionHeadline(tx).toLowerCase();
          const summary = getTransactionSummary(tx).toLowerCase();
          const q = search.toLowerCase();
          return (
            headline.includes(q) ||
            summary.includes(q) ||
            tx.bank.toLowerCase().includes(q) ||
            tx.category.toLowerCase().includes(q)
          );
        },
      )
    : transactions;

  const items: ListItem[] = [];
  let lastLabel = "";

  for (const tx of filtered) {
    const label = formatDateLabel(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp));
    if (label !== lastLabel) {
      items.push({ type: "header", key: `header-${label}-${tx.id}`, label });
      lastLabel = label;
    }
    items.push({ type: "transaction", key: tx.id, tx });
  }

  return items;
}

export default function HistoryScreen() {
  const { contentPadding } = useScreenInsets("compact");
  const { colors } = useColorScheme();
  const [search, setSearch] = useState("");
  const [showLeaksOnly, setShowLeaksOnly] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeFilter>("all");

  const { transactions, startListening, stopListening, isLoading, state } = useIngestion();

  useEffect(() => {
    startListening();
    return () => stopListening();
  }, [startListening, stopListening]);

  const filtered = useMemo(() => {
    let result = filterTransactionsByDateRange(transactions, dateRange);
    if (showLeaksOnly) {
      result = result.filter((tx) => tx.type === "debit");
    }
    return result;
  }, [transactions, dateRange, showLeaksOnly]);

  const listItems = buildListItems(filtered, search);
  const hasActiveFilters = dateRange !== "all" || showLeaksOnly || search.length > 0;

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return (
        <Text className="text-[11px] font-semibold text-gray-500 tracking-wide uppercase mb-2.5 mt-1">
          {item.label}
        </Text>
      );
    }

    const { tx } = item;
    const isDebit = tx.type === "debit";

    return (
      <View className="card-row">
        <View
          className={cn(
            "w-[38px] h-[38px] rounded-[10px] items-center justify-center mr-3",
            isDebit ? "bg-red-100" : "bg-green-100",
          )}
        >
          <MaterialCommunityIcons
            name={CATEGORY_ICONS[tx.category] as any}
            size={16}
            color={isDebit ? "#DC2626" : "#16A34A"}
          />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="list-row-title mb-0.5" numberOfLines={1}>
            {getTransactionHeadline(tx)}
          </Text>
          <Text className="text-xs font-sans text-gray-500 mb-1.5" numberOfLines={2}>
            {getTransactionSummary(tx)}
          </Text>
          <View className="flex-row gap-1.5 flex-wrap">
            <View className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
              <Text className="text-[11px] font-medium text-subtle">{tx.bank}</Text>
            </View>
            <View className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
              <Text className="text-[11px] font-medium text-subtle">{tx.category}</Text>
            </View>
            {tx.confidence === "low" && (
              <View className="bg-yellow-100 px-2 py-0.5 rounded-md">
                <Text className="text-[11px] font-medium text-yellow-800">low confidence</Text>
              </View>
            )}
          </View>
        </View>
        <View className="items-end gap-0.5">
          <Text className={cn("text-sm font-bold", isDebit ? "text-red-600" : "text-green-600")}>
            {isDebit ? "-" : "+"}R{tx.amount.toFixed(2)}
          </Text>
          <Text className="text-[11px] font-sans text-gray-400">
            {(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp)).toLocaleTimeString("en-ZA", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  const ListHeaderComponent = (
    <>
      <View className="flex-row items-start mb-[18px] gap-3">
        <Button
          variant="outline"
          size="icon"
          onPress={() => router.back()}
          className="back-btn mt-0.5"
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Button>
        <View className="flex-1">
          <Text className="page-header-title mb-0.5">Transaction History</Text>
          <Text className="text-sm font-sans text-gray-500">
            {state.isListening ? "Live" : "Paused"} · {filtered.length} of {state.totalIngested} shown
          </Text>
        </View>
        {state.isListening && (
          <View className="flex-row items-center gap-1.5 bg-green-100 px-2.5 py-1.5 rounded-full self-start">
            <View className="w-[7px] h-[7px] rounded-full bg-green-600" />
            <Text className="text-[11px] font-bold text-green-600">LIVE</Text>
          </View>
        )}
      </View>

      <View className="flex-row gap-2.5 mb-3">
        <View className="search-bar">
          <View className="mr-2">
            <Feather name="search" size={16} color={colors.mutedForeground} />
          </View>
          <TextInput
            className="flex-1 text-sm font-sans text-strong"
            placeholder="Search merchant, bank, category…"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Button
          variant="outline"
          size="icon"
          className={cn(showLeaksOnly && "bg-red-100")}
          onPress={() => setShowLeaksOnly((v) => !v)}
        >
          <Feather name="arrow-down-circle" size={18} color={showLeaksOnly ? "#DC2626" : "#6B7280"} />
        </Button>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-5"
        contentContainerClassName="px-[18px] gap-2"
      >
        {DATE_RANGE_OPTIONS.map((option) => {
          const active = dateRange === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setDateRange(option.id)}
              className={cn(
                "px-3.5 py-2 rounded-full border",
                active ? "filter-chip-active" : "filter-chip",
              )}
            >
              <Text
                className={cn(
                  "text-[13px] font-semibold",
                  active ? "text-white" : "text-subtle",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );

  const ListEmptyComponent = isLoading ? (
    <View className="items-center py-[60px] gap-3.5">
      <ActivityIndicator size="large" color="#7C3AED" />
      <Text className="text-sm font-sans text-gray-400 text-center leading-5">Loading transactions…</Text>
    </View>
  ) : (
    <View className="items-center py-[60px] gap-3.5">
      <MaterialCommunityIcons name="message-text-outline" size={40} color="#D1D5DB" />
      <Text className="text-sm font-sans text-gray-400 text-center leading-5">
        {hasActiveFilters
          ? "No transactions match your filters.\nTry a wider date range or clear search."
          : "No transactions yet.\nOpen the SMS scanner to import."}
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        className="screen"
        contentContainerClassName="screen-content"
        contentContainerStyle={contentPadding}
        data={listItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
    </>
  );
}
