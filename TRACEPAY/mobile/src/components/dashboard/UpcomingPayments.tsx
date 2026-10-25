import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  formatUpcomingDate,
  type UpcomingPayment,
} from "../../features/dashboard/upcoming-payments";
import { resolveLogoDomainFromMerchantLabel } from "../../features/transactions/merchant-logos";
import { COLORS, withAlpha } from "../../theme/colors";
import { formatRandAmount } from "../../utils/currency";
import { BrandLogo } from "../ui/BrandLogo";

type Props = {
  payments: UpcomingPayment[];
  loading: boolean;
  error: string | null;
  onSeeAll: () => void;
};

function PaymentLogo({ payment }: { payment: UpcomingPayment }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const domain = resolveLogoDomainFromMerchantLabel(payment.name);
  if (domain) {
    return <BrandLogo name={payment.name} logoDomain={domain} size={36} shape="squircle" />;
  }
  return (
    <View
      className="h-9 w-9 items-center justify-center rounded-[10px]"
      style={{ backgroundColor: withAlpha(palette.primary, 0.14) }}
    >
      <Text className="text-[15px] font-bold text-primary">
        {payment.name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

export function UpcomingPayments({ payments, loading, error, onSeeAll }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">Upcoming payments</Text>
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-0.5 active:opacity-70"
          onPress={onSeeAll}
        >
          <Text className="text-[14px] font-semibold text-primary">See all</Text>
          <ChevronRight color={palette.primary} size={16} strokeWidth={2.4} />
        </Pressable>
      </View>

      {payments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 4 }}
        >
          {payments.map((payment) => (
            <View
              key={payment.id}
              className="w-[156px] rounded-2xl border border-border/60 bg-card p-3.5"
            >
              <View className="flex-row items-center gap-2.5">
                <PaymentLogo payment={payment} />
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                    {payment.name}
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
                    {formatUpcomingDate(payment.date)}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 text-[18px] font-bold tracking-[-0.3px] text-foreground">
                {formatRandAmount(payment.amount)}
              </Text>
              <Text className="mt-0.5 text-[11px] text-muted-foreground">Expected</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View className="rounded-2xl border border-border/60 bg-card px-4 py-4">
          <Text className="text-[13px] leading-5 text-muted-foreground">
            {loading
              ? "Looking for your recurring payments…"
              : error
                ? "Upcoming payments could not be loaded right now."
                : "No upcoming payments yet. They appear once TracePay sees a charge repeat in your statements."}
          </Text>
        </View>
      )}
    </View>
  );
}
