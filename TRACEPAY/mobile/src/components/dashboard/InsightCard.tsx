import { Lightbulb } from "lucide-react-native";
import { Image, Text, View } from "react-native";

import { TRANSPORT_INSIGHT_URL } from "../../features/assets/app-assets";
import { Button } from "../ui/Button";

type Props = {
  onViewAll?: () => void;
};

export function InsightCard({ onViewAll }: Props) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold text-foreground">
          Insights for you
        </Text>
        <Button onPress={onViewAll} size="sm" variant="ghost" className="px-0">
          View all
        </Button>
      </View>

      <View
        className="flex-row items-center gap-3 rounded-3xl bg-card p-4"
        style={{
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <View className="h-11 w-11 items-center justify-center rounded-full">
          <Lightbulb color="#9A6CFF" size={22} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1 pr-1">
          <Text className="text-[14px] leading-5 text-foreground">
            <Text className="font-semibold">You spent more on transport </Text>
            <Text className="font-bold">this month.</Text>
          </Text>
          <Text className="mt-1 text-[12px] text-muted-foreground">
            R320 more than last month
          </Text>
        </View>
        {TRANSPORT_INSIGHT_URL ? (
          <Image
            source={{ uri: TRANSPORT_INSIGHT_URL }}
            style={{ width: 96, height: 72 }}
            resizeMode="contain"
            accessibilityLabel="Transport spending illustration"
          />
        ) : null}
      </View>
    </View>
  );
}
