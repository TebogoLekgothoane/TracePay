import { router, useFocusEffect } from "expo-router";
import { ChevronLeft, Plus, Trash2, Wallet } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InstitutionLogo } from "../../../src/components/accounts/InstitutionLogo";
import { Button } from "../../../src/components/ui/Button";
import {
  DocumentActionsMenu,
  type DocumentActionsMenuAction,
} from "../../../src/components/ui/DocumentActionsMenu";
import { Modal } from "../../../src/components/ui/Modal";
import { resolveInstitutionLogoDomain } from "../../../src/features/accounts/account.constants";
import {
  ADD_ACCOUNT_HREF,
  accountSetupHref,
} from "../../../src/features/accounts/account.navigation";
import {
  deleteAccount,
  updateAccountName,
} from "../../../src/features/accounts/account.service";
import type { FinancialAccount } from "../../../src/features/accounts/account.types";
import { loadAccountStatementStats } from "../../../src/features/accounts/statement.service";
import {
  colorForAccount,
  formatAccountActivityLabel,
  formatAccountCardTitle,
  formatAccountsCount,
  formatInstitutionGroupLabel,
  isValidAccountName,
  sanitizeAccountName,
} from "../../../src/features/accounts/account.validation";
import { useAccounts } from "../../../src/hooks/useAccounts";
import { COLORS, TRACEPAY } from "../../../src/theme/colors";

type InstitutionGroup = {
  key: string;
  label: string;
  logoDomain: string | null;
  color: string;
  accounts: FinancialAccount[];
};

type AccountStats = { statementCount: number; transactionCount: number };

function groupAccountsByInstitution(
  accounts: FinancialAccount[],
): InstitutionGroup[] {
  const groups = new Map<string, InstitutionGroup>();

  for (const account of accounts) {
    const label = formatInstitutionGroupLabel(account);
    const key = label.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.accounts.push(account);
      continue;
    }
    groups.set(key, {
      key,
      label,
      logoDomain: resolveInstitutionLogoDomain(label),
      color: colorForAccount(account),
      accounts: [account],
    });
  }

  return Array.from(groups.values());
}

export default function LinkedAccountsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { accounts, error, loading, retry } = useAccounts();
  const [stats, setStats] = useState<Record<string, AccountStats>>({});
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [renameAccount, setRenameAccount] = useState<FinancialAccount | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const groups = useMemo(() => groupAccountsByInstitution(accounts), [accounts]);

  useFocusEffect(
    useCallback(() => {
      if (accounts.length === 0) {
        setStats({});
        return;
      }
      void loadAccountStatementStats(accounts.map((account) => account.id))
        .then((next) => {
          const mapped: Record<string, AccountStats> = {};
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

  const removeAccounts = useCallback(
    (targets: FinancialAccount[], title: string, message: string) => {
      if (deletingKey || targets.length === 0) return;

      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const key = targets.map((account) => account.id).join(",");
            setDeletingKey(key);
            void Promise.all(targets.map((account) => deleteAccount(account.id)))
              .then(() => {
                setStats((current) => {
                  const next = { ...current };
                  for (const account of targets) {
                    delete next[account.id];
                  }
                  return next;
                });
              })
              .catch(() => {
                Alert.alert("Could not remove account", "Please try again.");
              })
              .finally(() => {
                setDeletingKey(null);
              });
          },
        },
      ]);
    },
    [deletingKey],
  );

  const startRename = useCallback((account: FinancialAccount) => {
    setRenameAccount(account);
    setRenameValue(account.name);
  }, []);

  const closeRename = useCallback(() => {
    if (renaming) return;
    setRenameAccount(null);
    setRenameValue("");
  }, [renaming]);

  const submitRename = useCallback(() => {
    if (!renameAccount || renaming) return;
    const nextName = sanitizeAccountName(renameValue);
    if (!isValidAccountName(nextName)) {
      Alert.alert("Invalid name", "Enter an account name between 2 and 80 characters.");
      return;
    }

    setRenaming(true);
    void updateAccountName(renameAccount.id, nextName)
      .then(() => {
        setRenameAccount(null);
        setRenameValue("");
      })
      .catch(() => {
        Alert.alert("Could not rename account", "Please try again.");
      })
      .finally(() => {
        setRenaming(false);
      });
  }, [renameAccount, renameValue, renaming]);

  const accountMenuActions = useCallback(
    (account: FinancialAccount): DocumentActionsMenuAction[] => [
      {
        action: "rename",
        label: "Rename account",
        callback: () => startRename(account),
      },
      {
        action: "view",
        label: "View account",
        callback: () => {
          router.push(`/settings/accounts/${account.id}` as never);
        },
      },
      {
        action: "add-statement",
        label: "Add statement",
        callback: () => {
          router.push(
            accountSetupHref(account.id, `/settings/accounts/${account.id}`) as never,
          );
        },
      },
      {
        action: "remove",
        label: "Remove imported data",
        destructive: true,
        callback: () => {
          removeAccounts(
            [account],
            "Remove account",
            `Remove ${formatAccountCardTitle(account)} from TracePay? Its statements, transactions, and uploaded files will also be permanently deleted.`,
          );
        },
      },
    ],
    [removeAccounts, startRename],
  );

  const busy = Boolean(deletingKey) || renaming;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityLabel="Back to Settings"
              accessibilityRole="button"
              className="flex-row items-center gap-0.5 rounded-full bg-card py-2 pl-2.5 pr-3.5 active:opacity-80"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: scheme === "dark" ? 0.35 : 0.08,
                shadowRadius: 4,
                elevation: 2,
              }}
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={18} strokeWidth={2.4} />
              <Text className="text-[15px] font-semibold text-foreground">Settings</Text>
            </Pressable>
            <Text className="flex-1 text-[22px] font-bold text-foreground" numberOfLines={1}>
              My accounts
            </Text>
          </View>

          {error ? (
            <View className="mt-5 rounded-2xl bg-destructive/10 px-4 py-3">
              <Text className="text-[14px] text-destructive">{error}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={retry}>
                <Text className="mt-1 text-[13px] font-semibold text-primary">Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && accounts.length === 0 ? (
            <View className="mt-8 rounded-[20px] bg-card px-4 py-5">
              <Text className="text-[14px] text-muted-foreground">Loading your accounts…</Text>
            </View>
          ) : null}

          {!loading && accounts.length === 0 ? (
            <View className="mt-8 rounded-[20px] bg-card px-4 py-5">
              <Text className="text-[15px] font-semibold text-foreground">No accounts yet</Text>
              <Text className="mt-1 text-[14px] leading-6 text-muted-foreground">
                Add a bank account, then import a statement to start tracking spending.
              </Text>
            </View>
          ) : null}

          <View className="mt-7 gap-8">
            {groups.map((group) => {
              const groupBusy =
                deletingKey !== null &&
                group.accounts.some((account) => deletingKey.includes(account.id));

              return (
                <View key={group.key} className={groupBusy ? "opacity-60" : ""}>
                  <View className="flex-row items-center gap-3">
                    <InstitutionLogo
                      name={group.label}
                      logoDomain={group.logoDomain}
                      color={group.color}
                      shape="rounded"
                      size={40}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[17px] font-bold text-foreground">
                        {group.label}
                      </Text>
                      <Text className="mt-0.5 text-[13px] text-muted-foreground">
                        {formatAccountsCount(group.accounts.length)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`Remove ${group.label} accounts`}
                      accessibilityRole="button"
                      disabled={busy}
                      hitSlop={10}
                      className="h-10 w-10 items-center justify-center active:opacity-70"
                      onPress={() =>
                        removeAccounts(
                          group.accounts,
                          group.accounts.length === 1
                            ? "Remove account"
                            : "Remove bank accounts",
                          group.accounts.length === 1
                            ? `Remove ${formatAccountCardTitle(group.accounts[0]!)} from TracePay? Its statements, transactions, and uploaded files will also be permanently deleted.`
                            : `Remove all ${group.accounts.length} ${group.label} accounts from TracePay? Their statements, transactions, and uploaded files will also be permanently deleted.`,
                        )
                      }
                    >
                      <Trash2 color={palette.destructive} size={20} strokeWidth={2} />
                    </Pressable>
                  </View>

                  <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
                    Tap an account to rename it or remove its imported data.
                  </Text>

                  <View className="mt-3 gap-2">
                    {group.accounts.map((account) => {
                      const accountStats = stats[account.id];
                      return (
                        <View
                          key={account.id}
                          className="flex-row items-center gap-3 rounded-[20px] bg-card px-4 py-3.5"
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={formatAccountCardTitle(account)}
                            disabled={busy}
                            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
                            onPress={() =>
                              router.push(`/settings/accounts/${account.id}` as never)
                            }
                          >
                            <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-muted">
                              <Wallet
                                color={palette.foreground}
                                size={18}
                                strokeWidth={2}
                              />
                            </View>
                            <View className="min-w-0 flex-1">
                              <Text
                                className="text-[15px] font-bold text-foreground"
                                numberOfLines={1}
                              >
                                {formatAccountCardTitle(account)}
                              </Text>
                              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                                {formatAccountActivityLabel(
                                  accountStats?.transactionCount ?? 0,
                                  accountStats?.statementCount ?? 0,
                                )}
                              </Text>
                            </View>
                          </Pressable>
                          <DocumentActionsMenu
                            actions={accountMenuActions(account)}
                            disabled={busy}
                            foregroundColor={palette.foreground}
                            mutedColor={palette.mutedForeground}
                            size={32}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          <Button
            className="mt-8"
            disabled={busy}
            onPress={() => router.push(ADD_ACCOUNT_HREF)}
            size="md"
          >
            <>
              <Plus color={trace.primaryForeground} size={18} strokeWidth={2.4} />
              <Text className="text-[15px] font-semibold text-primary-foreground">
                Add account
              </Text>
            </>
          </Button>
        </View>
      </ScrollView>

      <Modal visible={renameAccount !== null} onClose={closeRename}>
        {renameAccount ? (
          <View>
            <Text className="text-[17px] font-bold text-foreground">Rename account</Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">
              Choose a name you’ll recognize on your dashboard.
            </Text>
            <TextInput
              autoFocus
              editable={!renaming}
              maxLength={80}
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={submitRename}
              placeholder="Account name"
              placeholderTextColor={palette.placeholder}
              returnKeyType="done"
              className="mt-4 rounded-2xl bg-background px-4 py-3.5 text-[15px] text-foreground"
            />
            <View className="mt-4 flex-row gap-2">
              <Button
                className="flex-1"
                disabled={renaming}
                size="md"
                variant="secondary"
                onPress={closeRename}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={renaming}
                size="md"
                onPress={submitRename}
              >
                {renaming ? "Saving…" : "Save"}
              </Button>
            </View>
          </View>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}
