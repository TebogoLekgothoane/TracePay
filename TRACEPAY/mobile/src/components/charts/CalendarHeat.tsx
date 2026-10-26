import { Pressable, Text, View } from "react-native";

import type { CalendarDay } from "../../features/insights/insights-analytics";

type Props = {
  days: CalendarDay[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Cell colour at full intensity and the empty cell colour. */
  colors: { hot: string; empty: string; text: string; textOnHot: string };
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function mix(hex: string, alpha: number): string {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Day-by-day spending laid out as a calendar; darker days spent more. */
export function CalendarHeat({ days, selectedKey, onSelect, colors }: Props) {
  if (days.length === 0) return null;
  const max = Math.max(...days.map((day) => day.amount), 1);
  const lead = days[0].weekday;
  const cells: (CalendarDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (CalendarDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));

  return (
    <View>
      <View className="mb-1.5 flex-row">
        {WEEKDAYS.map((label, index) => (
          <Text key={index} className="flex-1 text-center text-[10px] text-muted-foreground">
            {label}
          </Text>
        ))}
      </View>
      <View className="gap-1">
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-1">
            {row.map((day, cellIndex) => {
              if (!day) return <View key={cellIndex} className="h-9 flex-1" />;
              const intensity = day.amount > 0 ? 0.18 + 0.82 * (day.amount / max) : 0;
              const hot = intensity > 0.55;
              const isSelected = selectedKey === day.key;
              return (
                <Pressable
                  key={cellIndex}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.day}, spent ${Math.round(day.amount)} rand`}
                  onPress={() => onSelect(isSelected ? null : day.key)}
                  className="h-9 flex-1 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: day.amount > 0 ? mix(colors.hot, intensity) : colors.empty,
                    opacity: selectedKey && !isSelected ? 0.45 : 1,
                  }}
                >
                  <Text
                    className="text-[11px] font-medium"
                    style={{ color: hot ? colors.textOnHot : colors.text }}
                  >
                    {day.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
