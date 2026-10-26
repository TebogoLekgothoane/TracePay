import { router, useLocalSearchParams } from "expo-router";
import { CreditCard, Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { BillingShell, ErrorNote, Panel, goBackOr } from "../../src/components/billing/BillingShell";
import { Button } from "../../src/components/ui/Button";
import { formatCents } from "../../src/features/billing/billing.format";
import { useBilling } from "../../src/features/billing/billing.store";
import type { BillingProduct } from "../../src/features/billing/billing.types";
import { usePaymentFlow, type PaymentPhase } from "../../src/hooks/usePaymentFlow";
import { COLORS } from "../../src/theme/colors";

const COPY: Record<BillingProduct, { name: string; detail: string; backTo: string }> = {
  full_analysis: {
    name: "Full analysis",
    detail: "Once-off payment",
    backTo: "/upgrade",
  },
  annual_monitoring: {
    name: "Annual monitoring",
    detail: "Billed yearly, cancel any time",
    backTo: "/monitoring/offer",
  },
};

const STATUS: Record<PaymentPhase, string> = {
  idle: "Ready to pay",
  starting: "Opening secure checkout…",
  awaiting: "Waiting for your payment",
  verifying: "Confirming with Paystack…",
  success: "Payment confirmed",
  failed: "Payment not completed",
  delayed: "Waiting for confirmation",
  error: "Something went wrong",
};

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ product?: string; resume?: string }>();
  const product: BillingProduct =
    params.product === "annual_monitoring" ? "annual_monitoring" : "full_analysis";
  const copy = COPY[product];
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { products, entitlements } = useBilling();
  const flow = usePaymentFlow(product);

  const cents =
    product === "full_analysis"
      ? products?.fullAnalysis.priceCents
      : products?.annualMonitoring.priceCents;

  // Returning from the provider's callback link, or reopening after an interrupted payment.
  const pending = entitlements?.pending.find((entry) => entry.product === product);
  const shouldResume = params.resume === "1";
  useEffect(() => {
    if (shouldResume && pending) void flow.resume(pending.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldResume, pending?.reference]);

  useEffect(() => {
    if (flow.phase === "success") {
      router.replace(`/billing/success?product=${product}`);
    }
  }, [flow.phase, product]);

  const busy = flow.phase === "starting" || flow.phase === "verifying";
  const waiting = flow.phase === "awaiting" || flow.phase === "delayed";
  const amount = cents ? formatCents(cents) : "—";

  return (
    <BillingShell
      onBack={() => goBackOr(copy.backTo)}
      footer={
        <View>
          {waiting ? (
            <Button loading={busy} onPress={() => void flow.verify()}>
              I have paid — check status
            </Button>
          ) : (
            <Button
              loading={busy}
              onPress={() => void flow.start()}
            >
              {flow.phase === "failed" || flow.phase === "error"
                ? "Try again"
                : `Pay ${amount} securely`}
            </Button>
          )}
          <Button className="mt-1" variant="ghost" onPress={() => goBackOr(copy.backTo)}>
            {flow.phase === "failed" ? "Back" : "Cancel"}
          </Button>
        </View>
      }
    >
      <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">Checkout</Text>

      <Panel className="mt-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[16px] font-semibold text-foreground">{copy.name}</Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">{copy.detail}</Text>
          </View>
          <Text className="text-[18px] font-bold text-foreground">{amount}</Text>
        </View>
        <View className="mt-4 border-t border-border/60 pt-3 flex-row items-center justify-between">
          <Text className="text-[14px] text-muted-foreground">Amount payable</Text>
          <Text className="text-[16px] font-bold text-foreground">{amount}</Text>
        </View>
      </Panel>

      <Panel className="mt-3">
        <View className="flex-row items-center gap-3">
          <CreditCard color={palette.primary} size={20} strokeWidth={2.1} />
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-semibold text-foreground">Paystack secure checkout</Text>
            <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              Choose card or another available method on the next page.
            </Text>
          </View>
        </View>
      </Panel>

      <Panel className="mt-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[14px] text-muted-foreground">Status</Text>
          <View className="flex-row items-center gap-2">
            {busy ? <ActivityIndicator color={palette.primary} size="small" /> : null}
            <Text className="text-[14px] font-semibold text-foreground">{STATUS[flow.phase]}</Text>
          </View>
        </View>
      </Panel>

      {flow.message ? (
        <View className="mt-3">
          {flow.phase === "delayed" ? (
            <Panel>
              <Text className="text-[14px] leading-5 text-foreground">{flow.message}</Text>
            </Panel>
          ) : (
            <ErrorNote message={flow.message} />
          )}
        </View>
      ) : null}

      <View className="mt-5 flex-row items-start gap-2.5">
        <Lock color={palette.mutedForeground} size={15} strokeWidth={2.2} />
        <Text className="min-w-0 flex-1 text-[12px] leading-[18px] text-muted-foreground">
          Your card details go straight to Paystack. TracePay unlocks your purchase only after
          Paystack confirms the payment.
        </Text>
      </View>
    </BillingShell>
  );
}
