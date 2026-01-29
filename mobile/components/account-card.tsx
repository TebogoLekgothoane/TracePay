import React, { useMemo, useState } from "react";
import { View, Pressable, Image, ImageSourcePropType } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { formatZar, getLossStatus } from "@/components/utils/money";

export type AccountCategory = "Fees" | "Debits" | "Other";

export type AccountAutopsy = {
  id: string;
  name: string;
  spent: number;
  // simple breakdown for the UI
  fees: number;
  debits: number;
  other: number;
};

function statusDotClass(spent: number) {
  const status = getLossStatus(spent);
  if (status === "high") return "bg-red-500";
  if (status === "medium") return "bg-orange-500";
  return "bg-green-500";
}

export function AccountCard({
  account,
  logo,
  onPressPrimary,
  onPressSecondary,
  onPressTertiary,
}: {
  account: AccountAutopsy;
  logo?: ImageSourcePropType;
  onPressPrimary?: () => void;
  onPressSecondary?: () => void;
  onPressTertiary?: () => void;
}) {
  const [tab, setTab] = useState<AccountCategory>("Fees");

  const total = useMemo(() => Math.max(1, account.fees + account.debits + account.other), [account]);
  const feePct = (account.fees / total) * 100;
  const debitPct = (account.debits / total) * 100;
  const otherPct = Math.max(0, 100 - feePct - debitPct);

  const selectedTotal =
    tab === "Fees" ? account.fees : tab === "Debits" ? account.debits : account.other;

  return (
    <View className="w-full rounded-3xl bg-white px-5 py-5 mb-5 shadow-sm">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          {logo ? (
            <Image
              source={logo}
              className="w-10 h-10 rounded-lg mr-3"
              resizeMode="contain"
            />
          ) : null}
          <ThemedText type="h2" className="text-text">
            {account.name}
          </ThemedText>
          <View className={["h-3 w-3 rounded-full ml-3", statusDotClass(account.spent)].join(" ")} />
        </View>
        <View className="items-end">
          <ThemedText type="h2" className="text-text">
            {formatZar(account.spent)}
          </ThemedText>
          <ThemedText type="small" className="text-text-muted">
            spent
          </ThemedText>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row mt-4 bg-bg-card rounded-xl overflow-hidden self-start">
        {(["Fees", "Debits", "Other"] as const).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              className={[
                "px-4 py-2",
                active ? "bg-accent text-white" : "bg-transparent",
              ].join(" ")}
            >
              <ThemedText
                type="small"
                className={active ? "text-white" : "text-text-muted"}
              >
                {t}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* “Donut” placeholder */}
      <View className="flex-row items-center mt-5">
        <View className="w-24 h-24 rounded-full border-8 border-accent/50 items-center justify-center">
          <View className="w-16 h-16 rounded-full bg-white items-center justify-center">
            <ThemedText type="small" className="text-text">
              {tab}
            </ThemedText>
          </View>
        </View>

        <View className="flex-1 ml-5">
          <ThemedText type="h3" className="text-text">
            {formatZar(selectedTotal)} TOTAL {tab.toUpperCase()}
          </ThemedText>
          <View className="mt-4 gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-3 w-3 rounded-full bg-green-400 mr-3" />
                <ThemedText type="body" className="text-text">
                  Fees
                </ThemedText>
              </View>
              <ThemedText type="body" className="text-text">
                {formatZar(account.fees)}
              </ThemedText>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-3 w-3 rounded-full bg-purple-400 mr-3" />
                <ThemedText type="body" className="text-text">
                  Debits
                </ThemedText>
              </View>
              <ThemedText type="body" className="text-text">
                {formatZar(account.debits)}
              </ThemedText>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="h-3 w-3 rounded-full bg-pink-400 mr-3" />
                <ThemedText type="body" className="text-text">
                  Other
                </ThemedText>
              </View>
              <ThemedText type="body" className="text-text">
                {formatZar(account.other)}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View className="mt-6 gap-3">
        <View className="flex-row gap-3">
          <Pressable
            onPress={onPressPrimary}
            className="flex-1 rounded-2xl py-3 items-center bg-accent"
          >
            <ThemedText type="button" className="text-white">
              Freeze {account.name}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={onPressSecondary}
            className="flex-1 rounded-2xl py-3 items-center bg-accent"
          >
            <ThemedText type="button" className="text-white">
              Pause Debit Orders
            </ThemedText>
          </Pressable>
        </View>
        <Pressable
          onPress={onPressTertiary}
          className="border border-accent rounded-2xl py-3 items-center"
        >
          <ThemedText type="button" className="text-accent">
            Opt Out of Subscriptions
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

