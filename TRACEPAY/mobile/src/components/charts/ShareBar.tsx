import { Text, View } from "react-native";

type Props = {
  segments: { color: string; value: number }[];
  /** Small caption above the bar, e.g. "Total". */
  label: string;
  /** Large figure beside the caption, already formatted. */
  total: string;
  /** Index of the highlighted segment; others are dimmed. */
  highlight?: number | null;
  height?: number;
};

/**
 * One stacked bar for a whole: each category's share of the total, side by side.
 * Plain and exact, so the lengths can be compared directly (a ring makes that harder).
 */
export function ShareBar({ segments, label, total, highlight = null, height = 10 }: Props) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0) || 1;

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[12px] text-muted-foreground">{label}</Text>
        <Text className="text-[22px] font-bold tracking-[-0.5px] text-foreground">{total}</Text>
      </View>
      <View className="mt-3 flex-row" style={{ height, gap: 2 }}>
        {segments.map((segment, index) => (
          <View
            key={index}
            style={{
              flex: Math.max(segment.value / sum, 0.01),
              backgroundColor: segment.color,
              opacity: highlight === null || highlight === index ? 1 : 0.3,
              borderRadius: 3,
            }}
          />
        ))}
      </View>
    </View>
  );
}
