import { router } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { BillingShell, Checklist, Panel, goBackOr } from "../../src/components/billing/BillingShell";
import { ReviewIconTile, reviewIconColor } from "../../src/components/leaks/ReviewVisuals";
import { Button } from "../../src/components/ui/Button";
import { splitLeaksForPaywall } from "../../src/features/leaks/leak-paywall";
import { listPotentialLeaks, type ReviewIcon } from "../../src/features/leaks/potential-leaks";
import { formatRandAmount, parseRandAmount } from "../../src/utils/currency";
import { useColorScheme } from "nativewind";

const TYPE_LABEL: Record<ReviewIcon, string> = {
  copy: "Duplicate payments",
  refresh: "Subscriptions",
  receipt: "Bank fees",
  activity: "Unusual activity",
  calendar: "Recurring payments",
};

const UNLOCKS = [
  "The merchant and transactions behind every locked leak",
  "Why each transaction was flagged, with evidence",
  "Recommendations for what to do next",
];

/** What the remaining findings are worth, without exposing any of their details. */
export default function LockedFindingsSummary() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const { locked } = useMemo(() => splitLeaksForPaywall(listPotentialLeaks()), []);

  const groups = useMemo(() => {
    const byType = new Map<ReviewIcon, { count: number; monthly: number }>();
    for (const leak of locked) {
      const entry = byType.get(leak.icon) ?? { count: 0, monthly: 0 };
      byType.set(leak.icon, {
        count: entry.count + 1,
        monthly: entry.monthly + parseRandAmount(leak.monthlyAmount),
      });
    }
    return [...byType.entries()].sort((a, b) => b[1].monthly - a[1].monthly);
  }, [locked]);
  const total = groups.reduce((sum, [, entry]) => sum + entry.monthly, 0);

  return (
    <BillingShell
      onBack={() => goBackOr("/(tabs)/leaks")}
      footer={
        <Button
          arrow
          onPress={() => router.push("/upgrade")}
        >
          Unlock full analysis
        </Button>
      }
    >
      <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">
        {locked.length} more {locked.length === 1 ? "finding" : "findings"}
      </Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
        Worth an estimated {formatRandAmount(total)} a month. Here is what kind of leaks they are.
      </Text>

      <Panel className="mt-6 gap-4">
        {groups.map(([icon, entry]) => (
          <View key={icon} className="flex-row items-center gap-3">
            <ReviewIconTile icon={icon} color={reviewIconColor(scheme, icon)} size={40} />
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">{TYPE_LABEL[icon]}</Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                {entry.count} {entry.count === 1 ? "finding" : "findings"}
              </Text>
            </View>
            <Text className="text-[15px] font-bold text-foreground">
              {formatRandAmount(entry.monthly)}
              <Text className="text-[12px] font-normal text-muted-foreground"> / month</Text>
            </Text>
          </View>
        ))}
      </Panel>

      <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">What a once-off payment unlocks</Text>
      <Checklist items={UNLOCKS} />
      <Text className="mt-5 text-[12px] leading-[18px] text-muted-foreground">
        One payment, not a subscription.
      </Text>
    </BillingShell>
  );
}
