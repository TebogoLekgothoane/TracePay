import { router, useFocusEffect } from "expo-router";
import { ChevronLeft, FileSpreadsheet, Link2, Plus, Trash2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InstitutionLogo } from "../../../src/components/accounts/InstitutionLogo";
import { Button } from "../../../src/components/ui/Button";
import { IconButton } from "../../../src/components/ui/IconButton";
import { resolveInstitutionLogoDomain } from "../../../src/features/accounts/account.constants";
import {
  ADD_ACCOUNT_HREF,
  accountSetupHref,
} from "../../../src/features/accounts/account.navigation";
import { deleteAccount } from "../../../src/features/accounts/account.service";
import { loadAccountStatementStats } from "../../../src/features/accounts/statement.service";
import {
  colorForAccount,
  formatAccountHeading,
  formatAccountSubtitle,
  formatAccountsCount,
  formatStatementCount,
} from "../../../src/features/accounts/account.validation";
import { useAccounts } from "../../../src/hooks/useAccounts";
import { COLORS, TRACEPAY } from "../../../src/theme/colors";

export default function LinkedAccountsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { accounts, error, loading, retry } = useAccounts();
  const [stats, setStats] = useState<Record<string, { statementCount: number; transactionCount: number }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const countLabel = formatAccountsCount(accounts.length);

  useFocusEffect(
    useCallback(() => {
      if (accounts.length === 0) {
        setStats({});
        return;
      }
      void loadAccountStatementStats(accounts.map((account) => account.id))
        .then((next) => {
          const mapped: Record<string, { statementCount: number; transactionCount: number }> = {};
          for (const [accountId, value] of Object.entries(next)) {
            mapped[accountId] = {
              statementCount: value.statementCount,
              transactionCount: value.transactionCount,
            };
          }
          setStats(mapped);
        })
        .catch(() => setStats({}));
    }, [accounts]),
  );

  const handleDelete = (accountId: string, accountName: string) => {
    if (deletingId) return;

    Alert.alert(
      "Remove account",
      `Remove ${accountName} from TracePay? Its statements, transactions, and uploaded files will also be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setDeletingId(accountId);
            void deleteAccount(accountId)
              .then(() => {
                setStats((current) => {
                  const next = { ...current };
                  delete next[accountId];
                  return next;
                });
              })
              .catch(() => {
                Alert.alert("Could not remove account", "Please try again.");
              })
              .finally(() => {
                setDeletingId(null);
              });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-foreground">Your accounts</Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">{countLabel}</Text>
            </View>
          </View>

          <Text className="mt-4 text-[14px] leading-6 text-muted-foreground">
            Import PDF statements from every bank account you use. TracePay combines them into
            one financial picture. Open Banking will add automatic syncing later.
          </Text>

          <View className="mt-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3.5">
            <View className="flex-row items-center gap-2">
              <Link2 color={palette.primary} size={18} />
              <Text className="text-[14px] font-semibold text-foreground">Open Banking</Text>
            </View>
            <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
              Coming soon — connect banks for live sync using the same transaction pipeline as
              statement imports.
            </Text>
          </View>

          {error ? (
            <View className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3">
              <Text className="text-[14px] text-destructive">{error}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={retry}>
                <Text className="mt-1 text-[13px] font-semibold text-primary">Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-5 gap-2">
            {loading && accounts.length === 0 ? (
              <View className="rounded-2xl bg-card px-4 py-5">
                <Text className="text-[14px] text-muted-foreground">Loading your accounts…</Text>
              </View>
            ) : null}

            {!loading && accounts.length === 0 ? (
              <View className="rounded-2xl bg-card px-4 py-5">
                <Text className="text-[15px] font-semibold text-foreground">No accounts yet</Text>
                <Text className="mt-1 text-[14px] leading-6 text-muted-foreground">
                  Add your FNB, Capitec, credit card, or savings account, then import a statement
                  for each one.
                </Text>
              </View>
            ) : null}

            {accounts.map((account) => {
              const accountStats = stats[account.id];
              const isDeleting = deletingId === account.id;
              return (
                <View
                  key={account.id}
                  className={`rounded-2xl bg-card px-4 py-3.5 ${isDeleting ? "opacity-60" : ""}`}
                >
                  <View className="flex-row items-center gap-3">
                    <InstitutionLogo
                      name={formatAccountHeading(account)}
                      logoDomain={resolveInstitutionLogoDomain(account.institution)}
                      color={colorForAccount(account)}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[15px] font-semibold text-foreground">
                        {formatAccountHeading(account)}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {formatAccountSubtitle(account)}
                      </Text>
                      <Text className="mt-1 text-[12px] text-muted-foreground">
                        {formatStatementCount(accountStats?.statementCount ?? 0)}
                      </Text>
                    </View>
                    <IconButton
                      accessibilityLabel={`Remove ${formatAccountHeading(account)}`}
                      disabled={isDeleting || Boolean(deletingId)}
                      variant="ghost"
                      onPress={() => handleDelete(account.id, formatAccountHeading(account))}
                    >
                      <Trash2 color={palette.destructive} size={18} strokeWidth={2} />
                    </IconButton>
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    <Button
                      className="flex-1"
                      disabled={isDeleting || Boolean(deletingId)}
                      size="sm"
                      variant="secondary"
                      onPress={() =>
                        router.push(`/settings/accounts/${account.id}` as never)
                      }
                    >
                      View account
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={isDeleting || Boolean(deletingId)}
                      size="sm"
                      onPress={() =>
                        router.push(
                          accountSetupHref(
                            account.id,
                            `/settings/accounts/${account.id}`,
                          ) as never,
                        )
                      }
                    >
                      <>
                        <FileSpreadsheet color={trace.primaryForeground} size={16} />
                        <Text className="text-[13px] font-semibold text-primary-foreground">
                          Add statement
                        </Text>
                      </>
                    </Button>
                  </View>
                </View>
              );
            })}
          </View>

          <Button className="mt-5" onPress={() => router.push(ADD_ACCOUNT_HREF)} size="md">
            <>
              <Plus color={trace.primaryForeground} size={18} strokeWidth={2.4} />
              <Text className="text-[15px] font-semibold text-primary-foreground">Add account</Text>
            </>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
