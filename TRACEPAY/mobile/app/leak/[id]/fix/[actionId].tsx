import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BankComparisonTable } from "../../../../src/components/leaks/BankComparisonTable";
import {
  LeakFlowShell,
  neutralCardStyle,
  neutralPillColor,
  resolveMarkColor,
} from "../../../../src/components/leaks/LeakFlowShell";
import { LeakHero } from "../../../../src/components/leaks/LeakHero";
import { Button } from "../../../../src/components/ui/Button";
import {
  getActionDetail,
  hasCompareFlow,
} from "../../../../src/features/leaks/fixContent";
import { COLORS, withAlpha } from "../../../../src/theme/colors";

export default function FixActionDetailScreen() {
  const { id, actionId } = useLocalSearchParams<{ id: string; actionId: string }>();
  const leakId = id ?? "fees";
  const detail = getActionDetail(actionId ?? "");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];

  if (!detail) {
    return null;
  }

  const nextRoute = detail.bankComparison
    ? `/leak/${leakId}/fix/${actionId}/guide`
    : hasCompareFlow(detail)
    ? `/leak/${leakId}/fix/${actionId}/compare`
    : `/leak/${leakId}/fix/${actionId}/guide`;

  return (
    <LeakFlowShell title={detail.title} subtitle={detail.subtitle}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <LeakHero label={detail.savingsLabel} amount={detail.savings} caption="every month" />

        <Text className="mb-2 mt-7 text-[17px] font-bold text-foreground">Why this helps</Text>
        <View className="rounded-3xl bg-card p-4" style={neutralCardStyle(palette)}>
          <Text className="text-[14px] leading-6 text-foreground">{detail.whyThisHelps}</Text>
        </View>

        {detail.accounts?.length ? (
          <>
            <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">
              {detail.recommendedTitle}
            </Text>
            <View className="gap-2">
              {detail.accounts.map((account) => (
                <View
                  key={account.id}
                  className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5"
                >
                  <View className="h-11 w-11 items-center justify-center">
                    <Text
                      className="text-[15px] font-bold"
                      style={{ color: resolveMarkColor(palette, account.markColor) }}
                    >
                      {account.mark}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-[14px] font-semibold text-foreground">
                        {account.name}
                      </Text>
                      {account.featured ? (
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: withAlpha(palette.success, 0.14) }}
                        >
                          <Text
                            className="text-[10px] font-semibold"
                            style={{ color: palette.success }}
                          >
                            Top pick
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      {account.monthlyFee} monthly
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-1.5">
                      {account.tags.map((tag) => (
                        <View
                          key={tag}
                          className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: neutralPillColor(palette) }}
                        >
                          <Text className="text-[10px] font-medium text-primary">{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {detail.bankComparison ? (
          <>
            <Text className="mb-1 mt-7 text-[17px] font-bold text-foreground">
              Compare South African bank accounts
            </Text>
            <Text className="text-[13px] leading-5 text-muted-foreground">
              Monthly fees for entry-level accounts. Scroll sideways for more columns.
            </Text>
            <BankComparisonTable />
          </>
        ) : null}

        <Button
          className="mt-6"
          onPress={() => router.push(nextRoute as never)}
        >
          {detail.bankComparison
            ? detail.compareCta
            : hasCompareFlow(detail)
              ? detail.primaryCta
              : "Show step-by-step guide"}
        </Button>
      </ScrollView>
    </LeakFlowShell>
  );
}
