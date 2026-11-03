import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "../../src/components/ui/ScreenHeader";

import {
  categoryName,
  formatTransactionAmount,
  getTransactionById,
  transactionAccountLabel,
} from "../../src/features/transactions/transaction.service";
import type { TransactionRow } from "../../src/features/transactions/transaction.types";
import { COLORS } from "../../src/theme/colors";

export default function TransactionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [transaction, setTransaction] = useState<TransactionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      setError("This transaction could not be found.");
      return;
    }
    setLoading(true);
    void getTransactionById(id)
      .then((row) => {
        if (!active) return;
        setTransaction(row);
        setError(row ? null : "This transaction could not be found.");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setTransaction(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load this transaction.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const category = transaction ? categoryName(transaction) : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-1">
        <ScreenHeader
          title={transaction && !loading && !error ? transaction.description : "Transaction"}
          subtitle={transaction && !loading && !error ? transaction.date : undefined}
        />

        {loading ? (
          <Text className="mt-6 text-[14px] text-muted-foreground">Loading…</Text>
        ) : error || !transaction ? (
          <Text className="mt-6 text-[14px] text-destructive">
            {error ?? "This transaction could not be found."}
          </Text>
        ) : (
          <View className="mt-6">
            <Text
              className={`text-[22px] font-bold ${
                transaction.type === "debit"
                  ? "text-destructive"
                  : "text-green-600"
              }`}
            >
              {formatTransactionAmount(transaction)}
            </Text>
            <Text className="mt-4 text-[14px] text-muted-foreground">
              {category} · {transactionAccountLabel(transaction)}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
