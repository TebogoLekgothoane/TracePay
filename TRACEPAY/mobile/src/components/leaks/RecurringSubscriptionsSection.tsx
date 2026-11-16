import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { chargesFromDetected, type RecurringCharge } from "../../features/leaks/recurring-charges.catalog";
import { daysUntilLabel, listUpcomingCharges } from "../../features/leaks/recurring-upcoming";
import { formatUpcomingDate } from "../../features/dashboard/upcoming-payments";
import { resolveLogoDomainFromMerchantLabel } from "../../features/transactions/merchant-logos";
import { useDetectedSubscriptions } from "../../hooks/useDetectedSubscriptions";
import { COLORS } from "../../theme/colors";
import { formatRandAmount, parseRandAmount } from "../../utils/currency";
import { BrandLogo } from "../ui/BrandLogo";
import { SegmentToggle } from "../ui/SegmentToggle";
import { Skeleton } from "../ui/Skeleton";

const TABS = ["Recurring Payments", "Upcoming"] as const;
type Tab = (typeof TABS)[number];

function Logo({ charge, size }: { charge: RecurringCharge; size: number }) {
  if (charge.logoDomain) {
    return <BrandLogo name={charge.name} logoDomain={charge.logoDomain} size={size} shape="squircle" />;
  }
  return (
    <View
      className="items-center justify-center rounded-xl bg-muted"
      style={{ height: size, width: size }}
    >
      <Text className="text-[14px] font-bold text-foreground">{charge.mark}</Text>
    </View>
  );
}

function PossibleDigitalLogo({ name }: { name: string }) {
  const logoDomain = resolveLogoDomainFromMerchantLabel(name);
  if (logoDomain) {
    return <BrandLogo name={name} logoDomain={logoDomain} size={40} shape="squircle" />;
  }
  return (
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
      <Text className="text-[14px] font-bold text-foreground">{name.charAt(0)}</Text>
    </View>
  );
}

/**
 * The subscriptions TracePay found in the user's statements, with their logos, and the ones due
 * next. A subscription and a recurring charge are the same thing here: a payment that repeats.
 */
export function RecurringSubscriptionsSection() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [tab, setTab] = useState<Tab>("Recurring Payments");
  const { subscriptions, possibleRecurringDigitalSpend, loading, error } = useDetectedSubscriptions();

  const charges = useMemo(
    () =>
      chargesFromDetected(subscriptions).sort(
        (a, b) => parseRandAmount(b.amount) - parseRandAmount(a.amount),
      ),
    [subscriptions],
  );
  const upcoming = useMemo(() => listUpcomingCharges(subscriptions), [subscriptions]);

  const open = (charge: RecurringCharge) => {
    if (charge.href) router.push(charge.href as never);
  };

  return (
    <View className="mt-7">
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <SegmentToggle value={tab} options={TABS} onChange={setTab} />
      </View>

      {loading ? (
        <View className="gap-2">
          <Skeleton height={68} radius={16} />
          <Skeleton height={68} radius={16} />
        </View>
      ) : charges.length === 0 && possibleRecurringDigitalSpend.length === 0 ? (
        <View className="rounded-2xl bg-card px-4 py-5">
          <Text className="text-[14px] leading-5 text-muted-foreground">
            {error
              ? "Couldn't load your subscriptions right now. Try again in a moment."
              : "No subscriptions found in your statements yet. Import more statements and they'll show up here."}
          </Text>
        </View>
      ) : tab === "Recurring Payments" ? (
        <View className="gap-2">
          {charges.map((charge) => (
            <Pressable
              key={charge.id}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
              onPress={() => open(charge)}
            >
              <Logo charge={charge} size={40} />
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {charge.name}
                </Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground" numberOfLines={1}>
                  {charge.category} · {charge.billing}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold text-foreground">{charge.amount}</Text>
                <Text className="mt-0.5 text-[11px] font-semibold" style={{ color: palette.success }}>
                  {charge.status}
                </Text>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </Pressable>
          ))}
          {possibleRecurringDigitalSpend.length > 0 ? (
            <View className="mt-4">
              <Text className="text-[15px] font-bold text-foreground">
                Possible recurring digital spending
              </Text>
              <Text className="mt-1 text-[12px] leading-4 text-muted-foreground">
                These payments need review before we call them subscriptions.
              </Text>
              <View className="mt-2 gap-2">
                {possibleRecurringDigitalSpend.map((item) => (
                  <Pressable
                    key={item.merchantKey}
                    accessibilityRole="button"
                    className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                    onPress={() => router.push(`/transactions-list?merchant=${encodeURIComponent(item.merchantKey)}` as never)}
                  >
                    <PossibleDigitalLogo name={item.displayName} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                        {item.displayName}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground" numberOfLines={1}>
                        {item.transactionCount === 1 ? "Seen once" : `${item.transactionCount} payments`} · {item.category}
                      </Text>
                    </View>
                    <Text className="text-[14px] font-bold text-foreground">{formatRandAmount(item.observedTotal)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="gap-2">
          {upcoming.map(({ charge, date, daysUntil }) => (
            <Pressable
              key={charge.id}
              accessibilityRole="button"
              accessibilityLabel={`${charge.name}, next charge ${formatUpcomingDate(date)}`}
              className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-80"
              onPress={() => open(charge)}
            >
              <Logo charge={charge} size={38} />
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {charge.name}
                </Text>
                <Text className="mt-0.5 text-[12px] text-muted-foreground">
                  {formatUpcomingDate(date)} · {daysUntilLabel(daysUntil)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold text-foreground">{charge.amount}</Text>
                <Text className="mt-0.5 text-[11px] font-semibold text-primary">Upcoming</Text>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
