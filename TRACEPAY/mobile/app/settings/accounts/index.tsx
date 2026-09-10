import { router } from "expo-router";
import {
  Building2,
  ChevronLeft,
  Diamond,
  FileSpreadsheet,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../../src/components/ui/Button";
import { IconButton } from "../../../src/components/ui/IconButton";
import { SA_INSTITUTIONS } from "../../../src/features/accounts/account.constants";
import {
  LINKED_ACCOUNTS_HREF,
  TRANSACTIONS_IMPORT_HREF,
} from "../../../src/features/accounts/account.navigation";
import { deleteAccount } from "../../../src/features/accounts/account.service";
import {
  colorForAccount,
  formatAccountsCount,
} from "../../../src/features/accounts/account.validation";
import { useAccounts } from "../../../src/hooks/useAccounts";
import { COLORS, TRACEPAY, withAlpha } from "../../../src/theme/colors";

function AccountRowIcon({
  color,
  institution,
}: {
  color: string;
  institution: string | null;
}) {
  if (institution?.toLowerCase().includes("nedbank")) {
    return <Diamond color={color} size={20} strokeWidth={2.2} fill={color} />;
  }

  return <Building2 color={color} size={20} strokeWidth={2.2} />;
}

function openImport(institution?: string) {
  router.push({
    pathname: TRANSACTIONS_IMPORT_HREF,
    params: {
      returnTo: LINKED_ACCOUNTS_HREF,
      ...(institution ? { institution } : {}),
    },
  });
}

export default function LinkedAccountsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { accounts, error, loading, retry } = useAccounts();
  const countLabel = formatAccountsCount(accounts.length);

  const handleDelete = (accountId: string, accountName: string) => {
    Alert.alert(
      "Remove account",
      `Remove ${accountName} from TracePay? This will not delete your real bank account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void deleteAccount(accountId).catch(() => {
              Alert.alert("Could not remove account", "Please try again.");
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
            <IconButton
              accessibilityLabel="Go back"
              variant="ghost"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-foreground">
                Linked accounts
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                {countLabel}
              </Text>
            </View>
          </View>

          <Text className="mt-4 text-[14px] leading-6 text-muted-foreground">
            Choose a bank and upload a CSV statement. No need to type account
            details.
          </Text>

          {error ? (
            <View className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3">
              <Text className="text-[14px] text-destructive">{error}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={retry}>
                <Text className="mt-1 text-[13px] font-semibold text-primary">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-5 gap-2">
            {loading && accounts.length === 0 ? (
              <View className="rounded-2xl bg-card px-4 py-5">
                <Text className="text-[14px] text-muted-foreground">
                  Loading your accounts…
                </Text>
              </View>
            ) : null}

            {!loading && accounts.length === 0 ? (
              <View className="rounded-2xl bg-card px-4 py-5">
                <Text className="text-[15px] font-semibold text-foreground">
                  No statements yet
                </Text>
                <Text className="mt-1 text-[14px] leading-6 text-muted-foreground">
                  Pick your bank and upload a CSV covering about the last 6 months.
                </Text>
              </View>
            ) : null}

            {accounts.map((account) => {
              const color = colorForAccount(account);
              return (
                <View
                  key={account.id}
                  className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: withAlpha(color, 0.12) }}
                  >
                    <AccountRowIcon
                      color={color}
                      institution={account.institution}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {account.name}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {account.institution || "Bank statement"}
                    </Text>
                  </View>
                  <IconButton
                    accessibilityLabel={`Remove ${account.name}`}
                    variant="ghost"
                    onPress={() => handleDelete(account.id, account.name)}
                  >
                    <Trash2 color={palette.destructive} size={18} strokeWidth={2} />
                  </IconButton>
                </View>
              );
            })}
          </View>

          <Button className="mt-5" onPress={() => openImport()} size="md">
            <>
              <Plus color={trace.primaryForeground} size={18} strokeWidth={2.4} />
              <Text className="text-[15px] font-semibold text-primary-foreground">
                Import bank statement
              </Text>
            </>
          </Button>

          <View className="mt-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Popular banks
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SA_INSTITUTIONS.map((institution) => (
                <Pressable
                  key={institution}
                  className="rounded-full bg-muted px-3 py-2 active:opacity-75"
                  onPress={() => openImport(institution)}
                >
                  <Text className="text-[13px] font-medium text-foreground">
                    {institution}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="mt-6 flex-row items-start gap-3 rounded-2xl bg-primary/10 px-4 py-3.5">
            <FileSpreadsheet color={palette.primary} size={18} strokeWidth={2.2} />
            <Text className="flex-1 text-[13px] leading-5 text-muted-foreground">
              Use a CSV export from your bank app or online banking for the last 6
              months.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
