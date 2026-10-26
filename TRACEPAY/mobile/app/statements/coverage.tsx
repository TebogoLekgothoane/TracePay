import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AccountCoverageCard } from "../../src/components/coverage/AccountCoverageCard";
import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { ADD_ACCOUNT_HREF } from "../../src/features/accounts/account.navigation";
import {
  COVERAGE_LIMITS_NOTE,
  coverageHeadline,
} from "../../src/features/statement-coverage/statement-coverage.format";
import { useStatementCoverage } from "../../src/hooks/useStatementCoverage";
import { COLORS } from "../../src/theme/colors";

export default function StatementCoverageScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { coverage, loading, error, reload } = useStatementCoverage();
  const refreshing = loading && coverage !== null;
  const isEmpty =
    coverage !== null && (coverage.totalStatements === 0 || coverage.accounts.length === 0);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="min-w-0 flex-1">
              <Text className="text-[24px] font-bold text-foreground">Statements & coverage</Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                What your uploaded statements cover
              </Text>
            </View>
          </View>

          {loading && coverage === null ? (
            <View className="items-center py-16" accessibilityLabel="Loading statement coverage">
              <ActivityIndicator color={palette.primary} />
              <Text className="mt-3 text-[14px] text-muted-foreground">
                Checking your statements...
              </Text>
            </View>
          ) : null}

          {error && coverage === null ? (
            <View className="mt-6 rounded-3xl bg-card px-4 py-5">
              <Text className="text-[16px] font-bold text-foreground">
                Could not load your coverage
              </Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">{error}</Text>
              <Button className="mt-4" variant="primary" onPress={reload}>
                Try again
              </Button>
            </View>
          ) : null}

          {error && coverage !== null ? (
            <Text className="mt-4 text-[12px] text-muted-foreground">
              Could not refresh just now, so this may be out of date. Pull down to try again.
            </Text>
          ) : null}

          {coverage !== null && isEmpty ? (
            <View className="mt-6 rounded-3xl bg-card px-4 py-5">
              <Text className="text-[16px] font-bold text-foreground">No statements yet</Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                Add a bank statement and TracePay will show which accounts and months it covers.
                Start with one account — you can add more any time.
              </Text>
              <Button
                className="mt-4"
                variant="primary"
                onPress={() => router.push(ADD_ACCOUNT_HREF as never)}
              >
                Add a statement
              </Button>
            </View>
          ) : null}

          {coverage !== null && !isEmpty ? (
            <>
              <View className="mt-5 rounded-3xl bg-primary/10 px-4 py-4">
                <Text className="text-[17px] font-bold text-foreground">
                  {coverageHeadline(coverage)}
                </Text>
                {coverage.failedStatements > 0 ? (
                  <Text className="mt-1 text-[13px] text-foreground">
                    {coverage.failedStatements} statement
                    {coverage.failedStatements === 1 ? "" : "s"} could not be read.
                  </Text>
                ) : null}
                {coverage.summary.map((line, index) => (
                  <Text key={index} className="mt-1 text-[13px] leading-5 text-foreground">
                    {line}
                  </Text>
                ))}
                <Text className="mt-2 text-[12px] leading-[18px] text-muted-foreground">
                  {COVERAGE_LIMITS_NOTE}
                </Text>
              </View>

              <View className="mt-4 gap-3">
                {coverage.accounts.map((account) => (
                  <AccountCoverageCard
                    key={account.accountId}
                    account={account}
                    statements={coverage.statements}
                  />
                ))}
              </View>

              {coverage.disclaimer ? (
                <Text className="mt-4 text-[12px] leading-[18px] text-muted-foreground">
                  {coverage.disclaimer}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
