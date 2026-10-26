import { Redirect, router } from "expo-router";
import { Bell, ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { cancelMonitoring } from "../../src/api/billing.api";
import { BillingShell, ErrorNote, Panel, goBackOr } from "../../src/components/billing/BillingShell";
import { Button } from "../../src/components/ui/Button";
import { formatLongDate } from "../../src/features/billing/billing.format";
import { applyEntitlements, useBilling } from "../../src/features/billing/billing.store";
import type { MonitoringStatus } from "../../src/features/billing/billing.types";
import { useAccounts } from "../../src/hooks/useAccounts";
import { useFindingNotifications } from "../../src/hooks/useFindingNotifications";
import { COLORS } from "../../src/theme/colors";

const STATUS_LABEL: Record<MonitoringStatus, string> = {
  none: "Not started",
  pending: "Setting up",
  active: "Active",
  non_renewing: "Active · ends this period",
  attention: "Payment problem",
  cancelled: "Cancelled",
  expired: "Expired",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 py-2.5">
      <Text className="text-[14px] text-muted-foreground">{label}</Text>
      <Text className="min-w-0 flex-1 text-right text-[14px] font-semibold text-foreground">{value}</Text>
    </View>
  );
}

export default function MonitoringDashboardScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { entitlements, hydrated } = useBilling();
  const { balanceTotals } = useAccounts();
  const { notifications } = useFindingNotifications();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  const monitoring = entitlements?.monitoring;
  if (!monitoring || monitoring.status === "none") return <Redirect href="/monitoring/offer" />;

  const ends = formatLongDate(monitoring.currentPeriodEnd);
  const renewalLabel = monitoring.active
    ? monitoring.cancelAtPeriodEnd
      ? `Ends on ${ends}`
      : `Renews on ${ends}`
    : `Ended ${ends}`;
  const canCancel = monitoring.active && !monitoring.cancelAtPeriodEnd && monitoring.status !== "attention";

  const confirmCancel = () => {
    Alert.alert(
      "Cancel annual monitoring?",
      `Monitoring will not renew. You keep access until ${ends}, and your full analysis stays unlocked.`,
      [
        { text: "Keep monitoring", style: "cancel" },
        {
          text: "Cancel renewal",
          style: "destructive",
          onPress: () => {
            setCancelling(true);
            setError(null);
            cancelMonitoring()
              .then(applyEntitlements)
              .catch((caught: unknown) =>
                setError(caught instanceof Error ? caught.message : "Could not cancel. Try again."),
              )
              .finally(() => setCancelling(false));
          },
        },
      ],
    );
  };

  const recent = notifications.slice(0, 3);

  return (
    <BillingShell onBack={() => goBackOr("/(tabs)/settings")}>
      <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">Monitoring</Text>

      <Panel className="mt-5">
        <Row label="Status" value={STATUS_LABEL[monitoring.status]} />
        <View className="h-px bg-border/60" />
        <Row label="Plan" value="Annual monitoring" />
        <View className="h-px bg-border/60" />
        <Row label={monitoring.active ? "Renewal" : "Expiry"} value={renewalLabel} />
        <View className="h-px bg-border/60" />
        <Row label="Latest statement data" value={balanceTotals.asOfDate ? balanceTotals.subtitle.replace("From statements · ", "") : "No statements yet"} />
      </Panel>

      {monitoring.status === "attention" ? (
        <View className="mt-3">
          <ErrorNote message="Your latest renewal payment did not go through. Update your payment method with Paystack to keep monitoring." />
        </View>
      ) : null}

      <Text className="mb-3 mt-7 text-[17px] font-bold text-foreground">Recent findings</Text>
      {recent.length === 0 ? (
        <Panel>
          <Text className="text-[14px] leading-5 text-muted-foreground">
            Nothing new yet. Alerts appear here when TracePay finds something in statements you add.
          </Text>
        </Panel>
      ) : (
        <View className="gap-2.5">
          {recent.map((item) => (
            <Panel key={item.id}>
              <Text className="text-[15px] font-semibold text-foreground">{item.title}</Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground" numberOfLines={2}>
                {item.body}
              </Text>
            </Panel>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        className="mt-5 flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
        onPress={() => router.push("/settings/notifications")}
      >
        <Bell color={palette.primary} size={19} strokeWidth={2.1} />
        <Text className="flex-1 text-[15px] font-semibold text-foreground">Alerts &amp; notifications</Text>
        <ChevronRight color={palette.mutedForeground} size={18} strokeWidth={2} />
      </Pressable>

      <View className="mt-7 gap-2">
        {error ? <ErrorNote message={error} /> : null}
        {!monitoring.active ? (
          <Button onPress={() => router.push("/monitoring/offer")}>Renew annual monitoring</Button>
        ) : null}
        {canCancel ? (
          <Button loading={cancelling} variant="destructive" onPress={confirmCancel}>
            Cancel renewal
          </Button>
        ) : null}
      </View>
    </BillingShell>
  );
}
