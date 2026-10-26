import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { BillingShell } from "../../src/components/billing/BillingShell";
import { SkiaCheck } from "../../src/components/feedback/SkiaCheck";
import { Button } from "../../src/components/ui/Button";
import { formatLongDate } from "../../src/features/billing/billing.format";
import { useBilling } from "../../src/features/billing/billing.store";
import { COLORS } from "../../src/theme/colors";

export default function PaymentSuccessScreen() {
  const params = useLocalSearchParams<{ product?: string }>();
  const monitoring = params.product === "annual_monitoring";
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { entitlements, hydrated } = useBilling();

  if (!hydrated) return null;
  // Only reachable after the backend confirmed the purchase.
  const confirmed = monitoring
    ? entitlements?.monitoring.active
    : entitlements?.fullAnalysis.unlocked;
  if (!confirmed) return <Redirect href={monitoring ? "/monitoring/offer" : "/upgrade"} />;

  return (
    <BillingShell
      footer={
        monitoring ? (
          <Button arrow onPress={() => router.replace("/monitoring" as never)}>
            Open monitoring
          </Button>
        ) : (
          <View>
            <Button arrow onPress={() => router.replace("/(tabs)/leaks")}>
              View all leaks
            </Button>
            {entitlements?.monitoring.active ? null : (
              <Button
                className="mt-1"
                variant="ghost"
                onPress={() => router.replace("/monitoring/offer")}
              >
                Keep TracePay working for you
              </Button>
            )}
          </View>
        )
      }
    >
      <View className="items-center pt-10">
        <SkiaCheck color={palette.primary} size={72} />
        <Text className="mt-5 text-center text-[26px] font-bold tracking-[-0.4px] text-foreground">
          {monitoring ? "Monitoring is on" : "Full analysis unlocked"}
        </Text>
        <Text className="mt-2 text-center text-[15px] leading-[22px] text-muted-foreground">
          {monitoring
            ? `Your plan runs until ${formatLongDate(entitlements?.monitoring.currentPeriodEnd ?? null)}. We will tell you when new potential leaks appear in statements you add.`
            : "Every leak, with its transactions, evidence and recommendations, is now available. You will not be charged again for this analysis."}
        </Text>
        <Text className="mt-4 text-center text-[12px]" style={{ color: palette.mutedForeground }}>
          A receipt is sent by Paystack to your email address.
        </Text>
      </View>
    </BillingShell>
  );
}
