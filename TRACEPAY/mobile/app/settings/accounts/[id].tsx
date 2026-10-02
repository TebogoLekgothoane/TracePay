import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ChevronLeft, FileText, Link2, Plus } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InstitutionLogo } from "../../../src/components/accounts/InstitutionLogo";
import { Button } from "../../../src/components/ui/Button";
import { IconButton } from "../../../src/components/ui/IconButton";
import { resolveInstitutionLogoDomain } from "../../../src/features/accounts/account.constants";
import {
  accountSetupHref,
  parseAccountId,
} from "../../../src/features/accounts/account.navigation";
import { getAccountById, loadAccountBalances } from "../../../src/features/accounts/account.service";
import {
  formatAccountBalanceAsOfLabel,
  formatBalanceAmountLabel,
  type AccountBalanceSummary,
} from "../../../src/features/accounts/account-balance";
import {
  listStatementsForAccount,
  type StatementImportRecord,
} from "../../../src/features/accounts/statement.service";
import type { FinancialAccount } from "../../../src/features/accounts/account.types";
import {
  colorForAccount,
  formatAccountHeading,
  formatAccountSubtitle,
  formatAccountTypeLabel,
} from "../../../src/features/accounts/account.validation";
import {
  categoryName,
  formatTransactionAmount,
} from "../../../src/features/transactions/transaction.service";
import { useTransactions } from "../../../src/hooks/useTransactions";
import { COLORS, TRACEPAY } from "../../../src/theme/colors";

export default function AccountDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const accountId = parseAccountId(params.id);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [statements, setStatements] = useState<StatementImportRecord[]>([]);
  const [balanceSummary, setBalanceSummary] = useState<AccountBalanceSummary | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const { transactions, loading: txLoading } = useTransactions(accountId);

  const load = useCallback(() => {
    if (!accountId) {
      setLoadError("Account not found.");
      return;
    }
    void Promise.all([
      getAccountById(accountId),
      listStatementsForAccount(accountId),
      loadAccountBalances([accountId]),
    ])
      .then(([nextAccount, nextStatements, nextBalances]) => {
        if (!nextAccount) {
          setLoadError("Account not found.");
          setAccount(null);
          setBalanceSummary(null);
          return;
        }
        setAccount(nextAccount);
        setStatements(nextStatements);
        setBalanceSummary(nextBalances[accountId] ?? null);
        setLoadError(null);
      })
      .catch((caught: unknown) => {
        setLoadError(
          caught instanceof Error ? caught.message : "Could not load this account.",
        );
      });
  }, [accountId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!accountId) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <Text className="mt-10 text-[15px] text-destructive">Account not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} className="flex-1">
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <Text className="flex-1 text-[24px] font-bold text-foreground" numberOfLines={1}>
              {account ? formatAccountHeading(account) : "Account"}
            </Text>
          </View>

          {loadError ? (
            <Text className="mt-4 text-[14px] text-destructive">{loadError}</Text>
          ) : null}

          {account ? (
            <View className="mt-5 rounded-2xl bg-card px-4 py-4">
              <View className="flex-row items-center gap-3">
                <InstitutionLogo
                  name={account.name}
                  logoDomain={resolveInstitutionLogoDomain(account.institution)}
                  color={colorForAccount(account)}
                />
                <View className="flex-1">
                  <Text className="text-[16px] font-semibold text-foreground">
                    {formatAccountHeading(account)}
                  </Text>
                  <Text className="mt-1 text-[13px] text-muted-foreground">
                    {formatAccountSubtitle(account)}
                  </Text>
                  <Text className="mt-1 text-[12px] text-muted-foreground">
                    {formatAccountTypeLabel(account.accountType)} · Statement import
                  </Text>
                </View>
              </View>
              <View className="mt-4 border-t border-border/50 pt-4">
                <Text className="text-[13px] text-muted-foreground">
                  Statement balance
                </Text>
                <Text className="mt-1 text-[24px] font-bold text-foreground">
                  {formatBalanceAmountLabel(balanceSummary?.amount ?? null)}
                </Text>
                <Text className="mt-1 text-[12px] text-muted-foreground">
                  {(() => {
                    const asOf = formatAccountBalanceAsOfLabel(
                      balanceSummary?.asOfDate ?? null,
                    );
                    return asOf
                      ? `From statements · ${asOf}`
                      : "From statements · as of latest import";
                  })()}
                </Text>
                {balanceSummary?.warningReason ? (
                  <Text className="mt-2 text-[12px] leading-5 text-amber-700 dark:text-amber-300">
                    {balanceSummary.warningReason}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}


          <View className="mt-6 flex-row gap-2">
            <Button
              className="flex-1"
              size="md"
              onPress={() =>
                router.push(
                  accountSetupHref(accountId, `/settings/accounts/${accountId}`) as never,
                )
              }
            >
              <>
                <Plus color={trace.primaryForeground} size={16} />
                <Text className="text-[14px] font-semibold text-primary-foreground">
                  Add statement
                </Text>
              </>
            </Button>
            <Button className="flex-1" size="md" variant="secondary" disabled>
              <>
                <Link2 color={palette.primary} size={16} />
                <Text className="text-[14px] font-semibold text-primary">
                  Open Banking soon
                </Text>
              </>
            </Button>
          </View>

          <Text className="mt-8 text-[17px] font-bold text-foreground">Statement history</Text>
          <View className="mt-3 gap-2">
            {statements.length === 0 ? (
              <View className="rounded-2xl bg-card px-4 py-4">
                <Text className="text-[14px] text-muted-foreground">
                  No statements imported for this account yet.
                </Text>
              </View>
            ) : (
              statements.map((statement) => (
                <View key={statement.id} className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5">
                  <FileText color={palette.primary} size={22} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                      {statement.statementStartDate && statement.statementEndDate
                        ? `${statement.statementStartDate} – ${statement.statementEndDate}`
                        : statement.fileName}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {statement.fileName} · {statement.transactionCount} transactions ·{" "}
                      {statement.status}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text className="mt-8 text-[17px] font-bold text-foreground">Recent transactions</Text>
          <View className="mt-3 gap-2">
            {txLoading ? (
              <Text className="text-[14px] text-muted-foreground">Loading transactions…</Text>
            ) : null}
            {!txLoading && transactions.length === 0 ? (
              <Text className="text-[14px] text-muted-foreground">
                Import a statement to see transactions for this account.
              </Text>
            ) : null}
            {transactions.slice(0, 8).map((transaction) => (
              <Pressable
                key={transaction.id}
                className="rounded-2xl bg-card px-4 py-3 active:opacity-80"
                onPress={() => router.push(`/transactions/${transaction.id}` as never)}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                      {transaction.description}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {transaction.date} · {categoryName(transaction)}
                    </Text>
                  </View>
                  <Text className="text-[14px] font-semibold text-foreground">
                    {formatTransactionAmount(transaction)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
