import { Pressable, Text, View } from "react-native";

import { AnimatedBar } from "./AnimatedBar";

export type RankedBarItem = {
  key: string;
  label: string;
  /** Right-hand value, already formatted. */
  value: string;
  /** Small line under the label. */
  caption?: string;
  /** Small line under the value, e.g. a change vs last period. */
  detail?: string;
  detailTone?: "up" | "down" | "neutral";
  /** 0–1 share of the longest bar. */
  ratio: number;
  color: string;
};

type Props = {
  items: RankedBarItem[];
  track: string;
  colors: { up: string; down: string; neutral: string };
  selectedKey?: string | null;
  onPress?: (key: string) => void;
};

function Row({ item, track, colors, index }: { item: RankedBarItem; track: string; colors: Props["colors"]; index: number }) {
  const ratio = Number.isFinite(item.ratio) ? Math.min(Math.max(item.ratio, 0.02), 1) : 0.02;
  return (
    <View>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
            {item.label}
          </Text>
          {item.caption ? (
            <Text className="mt-0.5 text-[12px] text-muted-foreground" numberOfLines={1}>
              {item.caption}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-[14px] font-bold text-foreground">{item.value}</Text>
          {item.detail ? (
            <Text className="mt-0.5 text-[12px] font-medium" style={{ color: colors[item.detailTone ?? "neutral"] }}>
              {item.detail}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="mt-2">
        <AnimatedBar ratio={ratio} color={item.color} track={track} delay={index * 70} />
      </View>
    </View>
  );
}

/** Ranked rows with a proportional bar under each label. */
export function RankedBars({ items, track, colors, selectedKey = null, onPress }: Props) {
  return (
    <View className="gap-4">
      {items.map((item, index) => {
        const dimmed = selectedKey !== null && selectedKey !== item.key;
        const row = (
          <View className={dimmed ? "opacity-40" : ""}>
            <Row item={item} track={track} colors={colors} index={index} />
          </View>
        );
        if (!onPress) return <View key={item.key}>{row}</View>;
        return (
          <Pressable key={item.key} accessibilityRole="button" className="active:opacity-80" onPress={() => onPress(item.key)}>
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}
