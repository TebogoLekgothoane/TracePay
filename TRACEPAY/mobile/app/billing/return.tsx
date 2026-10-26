import { Redirect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { refreshBilling, useBilling } from "../../src/features/billing/billing.store";
import { COLORS } from "../../src/theme/colors";

/** Target of the Paystack callback link (tracepay://billing/return). */
export default function BillingReturnScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { entitlements } = useBilling();
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    void refreshBilling().then(() => setFresh(true));
  }, []);

  if (fresh) {
    const pending = entitlements?.pending[0];
    if (pending) {
      return <Redirect href={`/billing/checkout?product=${pending.product}&resume=1`} />;
    }
    return <Redirect href="/(tabs)/leaks" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <ActivityIndicator color={palette.primary} />
      <Text className="mt-4 text-center text-[14px] text-muted-foreground">
        Confirming your payment…
      </Text>
    </View>
  );
}
