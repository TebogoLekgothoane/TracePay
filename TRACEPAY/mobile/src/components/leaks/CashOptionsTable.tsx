import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import {
  CASH_COMPARISON_AS_OF,
  CASH_COMPARISON_DISCLAIMER,
  CASH_OPTIONS,
} from "../../features/leaks/cash-comparison";
import { COLORS, withAlpha } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";
import { neutralCardStyle } from "./LeakFlowShell";

/** The ways to get cash and what each costs, so the choice is visible on the advice page. */
export function CashOptionsTable() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const card = neutralCardStyle(palette);

  return (
    <View>
      <View className="mt-4 overflow-hidden rounded-3xl bg-card" style={card}>
        {CASH_OPTIONS.map((item, index) => (
          <View
            key={item.id}
            className="flex-row items-start gap-3 px-4 py-3.5"
            style={index > 0 ? { borderTopWidth: 1, borderTopColor: card.borderColor } : undefined}
          >
            {item.logoDomain ? (
              <BrandLogo
                name={item.name}
                logoDomain={item.logoDomain}
                size={36}
                fallbackColor={palette.primary}
                shape="squircle"
              />
            ) : (
              <View
                className="h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: withAlpha(palette.foreground, 0.07) }}
              >
                <Text className="text-[13px] font-bold text-foreground">ATM</Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-foreground">{item.name}</Text>
              <Text className="mt-1 text-[12px] leading-[17px] text-muted-foreground">
                {item.note}
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">{item.source}</Text>
            </View>
            <View className="max-w-[112px] items-end">
              <Text className="text-right text-[14px] font-bold text-foreground">{item.cost}</Text>
              <Text className="mt-0.5 text-right text-[11px] text-muted-foreground">
                {item.costNote}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-4 rounded-3xl bg-card p-4" style={card}>
        <Text className="text-[12px] font-semibold text-foreground">
          About these figures · {CASH_COMPARISON_AS_OF}
        </Text>
        <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {CASH_COMPARISON_DISCLAIMER}
        </Text>
      </View>
    </View>
  );
}
