import { Text, View } from "react-native";

/** Fixed-width right column so amounts line up whatever the title length. */
export const LEAK_AMOUNT_WIDTH = 84;

export function LeakAmount({ amount }: { amount: string }) {
  const [value, unit] = amount.split(/\s*\/\s*/);
  return (
    <View style={{ width: LEAK_AMOUNT_WIDTH, alignItems: "flex-end" }}>
      <Text numberOfLines={1} adjustsFontSizeToFit className="text-[19px] font-bold text-foreground">
        {value}
      </Text>
      <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
        {unit ? `per ${unit}` : "per month"}
      </Text>
    </View>
  );
}
