import { router } from "expo-router";
import { FileSpreadsheet, Upload } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TabScrollView } from "../../src/components/navigation/TabScrollView";
import { Button } from "../../src/components/ui/Button";
import { useAccounts } from "../../src/hooks/useAccounts";
import { TRACEPAY, withAlpha } from "../../src/theme/colors";

export default function TransactionsScreen() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const trace = TRACEPAY[scheme];
  const { accounts, loading } = useAccounts();

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
            Import a CSV bank statement to analyse your spending.
          </Text>

          <View className="mt-5 rounded-3xl bg-card p-5">
            <View
              className="mb-4 h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: withAlpha(trace.primary, 0.14) }}
            >
              <FileSpreadsheet color={trace.primary} size={22} strokeWidth={2.2} />
            </View>
            <Text className="text-[20px] font-bold text-foreground">
              Upload a bank statement
            </Text>
            <Text className="mt-2 text-[14px] leading-6 text-muted-foreground">
              Choose your bank, then upload a CSV covering about the last 6 months.
            </Text>

            <View className="mt-4 gap-1 rounded-2xl bg-muted p-4">
              <Text className="text-[13px] font-semibold text-foreground">
                Supported CSV formats
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                Date | Description | Amount
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                Date | Description | Debit | Credit
              </Text>
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
                  Import CSV
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
        </View>
      </TabScrollView>
    </SafeAreaView>
  );
}
