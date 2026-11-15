import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabFlatList } from "../src/components/navigation/TabFlatList";
import {
  AccountFilterBar,
  hasMultipleBanks,
} from "../src/components/transactions/AccountFilterBar";
import { TransactionListIcon } from "../src/components/transactions/TransactionListIcon";
import {
  DocumentActionsMenu,
  type DocumentActionsMenuAction,
} from "../src/components/ui/DocumentActionsMenu";
import { IconButton } from "../src/components/ui/IconButton";
import { Skeleton } from "../src/components/ui/Skeleton";
import { SkeletonRows } from "../src/components/ui/SkeletonGroups";
import {
  ADD_ACCOUNT_HREF,
  accountSetupHref,
} from "../src/features/accounts/account.navigation";
import { colorForAccount, formatAccountHeading } from "../src/features/accounts/account.validation";
import { rowBelongsToWhereBucket } from "../src/features/leaks/leak-where-it-goes";
import {
  categoryName,
  formatTransactionAmount,
  transactionAccountLabel,
} from "../src/features/transactions/transaction.row";
import {
  formatRand,
  summariseTransactionRows,
} from "../src/features/transactions/transaction.totals";
import type { TransactionRow } from "../src/features/transactions/transaction.types";
import { useAccounts } from "../src/hooks/useAccounts";
import { useTransactions } from "../src/hooks/useTransactions";
import { useTransactionTotals } from "../src/hooks/useTransactionTotals";
import { COLORS, TRACEPAY } from "../src/theme/colors";

const TRANSACTIONS_RETURN_TO = "/transactions-list";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type DayHeaderEntry = { kind: "day"; id: string; label: string };
type TxEntry = {
  kind: "tx";
  id: string;
  transaction: TransactionRow;
  isFirst: boolean;
  isLast: boolean;
};
type ListEntry = DayHeaderEntry | TxEntry;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayHeading(dayKey: string, todayKey: string, yesterdayKey: string): string {
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterdayKey) return "Yesterday";
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  const thisYear = Number(todayKey.slice(0, 4));
  const label = `${day} ${MONTHS[month - 1]}`;
  return year === thisYear ? label : `${label} ${year}`;
}

/** Newest-first rows → day headers + transaction rows. */
function buildDatedList(rows: readonly TransactionRow[]): ListEntry[] {
  if (rows.length === 0) return [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = localDayKey(today);
  const yesterdayKey = localDayKey(yesterday);

  const out: ListEntry[] = [];
  let index = 0;
  while (index < rows.length) {
    const dayKey = rows[index]!.date.slice(0, 10);
    let end = index + 1;
    while (end < rows.length && rows[end]!.date.slice(0, 10) === dayKey) end += 1;
    out.push({
      kind: "day",
      id: `day:${dayKey}`,
      label: formatDayHeading(dayKey, todayKey, yesterdayKey),
    });
    for (let cursor = index; cursor < end; cursor += 1) {
      out.push({
        kind: "tx",
        id: rows[cursor]!.id,
        transaction: rows[cursor]!,
        isFirst: cursor === index,
        isLast: cursor === end - 1,
      });
    }
    index = end;
  }
  return out;
}

function rowTitle(transaction: TransactionRow): string {
  return transaction.merchantName?.trim() || transaction.description.trim() || "Transaction";
}

function matchesMerchant(transaction: TransactionRow, merchant: string): boolean {
  const target = merchant.trim().toLowerCase();
  if (!target) return true;
  const merchantName = transaction.merchantName?.trim().toLowerCase() ?? "";
  const description = transaction.description.trim().toLowerCase();
  return merchantName === target || description.includes(target);
}

function splitPipeList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesKeywords(description: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = description.toUpperCase();
  return keywords.some((keyword) => haystack.includes(keyword.toUpperCase()));
}

export default function TransactionsScreen() {
  const params = useLocalSearchParams<{
    category?: string | string[];
    categories?: string | string[];
    merchant?: string | string[];
    excludeCategories?: string | string[];
    q?: string | string[];
    label?: string | string[];
    /** Exclusive fee/airtime bucket, e.g. `fees:monthly` — monthly ≠ service. */
    leakBucket?: string | string[];
  }>();
  const categoryFilter = firstParam(params.category);
  const categoriesFilter = useMemo(() => {
    const fromList = splitPipeList(firstParam(params.categories));
    if (fromList.length > 0) return fromList;
    return categoryFilter ? [categoryFilter] : [];
  }, [params.categories, categoryFilter]);
  const merchantFilter = firstParam(params.merchant);
  const excludeCategories = useMemo(
    () => splitPipeList(firstParam(params.excludeCategories)),
    [params.excludeCategories],
  );
  const keywords = useMemo(() => splitPipeList(firstParam(params.q)), [params.q]);
  const customLabel = firstParam(params.label);
  const leakBucket = useMemo(() => {
    const raw = firstParam(params.leakBucket);
    if (!raw) return null;
    const [leakId, bucketId] = raw.split(":");
    if (!leakId || !bucketId) return null;
    return { leakId, bucketId };
  }, [params.leakBucket]);

  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { accounts } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const {
    transactions,
    loading,
    loadingMore,
    hasMore,
    error,
    retry,
    loadMore,
  } = useTransactions(selectedAccountId);

  const filteredTransactions = useMemo(() => {
    const inCategoryScope = (name: string) => {
      if (categoriesFilter.length === 0) return true;
      return categoriesFilter.some((item) => item.toLowerCase() === name.toLowerCase());
    };

    const narrowed = transactions.filter((row) => {
      const name = categoryName(row);
      if (!inCategoryScope(name)) return false;
      if (excludeCategories.length > 0) {
        const excluded = excludeCategories.some(
          (item) => item.toLowerCase() === name.toLowerCase(),
        );
        if (excluded) return false;
      }
      if (merchantFilter && !matchesMerchant(row, merchantFilter)) {
        return false;
      }
      // Exclusive buckets keep monthly account fees out of service fees (and so on).
      if (leakBucket) {
        return rowBelongsToWhereBucket(leakBucket.leakId, leakBucket.bucketId, row);
      }
      if (keywords.length > 0 && !matchesKeywords(row.description, keywords)) {
        return false;
      }
      return true;
    });

    // If keyword narrowing finds nothing, still show the category so the screen isn't empty.
    if (
      !leakBucket &&
      narrowed.length === 0 &&
      keywords.length > 0 &&
      categoriesFilter.length > 0
    ) {
      return transactions.filter((row) => inCategoryScope(categoryName(row)));
    }

    return narrowed;
  }, [transactions, categoriesFilter, excludeCategories, merchantFilter, keywords, leakBucket]);

  const activeFilterLabel = customLabel
    ? customLabel
    : categoriesFilter.length === 1
      ? categoriesFilter[0]!
      : categoriesFilter.length > 1
        ? categoriesFilter.join(", ")
        : merchantFilter
          ? merchantFilter
          : excludeCategories.length > 0
            ? "Other categories"
            : null;

  const clearFilters = useCallback(() => {
    router.replace("/transactions-list" as never);
  }, []);

  const multiBank = useMemo(() => hasMultipleBanks(accounts), [accounts]);
  const showingAllAccounts = multiBank && selectedAccountId === null;
  const { totals: accountTotals, loading: accountTotalsLoading } =
    useTransactionTotals(selectedAccountId);
  const hasContentFilter = Boolean(
    activeFilterLabel ||
      leakBucket ||
      keywords.length > 0 ||
      categoriesFilter.length > 0 ||
      merchantFilter ||
      excludeCategories.length > 0,
  );
  // When a category / fee / merchant filter is on, totals must match that list —
  // not the whole account. Unfiltered views keep the full-account totals.
  const filteredTotals = useMemo(
    () => summariseTransactionRows(filteredTransactions),
    [filteredTransactions],
  );
  const totals = hasContentFilter ? filteredTotals : accountTotals;
  const totalsLoading = hasContentFilter ? loading : accountTotalsLoading;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const filterLabel = activeFilterLabel
    ? activeFilterLabel
    : selectedAccount
      ? formatAccountHeading(selectedAccount)
      : multiBank
        ? "All accounts"
        : accounts[0]
          ? formatAccountHeading(accounts[0])
          : "Transactions";

  const documentActions = useMemo((): DocumentActionsMenuAction[] => {
    const uploadForAccount = (accountId: string) => {
      router.push(accountSetupHref(accountId, TRANSACTIONS_RETURN_TO) as never);
    };

    if (selectedAccountId) {
      return [
        {
          action: "upload-statement",
          label: "Upload statement",
          callback: () => uploadForAccount(selectedAccountId),
        },
      ];
    }

    if (accounts.length === 0) {
      return [
        {
          action: "upload-statement",
          label: "Upload statement",
          callback: () => router.push(ADD_ACCOUNT_HREF),
        },
      ];
    }

    if (accounts.length === 1) {
      const only = accounts[0]!;
      return [
        {
          action: "upload-statement",
          label: "Upload statement",
          callback: () => uploadForAccount(only.id),
        },
      ];
    }

    return accounts.map((account) => ({
      action: `upload-statement-${account.id}`,
      label: `Upload · ${account.institution?.trim() || account.name}`,
      callback: () => uploadForAccount(account.id),
    }));
  }, [accounts, selectedAccountId]);

  const datedList = useMemo(
    () => buildDatedList(filteredTransactions),
    [filteredTransactions],
  );
  const stickyHeaderIndices = useMemo(
    () =>
      datedList
        .map((entry, index) => (entry.kind === "day" ? index : -1))
        .filter((index) => index >= 0),
    [datedList],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListEntry>) => {
      if (item.kind === "day") {
        return <DayHeader label={item.label} />;
      }
      return (
        <TransactionRowItem
          transaction={item.transaction}
          showBank={showingAllAccounts}
          mutedColor={palette.mutedForeground}
          isFirst={item.isFirst}
          isLast={item.isLast}
        />
      );
    },
    [palette.mutedForeground, showingAllAccounts],
  );

  const keyExtractor = useCallback((item: ListEntry) => item.id, []);

  const listHeader = (
    <View className="px-5 pt-1">
      <View className="flex-row items-start justify-between gap-3">
        <IconButton
          accessibilityLabel="Go back"
          className="mt-1"
          variant="muted"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        >
          <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>
        <View className="min-w-0 flex-1">
          <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
            {activeFilterLabel ?? "Transactions"}
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            {activeFilterLabel
              ? `Showing ${activeFilterLabel.toLowerCase()} from your imported statements.`
              : multiBank
                ? "All of your accounts in one list. Switch to a single account to filter."
                : "Imported from your statements."}
          </Text>
        </View>
        <DocumentActionsMenu
          actions={documentActions}
          foregroundColor={palette.foreground}
          mutedColor={palette.mutedForeground}
          size={40}
        />
      </View>

      <AccountFilterBar
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={setSelectedAccountId}
      />

      {accounts.length > 0 ? (
        <View className="mt-5 rounded-3xl bg-card px-5 py-4">
          <Text className="text-[12px] font-medium text-muted-foreground" numberOfLines={1}>
            {filterLabel}
            {totals ? ` · ${totals.count} transaction${totals.count === 1 ? "" : "s"}` : ""}
          </Text>
          <View className="mt-3 flex-row gap-4">
            <View className="min-w-0 flex-1">
              <Text className="text-[12px] text-muted-foreground">
                {hasContentFilter ? "Spent" : "Total spent"}
              </Text>
              {totalsLoading || !totals ? (
                <View className="mt-1.5">
                  <Skeleton width={96} height={24} radius={8} />
                </View>
              ) : (
                <Text
                  className="mt-0.5 text-[22px] font-bold tracking-[-0.4px] text-foreground"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRand(totals.spent)}
                </Text>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[12px] text-muted-foreground">
                {hasContentFilter ? "Money in" : "Money in"}
              </Text>
              {totalsLoading || !totals ? (
                <View className="mt-1.5">
                  <Skeleton width={96} height={24} radius={8} />
                </View>
              ) : (
                <Text
                  className="mt-0.5 text-[22px] font-bold tracking-[-0.4px] text-green-600"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRand(totals.income)}
                </Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      <View className="mb-3 mt-7 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          {activeFilterLabel
            ? activeFilterLabel
            : showingAllAccounts
              ? "Recent across accounts"
              : "Recent transactions"}
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          {filteredTransactions.length} shown
          {hasMore ? "+" : ""}
        </Text>
      </View>

      {loading ? (
        <View className="mb-4">
          <SkeletonRows count={6} />
        </View>
      ) : error && transactions.length === 0 ? (
        <View className="mb-4 rounded-3xl bg-destructive/10 px-4 py-6">
          <Text className="text-[14px] text-destructive">{error}</Text>
          <Pressable
            accessibilityRole="button"
            className="mt-3 self-start active:opacity-70"
            onPress={retry}
          >
            <Text className="text-[14px] font-semibold text-foreground">Try again</Text>
          </Pressable>
        </View>
      ) : !loading && filteredTransactions.length === 0 ? (
        <View className="mb-4 rounded-3xl bg-card px-4 py-6">
          <Text className="text-[14px] leading-6 text-muted-foreground">
            {activeFilterLabel
              ? `No ${activeFilterLabel.toLowerCase()} transactions in the loaded statements yet. Scroll may load older ones, or clear the filter.`
              : "Imported transactions will appear here. Use the documents menu to upload a statement."}
          </Text>
          {activeFilterLabel ? (
            <Pressable
              accessibilityRole="button"
              className="mt-3 self-start active:opacity-70"
              onPress={clearFilters}
            >
              <Text className="text-[14px] font-semibold text-foreground">Show all transactions</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const listFooter =
    loadingMore || (hasMore && transactions.length > 0) ? (
      <View className="items-center px-5 py-5">
        {loadingMore ? (
          <>
            <ActivityIndicator color={trace.primary} />
            <Text className="mt-2 text-[12px] text-muted-foreground">Loading more…</Text>
          </>
        ) : null}
      </View>
    ) : (
      <View className="h-8" />
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabFlatList
        className="flex-1"
        data={loading && datedList.length === 0 ? [] : datedList}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        stickyHeaderIndices={stickyHeaderIndices}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (!loading && hasMore) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.4}
        initialNumToRender={24}
        maxToRenderPerBatch={32}
        windowSize={11}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <View className="bg-background px-5 pb-2 pt-4">
      <Text className="text-[13px] font-bold tracking-[-0.2px] text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

const TransactionRowItem = memo(function TransactionRowItem({
  transaction,
  showBank,
  mutedColor,
  isFirst,
  isLast,
}: {
  transaction: TransactionRow;
  showBank: boolean;
  mutedColor: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const category = categoryName(transaction);
  const title = rowTitle(transaction);
  const bankLabel = showBank ? transactionAccountLabel(transaction) : null;
  const bankColor =
    showBank && transaction.account ? colorForAccount(transaction.account) : mutedColor;

  const radiusClass =
    isFirst && isLast
      ? "rounded-3xl"
      : isFirst
        ? "rounded-t-3xl"
        : isLast
          ? "rounded-b-3xl"
          : "";

  return (
    <View className="px-5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${formatTransactionAmount(transaction)}, ${category}`}
        className={`flex-row items-center gap-3.5 bg-card px-4 py-3.5 active:opacity-70 ${radiusClass} ${
          isLast ? "" : "border-b border-border/35"
        }`}
        onPress={() => router.push(`/transactions/${transaction.id}`)}
      >
        <TransactionListIcon
          description={transaction.description}
          category={category}
          merchantName={transaction.merchantName}
          transactionClass={transaction.transaction_class}
          type={transaction.type}
          accountInstitution={transaction.account?.institution ?? null}
          size={40}
        />
        <View className="min-w-0 flex-1 pr-2">
          <Text className="text-[16px] font-semibold leading-5 text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="mt-1 text-[13px] leading-4 text-muted-foreground" numberOfLines={1}>
            {category}
            {bankLabel ? <Text style={{ color: bankColor }}>{` · ${bankLabel}`}</Text> : null}
          </Text>
        </View>
        <Text
          className={`min-w-[88px] text-right text-[16px] font-bold leading-5 ${
            transaction.type === "credit" ? "text-green-600" : "text-foreground"
          }`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatTransactionAmount(transaction)}
        </Text>
      </Pressable>
    </View>
  );
});
