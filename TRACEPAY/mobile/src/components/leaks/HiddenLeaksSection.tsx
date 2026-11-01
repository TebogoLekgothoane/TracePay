import { ChevronRight, Lock, TriangleAlert } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { type HiddenLeak, yearlyCost } from "../../features/leaks/hidden-leaks";
import { COLORS, withAlpha } from "../../theme/colors";
import { Smudge, usePulse } from "./Smudge";
import { formatRand } from "../../features/transactions/transaction.totals";

type Props = {
  leaks: HiddenLeak[];
  /** Accent colour for the category, so the cards match the page. */
  color: string;
  /** Opens the step-by-step guide for this category. The link is hidden when omitted. */
  onOpenGuide?: () => void;
  /** Blurs each leak's details until the full analysis is paid for. */
  locked?: boolean;
  onUnlock?: () => void;
};

/** Leaks found in this category that people rarely notice on their own. */
export function HiddenLeaksSection({ leaks, color, onOpenGuide, locked = false, onUnlock }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const pulse = usePulse();

  if (leaks.length === 0) return null;

  return (
    <View>
      <Text className="mb-1 mt-8 text-[17px] font-bold text-foreground">
        {leaks.length === 1 ? "Leak found" : "Leaks found"}
      </Text>
      <Text className="mb-4 text-[13px] leading-5 text-muted-foreground">
        Charges most people never notice, found in your transactions.
      </Text>

      <View className="gap-3">
        {leaks.map((leak) =>
          locked ? (
            <Pressable
              key={leak.id}
              accessibilityRole="button"
              accessibilityLabel="Locked leak. Unlock to see this leak."
              onPress={onUnlock}
              className="rounded-3xl bg-card p-4 active:opacity-80"
            >
              <View className="flex-row items-center justify-between">
                <Smudge width={110} height={10} color={color} pulse={pulse} />
                <Lock color={palette.mutedForeground} size={15} strokeWidth={2.4} />
              </View>
              <View className="mt-3 gap-2">
                <Smudge width={200} height={14} color={palette.foreground} pulse={pulse} />
                <Smudge width={240} height={10} color={palette.mutedForeground} pulse={pulse} />
                <Smudge width={180} height={10} color={palette.mutedForeground} pulse={pulse} />
              </View>
              <View className="mt-4 flex-row items-end justify-between gap-3 border-t border-border/60 pt-3">
                <Smudge width={130} height={9} color={palette.mutedForeground} pulse={pulse} />
                <View className="items-end">
                  <Text className="text-[18px] font-bold tracking-[-0.3px] text-foreground">
                    {formatRand(yearlyCost(leak)).replace(/\.00$/, "")}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">a year</Text>
                </View>
              </View>
            </Pressable>
          ) : (
          <View key={leak.id} className="rounded-3xl bg-card p-4">
            <View className="flex-row items-center gap-2">
              <View
                className="h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: withAlpha(color, 0.15) }}
              >
                <TriangleAlert color={color} size={15} strokeWidth={2.3} />
              </View>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.6px]" style={{ color }}>
                Leak found
              </Text>
            </View>

            <Text className="mt-3 text-[16px] font-bold leading-[22px] text-foreground">{leak.title}</Text>
            <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{leak.detail}</Text>

            <View className="mt-4 flex-row items-end justify-between gap-3 border-t border-border/60 pt-3">
              <Text className="min-w-0 flex-1 text-[12px] leading-4 text-muted-foreground">
                {leak.evidence}
              </Text>
              <View className="items-end">
                <Text className="text-[18px] font-bold tracking-[-0.3px] text-foreground">
                  {formatRand(yearlyCost(leak)).replace(/\.00$/, "")}
                </Text>
                <Text className="text-[11px] text-muted-foreground">a year</Text>
              </View>
            </View>

            {onOpenGuide ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See how to stop: ${leak.title}`}
                className="mt-3 flex-row items-center gap-1 self-start active:opacity-70"
                hitSlop={8}
                onPress={onOpenGuide}
              >
                <Text className="text-[13px] font-semibold" style={{ color }}>
                  See how to stop this
                </Text>
                <ChevronRight color={color} size={15} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          ),
        )}
      </View>
    </View>
  );
}
