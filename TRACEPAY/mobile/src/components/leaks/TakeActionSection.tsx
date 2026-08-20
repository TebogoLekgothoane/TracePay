import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight, CreditCard, RefreshCw, Wand2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import {
  COLORS,
  TRACEPAY,
  type ImpactTone,
  getImpactToneStyles,
  withAlpha,
} from "../../theme/colors";

const SECONDARY_ACTIONS: {
  id: string;
  title: string;
  savings: string;
  impact: ImpactTone;
  Icon: LucideIcon;
}[] = [
  {
    id: "subs",
    title: "Review subscriptions",
    savings: "Save up to R430.00",
    impact: "mediumWarm",
    Icon: RefreshCw,
  },
  {
    id: "debit",
    title: "Manage debit orders",
    savings: "Save up to R320.75",
    impact: "mediumCool",
    Icon: CreditCard,
  },
];

export function TakeActionSection() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];

  return (
    <View>
      <Text className="text-[17px] font-bold text-foreground">
        Take action 💪
      </Text>
      <Text className="mt-1 text-[13px] text-muted-foreground">
        Quick steps to stop leaking money
      </Text>

      <View
        className="mt-4 flex-row items-center gap-3 rounded-3xl p-4"
        style={{ backgroundColor: palette.surfaceSoft }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(palette.primary, 0.15) }}
        >
          <Wand2 color={palette.primary} size={22} strokeWidth={2.2} />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-primary">
            Save up to R712.50
          </Text>
          <Text className="mt-0.5 text-[12px] text-muted-foreground">
            Stop unnecessary bank fees
          </Text>
        </View>

        <View className="items-center">
          <Pressable
            onPress={() => router.push("/leak/fees/fix")}
            className="overflow-hidden rounded-xl active:opacity-85"
          >
            <LinearGradient
              colors={[trace.splashPayStart, trace.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text
                style={{ color: trace.primaryForeground }}
                className="text-[13px] font-semibold"
              >
                Fix now
              </Text>
            </LinearGradient>
          </Pressable>
          <Text className="mt-1 text-[10px] text-muted-foreground">
            2 min setup
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row gap-3">
          {SECONDARY_ACTIONS.map((action) => {
          const impact = getImpactToneStyles(scheme, action.impact);

          return (
            <Pressable
              key={action.id}
              onPress={() => router.push(`/leak/${action.id}`)}
              className="min-h-[108px] flex-1 flex-row items-center gap-2.5 rounded-2xl bg-muted p-3.5 active:opacity-80"
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: impact.surface }}
              >
                <action.Icon color={impact.color} size={18} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-foreground">
                  {action.title}
                </Text>
                <Text className="mt-1 text-[11px] text-muted-foreground">
                  {action.savings}
                </Text>
              </View>
              <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
