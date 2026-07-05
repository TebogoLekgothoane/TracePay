import React from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/Typography";
import { Card } from "@/components/Card";
import { TransactionIcon } from "@/components/TransactionIcon";
import { cn } from "@/lib/cn";
import { getTransactionDisplay } from "@/lib/transaction-display";
import { getTransactionDate } from "@/lib/transaction-filters";
import { ParsedTransaction } from "@/services/sms/sms.types";

type TransactionRowProps = {
  tx: ParsedTransaction;
  onPress?: () => void;
  showMeta?: boolean;
  className?: string;
};

export function TransactionRow({ tx, onPress, showMeta = false, className }: TransactionRowProps) {
  const isDebit = tx.type === "debit";
  const { headline, summary } = getTransactionDisplay(tx);

  const content = (
    <Card className={className} contentClassName="flex-row items-start gap-3">
      <TransactionIcon tx={tx} />
      <View className="min-w-0 flex-1">
        <AppText variant="title" numberOfLines={1}>
          {headline}
        </AppText>
        <AppText variant="bodySm" className="mt-0.5" numberOfLines={showMeta ? 2 : 1}>
          {summary}
        </AppText>
        {showMeta ? (
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
        ) : null}
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
          {getTransactionDate(tx).toLocaleTimeString("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </AppText>
      </View>
    </Card>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} className="active:opacity-90">
      {content}
    </Pressable>
  );
}
