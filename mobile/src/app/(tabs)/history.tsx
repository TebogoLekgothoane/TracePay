import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GlassInput } from "@/components/GlassInput";
import { ScreenFrame } from "@/components/Screen";
import { AppText } from "@/components/Typography";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { router } from "expo-router";
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
  groceries: "cart-outline",
  fuel: "gas-station-outline",
  dining: "food-outline",
  entertainment: "television-play",
  utilities: "lightning-bolt-outline",
  transfer: "bank-transfer",
  atm: "cash",
  online: "web",
  medical: "hospital-box-outline",
  other: "dots-horizontal",
};

function formatDateLabel(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = now.getTime() - d.getTime();
  if (diff === 0) return "Today";
  if (diff === 86_400_000) return "Yesterday";
  return date.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function buildListItems(transactions: ParsedTransaction[], search: string): ListItem[] {
  const filtered = search
    ? transactions.filter((tx) => {
        const headline = getTransactionHeadline(tx).toLowerCase();
        const summary = getTransactionSummary(tx).toLowerCase();
        const q = search.toLowerCase();
        return (
          headline.includes(q) ||
          summary.includes(q) ||
          tx.bank.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q)
        );
      })
    : transactions;

  const items: ListItem[] = [];
  let lastLabel = "";

  for (const tx of filtered) {
    const label = formatDateLabel(
      tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp),
    );
    if (label !== lastLabel) {
      items.push({ type: "header", key: `header-${label}-${tx.id}`, label });
      lastLabel = label;
    }
    items.push({ type: "transaction", key: tx.id, tx });
  }

  return items;
}

export default function HistoryScreen() {
  const { contentPadding } = useScreenInsets("tab");
  const { colors, isDarkColorScheme } = useColorScheme();
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

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return (
          <AppText variant="overline" className="mb-2.5 mt-3">
            {item.label}
          </AppText>
        );
      }

      const { tx } = item;
      const isDebit = tx.type === "debit";

      return (
        <Card className="mb-2.5" contentClassName="flex-row items-start gap-3">
          <View
            className={cn(
              "h-10 w-10 items-center justify-center rounded-xl",
              isDebit ? "bg-red-100 dark:bg-red-900/40" : "bg-green-100 dark:bg-green-900/40",
            )}
          >
            <MaterialCommunityIcons
              name={CATEGORY_ICONS[tx.category] as any}
              size={18}
              color={isDebit ? colors.destructive : colors.success}
            />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="title" numberOfLines={1}>
              {getTransactionHeadline(tx)}
            </AppText>
            <AppText variant="bodySm" className="mt-0.5" numberOfLines={2}>
              {getTransactionSummary(tx)}
            </AppText>
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              <View className="rounded-md bg-muted px-2 py-0.5 dark:bg-white/10">
                <AppText variant="caption">{tx.bank}</AppText>
              </View>
              <View className="rounded-md bg-muted px-2 py-0.5 dark:bg-white/10">
                <AppText variant="caption">{tx.category}</AppText>
              </View>
              {tx.confidence === "low" ? (
                <View className="rounded-md bg-yellow-100 px-2 py-0.5 dark:bg-yellow-900/40">
                  <AppText variant="caption" className="text-yellow-800 dark:text-yellow-400">
                    low confidence
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
          <View className="items-end gap-0.5">
            <AppText
              variant="label"
              className={cn(
                isDebit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
              )}
            >
              {isDebit ? "-" : "+"}R{tx.amount.toFixed(2)}
            </AppText>
            <AppText variant="caption">
              {(tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp)).toLocaleTimeString(
                "en-ZA",
                { hour: "2-digit", minute: "2-digit" },
              )}
            </AppText>
          </View>
        </Card>
      );
    },
    [colors.destructive, colors.success],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  const ListHeaderComponent = (
    <>
      <View className="mb-6 flex-row items-start gap-3">
        <Button
          variant="outline"
          size="icon"
          onPress={() => router.back()}
          className="back-btn"
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Button>
        <View className="min-w-0 flex-1">
          <AppText variant="titleLg">Transaction History</AppText>
          <AppText variant="bodySm" className="mt-0.5">
            {state.isListening ? "Live" : "Paused"} · {filtered.length} of {state.totalIngested} shown
          </AppText>
        </View>
        {state.isListening ? (
          <View className="badge-success flex-row items-center self-start gap-1.5 py-1.5">
            <View className="h-[7px] w-[7px] rounded-full bg-green-600 dark:bg-green-400" />
            <AppText variant="caption" className="font-bold text-green-600 dark:text-green-400">
              LIVE
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="mb-4 flex-row gap-2.5">
        <GlassInput className="flex-1">
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            className="flex-1 text-sm font-sans text-foreground"
            placeholder="Search merchant, bank, category…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </GlassInput>
        <Button
          variant="outline"
          size="icon"
          className={cn(showLeaksOnly && "bg-red-100 dark:bg-red-900/40")}
          onPress={() => setShowLeaksOnly((v) => !v)}
        >
          <Feather
            name="arrow-down-circle"
            size={18}
            color={showLeaksOnly ? colors.destructive : colors.mutedForeground}
          />
        </Button>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-[18px] mb-5"
        contentContainerClassName="gap-2 px-[18px]"
      >
        {DATE_RANGE_OPTIONS.map((option) => {
          const active = dateRange === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setDateRange(option.id)}
              className={cn(
                "rounded-full border px-3.5 py-2",
                active ? "filter-chip-active" : "filter-chip",
              )}
            >
              <AppText
                variant="label"
                className={cn(active ? "text-white" : "text-secondary-foreground")}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );

  const ListEmptyComponent = isLoading ? (
    <View className="items-center gap-4 py-16">
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="bodyMuted">Loading transactions…</AppText>
    </View>
  ) : (
    <View className="items-center gap-4 py-16">
      <MaterialCommunityIcons name="message-text-outline" size={40} color={colors.mutedForeground} />
      <AppText variant="bodyMuted" className="text-center leading-6">
        {hasActiveFilters
          ? "No transactions match your filters.\nTry a wider date range or clear search."
          : "No transactions yet.\nOpen the SMS scanner to import."}
      </AppText>
    </View>
  );

  return (
    <ScreenFrame>
      <FlatList
        className="flex-1 bg-transparent"
        style={isDarkColorScheme ? { backgroundColor: "transparent" } : undefined}
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
    </ScreenFrame>
  );
}
