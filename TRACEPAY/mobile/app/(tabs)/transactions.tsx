import { router } from "expo-router";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Info,
  Upload,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { AccountFilterBar } from "../../src/components/transactions/AccountFilterBar";
import { TransactionListIcon } from "../../src/components/transactions/TransactionListIcon";
import { Button } from "../../src/components/ui/Button";
import { ADD_ACCOUNT_HREF } from "../../src/features/accounts/account.navigation";
import {
  categoryName,
  formatTransactionAmount,
  transactionAccountLabel,
} from "../../src/features/transactions/transaction.service";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useTransactions } from "../../src/hooks/useTransactions";
import { COLORS, TRACEPAY } from "../../src/theme/colors";

export default function TransactionsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { accounts } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { transactions, loading, error, retry } = useTransactions(selectedAccountId);

  const openImport = () => router.push(ADD_ACCOUNT_HREF);
  const showingAllAccounts = selectedAccountId === null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <TabScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <Text className="text-[30px] font-bold tracking-[-0.6px] text-foreground">
            Transactions
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            All of your accounts in one list. Switch to a single account to filter.
          </Text>

          <AccountFilterBar
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelect={setSelectedAccountId}
          />

          <View className="mt-5 rounded-3xl border border-border/60 bg-card p-5">
            <Text className="text-[20px] font-bold text-foreground">
              Upload a bank statement
            </Text>
            <Text className="mt-2 text-[14px] leading-6 text-muted-foreground">
              Upload a PDF statement and let TracePay extract and categorise
              your transactions.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose PDF file"
              className="mt-4 items-center rounded-2xl border border-dashed border-primary/35 px-4 py-7 active:opacity-80"
              onPress={openImport}
              style={{ backgroundColor: palette.muted }}
            >
              <FileText color={palette.foreground} size={36} strokeWidth={1.8} />
              <Text className="mt-3 text-[15px] font-bold text-foreground">
                Drag and drop your PDF here
              </Text>
              <Text className="mt-1 text-[13px] text-muted-foreground">
                or click to browse
              </Text>
            </Pressable>

            <View
              className="mt-4 flex-row gap-3 rounded-2xl px-4 py-3.5"
              style={{ backgroundColor: palette.muted }}
            >
              <Info
                color={palette.foreground}
                size={18}
                strokeWidth={2.2}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-foreground">
                  PDF statements only
                </Text>
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  Maximum file size: 20 MB
                </Text>
                <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  Supported banks: Standard Bank, Capitec, FNB, Absa, Nedbank,
                  TymeBank and more.
                </Text>
              </View>
            </View>

            <Button className="mt-5" onPress={openImport} size="md">
              <>
                <Upload color={COLORS.white} size={18} strokeWidth={2.4} />
                <Text className="text-[15px] font-semibold text-primary-foreground">
                  Choose PDF file
                </Text>
              </>
            </Button>

            <View className="mt-3 flex-row items-center justify-center gap-1.5">
              <CheckCircle2 color="#22C55E" size={14} strokeWidth={2.4} />
              <Text className="text-[12px] text-muted-foreground">
                Your data is secure and private
              </Text>
            </View>
          </View>

          <View className="mt-7">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[17px] font-bold text-foreground">
                {showingAllAccounts ? "Recent across accounts" : "Imported transactions"}
              </Text>
              <Text className="text-[12px] text-muted-foreground">
                {transactions.length} loaded
              </Text>
            </View>

            {loading ? (
              <View className="items-center rounded-3xl border border-border/60 bg-card px-4 py-8">
                <ActivityIndicator color={trace.primary} />
                <Text className="mt-3 text-[13px] text-muted-foreground">
                  Loading transactions…
                </Text>
              </View>
            ) : error ? (
              <View className="rounded-3xl bg-destructive/10 px-4 py-6">
                <Text className="text-[14px] text-destructive">{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 self-start active:opacity-70"
                  onPress={retry}
                >
                  <Text className="text-[14px] font-semibold text-foreground">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : transactions.length === 0 ? (
              <View className="rounded-3xl border border-border/60 bg-card px-4 py-6">
                <Text className="text-[14px] leading-6 text-muted-foreground">
                  Imported transactions will appear here.
                </Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-3xl border border-border/60 bg-card">
                {transactions.map((transaction, index) => {
                  const category = categoryName(transaction);
                  return (
                    <Pressable
                      key={transaction.id}
                      accessibilityRole="button"
                      className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-70 ${
                        index < transactions.length - 1
                          ? "border-b border-border/40"
                          : ""
                      }`}
                      onPress={() =>
                        router.push(`/transactions/${transaction.id}`)
                      }
                    >
                      <TransactionListIcon
                        description={transaction.description}
                        category={category}
                      />
                      <View className="min-w-0 flex-1">
                        <Text className="text-[12px] text-muted-foreground">
                          {transaction.date}
                        </Text>
                        <Text
                          className="mt-0.5 text-[15px] font-semibold text-foreground"
                          numberOfLines={1}
                        >
                          {transaction.description}
                        </Text>
                        <Text className="mt-0.5 text-[12px] text-muted-foreground">
                          {category}
                          {showingAllAccounts
                            ? ` · ${transactionAccountLabel(transaction)}`
                            : ""}
                        </Text>
                      </View>
                      <Text
                        className={`text-[15px] font-bold ${
                          transaction.type === "debit"
                            ? "text-destructive"
                            : "text-green-600"
                        }`}
                      >
                        {formatTransactionAmount(transaction)}
                      </Text>
                      <ChevronRight
                        color={palette.mutedForeground}
                        size={18}
                        strokeWidth={2}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
