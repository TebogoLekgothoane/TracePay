import type { LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

export type LeakPreview = {
  id: string;
  title: string;
  amount: string;
  change: string;
  Icon: LucideIcon;
  tint: string;
  tintBg: string;
};

type Props = {
  items: LeakPreview[];
  onItemPress?: (item: LeakPreview) => void;
};

export function LeakSummary({ items, onItemPress }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingRight: 8 }}
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onItemPress?.(item)}
          className="w-[148px] rounded-2xl bg-card p-3.5 active:opacity-80"
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <View
            className="mb-3 h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: item.tintBg }}
          >
            <item.Icon color={item.tint} size={18} strokeWidth={2.2} />
          </View>
          <Text className="text-[13px] font-medium text-muted-foreground">
            {item.title}
          </Text>
          <Text className="mt-1 text-[18px] font-bold tracking-[-0.3px] text-foreground">
            {item.amount}
          </Text>
          <Text className="mt-1 text-[12px] font-semibold text-red-400">
            {item.change}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
