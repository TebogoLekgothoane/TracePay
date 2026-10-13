import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabFlatList } from "../../src/components/navigation/TabFlatList";
import { AccountFilterBar } from "../../src/components/transactions/AccountFilterBar";
import { TransactionListIcon } from "../../src/components/transactions/TransactionListIcon";
import {
  DocumentActionsMenu,
  type DocumentActionsMenuAction,
} from "../../src/components/ui/DocumentActionsMenu";
import {
  ADD_ACCOUNT_HREF,
  accountSetupHref,
} from "../../src/features/accounts/account.navigation";
import { colorForAccount } from "../../src/features/accounts/account.validation";
import {
  categoryName,
  formatTransactionAmount,
  transactionAccountLabel,
} from "../../src/features/transactions/transaction.service";
import type { TransactionRow } from "../../src/features/transactions/transaction.types";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useTransactions } from "../../src/hooks/useTransactions";
import { COLORS, TRACEPAY } from "../../src/theme/colors";

const TRANSACTIONS_RETURN_TO = "/(tabs)/transactions";

export default function TransactionsScreen() {
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

  const showingAllAccounts = selectedAccountId === null;

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

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TransactionRow>) => (
      <TransactionRowItem
        transaction={item}
        showBank={showingAllAccounts}
        showDivider={index < transactions.length - 1}
        mutedColor={palette.mutedForeground}
        isFirst={index === 0}
        isLast={index === transactions.length - 1}
      />
    ),
    [palette.mutedForeground, showingAllAccounts, transactions.length],
  );

  const keyExtractor = useCallback((item: TransactionRow) => item.id, []);

  const listHeader = (
    <View className="px-5 pt-1">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
            Transactions
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            All of your accounts in one list. Switch to a single account to filter.
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

      <View className="mb-3 mt-7 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          {showingAllAccounts ? "Recent across accounts" : "Imported transactions"}
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          {transactions.length} loaded
          {hasMore ? "+" : ""}
        </Text>
      </View>

      {loading ? (
        <View className="mb-4 items-center rounded-3xl border border-border/60 bg-card px-4 py-8">
          <ActivityIndicator color={trace.primary} />
          <Text className="mt-3 text-[13px] text-muted-foreground">
            Loading transactions…
          </Text>
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
      ) : !loading && transactions.length === 0 ? (
        <View className="mb-4 rounded-3xl border border-border/60 bg-card px-4 py-6">
          <Text className="text-[14px] leading-6 text-muted-foreground">
            Imported transactions will appear here. Use the documents menu to upload a
            statement.
          </Text>
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
        data={loading && transactions.length === 0 ? [] : transactions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
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

function TransactionRowItem({
  transaction,
  showBank,
  showDivider,
  mutedColor,
  isFirst,
  isLast,
}: {
  transaction: TransactionRow;
  showBank: boolean;
  showDivider: boolean;
  mutedColor: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const category = categoryName(transaction);
  const bankLabel = showBank ? transactionAccountLabel(transaction) : null;
  const bankColor =
    showBank && transaction.account
      ? colorForAccount(transaction.account)
      : mutedColor;

  const radiusClass = isFirst && isLast
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
        className={`flex-row items-center gap-3 border-x border-border/60 bg-card px-4 py-3.5 active:opacity-70 ${radiusClass} ${
          isFirst ? "border-t border-border/60" : ""
        } ${isLast ? "border-b border-border/60" : ""} ${
          showDivider ? "border-b border-border/40" : ""
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
        />
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] text-muted-foreground">{transaction.date}</Text>
          <Text
            className="mt-0.5 text-[15px] font-semibold text-foreground"
            numberOfLines={1}
          >
            {transaction.description}
          </Text>
          <View className="mt-0.5 flex-row flex-wrap items-center">
            <Text className="text-[12px] text-muted-foreground">{category}</Text>
            {bankLabel ? (
              <>
                <Text className="text-[12px] text-muted-foreground"> · </Text>
                <Text className="text-[12px] font-semibold" style={{ color: bankColor }}>
                  {bankLabel}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <Text
          className={`text-[15px] font-bold ${
            transaction.type === "debit" ? "text-destructive" : "text-green-600"
          }`}
        >
          {formatTransactionAmount(transaction)}
        </Text>
        <ChevronRight color={mutedColor} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
