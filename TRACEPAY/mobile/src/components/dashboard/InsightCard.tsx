import { Lightbulb } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

type Props = {
  onViewAll?: () => void;
};

function TransportIllustration() {
  return (
    <Svg width={88} height={64} viewBox="0 0 88 64">
      <Rect x="52" y="10" width="8" height="24" rx="1" fill="#4C1D95" opacity={0.8} />
      <Rect x="62" y="16" width="7" height="18" rx="1" fill="#5B21B6" opacity={0.7} />
      <Rect x="70" y="12" width="6" height="22" rx="1" fill="#6D28D9" opacity={0.6} />
      <Rect x="78" y="18" width="5" height="16" rx="1" fill="#7C3AED" opacity={0.5} />
      <Path
        d="M6 42 H48 C52 42 54 40 54 36 V32 C54 28 51 26 47 26 H26 L20 20 H12 C8 20 6 22 6 26 V42 Z"
        fill="#8B5CF6"
      />
      <Path d="M12 26 H22 L26 30 H12 V26 Z" fill="#C4B5FD" />
      <Path
        d="M14 42 A4 4 0 1 0 14.01 42 M38 42 A4 4 0 1 0 38.01 42"
        fill="#1E1B4B"
      />
      <Rect x="0" y="48" width="88" height="16" fill="#161028" opacity={0.6} />
    </Svg>
  );
}

export function InsightCard({ onViewAll }: Props) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          Insights for you
        </Text>
        <Pressable onPress={onViewAll} className="active:opacity-70">
          <Text className="text-[13px] font-semibold text-primary">View all</Text>
        </Pressable>
      </View>

      <View
        className="flex-row items-center gap-3 rounded-3xl bg-card p-4"
        style={{
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: "rgba(139, 92, 246, 0.2)",
            shadowColor: "#8B5CF6",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
          }}
        >
          <Lightbulb color="#A78BFA" size={22} strokeWidth={2.2} />
        </View>
        <View className="flex-1 pr-1">
          <Text className="text-[14px] leading-5 text-foreground">
            <Text className="font-semibold">
              You spent more on transport{" "}
            </Text>
            <Text className="font-bold">this month.</Text>
          </Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            R320 more than last month
          </Text>
        </View>
        <TransportIllustration />
      </View>
    </View>
  );
}
