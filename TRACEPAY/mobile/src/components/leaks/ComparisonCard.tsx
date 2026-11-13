import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import type { ActionDetailContent } from "../../features/leaks/fixContent";
import { COLORS } from "../../theme/colors";
import { neutralCardStyle } from "./LeakFlowShell";

const FALLBACK_HEADERS = ["Nedbank", "Capitec", "TymeBank"];

/** The side-by-side comparison for an action, shown on the same page as the advice. */
export function ComparisonCard({ detail }: { detail: ActionDetailContent }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  if (!detail.compareRows?.length) return null;

  const headers =
    detail.accounts?.slice(0, 3).map((account) => account.name.split(" ")[0] ?? account.name) ??
    FALLBACK_HEADERS;

  return (
    <>
      <Text className="mb-1 mt-7 text-[17px] font-bold text-foreground">How they compare</Text>
      <Text className="text-[13px] leading-5 text-muted-foreground">
        The options side by side.
      </Text>

      <View
        className="mt-3 overflow-hidden rounded-3xl bg-card p-4"
        style={neutralCardStyle(palette)}
      >
        <View className="flex-row">
          <View className="w-[34%]" />
          {headers.map((name) => (
            <View key={name} className="flex-1 items-center">
              <Text className="text-[11px] font-semibold text-foreground">{name}</Text>
            </View>
          ))}
        </View>

        {detail.compareRows.map((row) => (
          <View key={row.label} className="mt-4 flex-row items-center">
            <Text className="w-[34%] text-[12px] text-muted-foreground">{row.label}</Text>
            {row.values.map((value, index) => (
              <Text
                key={`${row.label}-${index}`}
                className="flex-1 text-center text-[12px] font-medium text-foreground"
              >
                {value}
              </Text>
            ))}
          </View>
        ))}
      </View>

    </>
  );
}
