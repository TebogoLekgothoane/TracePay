import { router, useFocusEffect } from "expo-router";
import { FileText, Upload } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { useAccounts } from "../../src/hooks/useAccounts";
import { getSupabase } from "../../src/lib/supabase";
import { TRACEPAY, withAlpha } from "../../src/theme/colors";

type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
  balance: number | string | null;
  currency: string | null;
};

export default function TransactionsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const trace = TRACEPAY[scheme];
  const { accounts, loading } = useAccounts();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setTransactionsLoading(true);
      void getSupabase()
        .from("transactions")
        .select("id,date,description,amount,type,balance,currency")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            setTransactionsError("Could not load your imported transactions.");
            setTransactions([]);
          } else {
            setTransactionsError(null);
            const sorted = [...((data ?? []) as TransactionRow[])].sort((left, right) => {
              const dateDifference = right.date.localeCompare(left.date);
              return dateDifference !== 0 ? dateDifference : right.id.localeCompare(left.id);
            });
            setTransactions(sorted);
          }
          setTransactionsLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

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
            Import a PDF bank statement to add transactions to TracePay.
          </Text>

          <View className="mt-5 rounded-3xl bg-card p-5">
            <View
              className="mb-4 h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: withAlpha(trace.primary, 0.14) }}
            >
              <FileText color={trace.primary} size={22} strokeWidth={2.2} />
            </View>
            <Text className="text-[20px] font-bold text-foreground">
              Upload a bank statement
            </Text>
            <Text className="mt-2 text-[14px] leading-6 text-muted-foreground">
              Upload a PDF statement and let TracePay extract the transaction rows.
            </Text>

            <View className="mt-4 gap-1 rounded-2xl bg-muted p-4">
              <Text className="text-[13px] font-semibold text-foreground">PDF statements only</Text>
              <Text className="text-[13px] text-muted-foreground">Maximum file size: 20 MB</Text>
            </View>

            <Button
              className="mt-5"
              gradient
              onPress={() => router.push("/transactions/import")}
              size="md"
            >
              <>
                <Upload color={trace.primaryForeground} size={18} strokeWidth={2.4} />
                <Text className="text-[15px] font-semibold text-primary-foreground">
                  Import PDF
                </Text>
              </>
            </Button>

            <Text className="mt-3 text-center text-[12px] text-muted-foreground">
              {loading
                ? "Loading accounts…"
                : accounts.length === 0
                  ? "No statements imported yet."
                  : `${accounts.length} bank${accounts.length === 1 ? "" : "s"} linked.`}
            </Text>
          </View>

          <View className="mt-7">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[17px] font-bold text-foreground">Imported transactions</Text>
              <Text className="text-[12px] text-muted-foreground">{transactions.length} loaded</Text>
            </View>
            {transactionsLoading ? (
              <View className="items-center rounded-3xl bg-card px-4 py-8">
                <ActivityIndicator color={trace.primary} />
                <Text className="mt-3 text-[13px] text-muted-foreground">Loading transactions…</Text>
              </View>
            ) : transactionsError ? (
              <View className="rounded-3xl bg-destructive/10 px-4 py-6">
                <Text className="text-[14px] text-destructive">{transactionsError}</Text>
              </View>
            ) : transactions.length === 0 ? (
              <View className="rounded-3xl bg-card px-4 py-6">
                <Text className="text-[14px] leading-6 text-muted-foreground">Imported transactions will appear here.</Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-3xl bg-card">
                {transactions.map((transaction, index) => (
                  <View key={transaction.id} className={`px-4 py-4 ${index < transactions.length - 1 ? "border-b border-border/40" : ""}`}>
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-[12px] text-muted-foreground">{transaction.date}</Text>
                        <Text className="mt-1 text-[15px] font-semibold text-foreground" numberOfLines={1}>{transaction.description}</Text>
                      </View>
                      <Text className={`text-[15px] font-bold ${transaction.type === "debit" ? "text-destructive" : "text-green-600"}`}>
                        {transaction.type === "debit" ? "-" : "+"}{transaction.currency === "ZAR" || !transaction.currency ? "R" : `${transaction.currency} `}{Math.abs(Number(transaction.amount)).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
