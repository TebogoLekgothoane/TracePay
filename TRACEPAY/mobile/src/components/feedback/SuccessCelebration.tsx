import { Check } from "lucide-react-native";
import { Text, useWindowDimensions, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import Animated, { ZoomIn } from "react-native-reanimated";

type Props = {
  title: string;
  subtitle: string;
};

export function SuccessCelebration({ title, subtitle }: Props) {
  const { width } = useWindowDimensions();

  return (
    <View className="flex-1 items-center justify-center">
      <View pointerEvents="none" className="absolute inset-0">
        <ConfettiCannon autoStart count={80} fadeOut origin={{ x: width / 2, y: 0 }} />
      </View>

      <Animated.View
        accessibilityLabel="Success"
        className="h-16 w-16 items-center justify-center rounded-full bg-[#22C55E]"
        entering={ZoomIn.springify()}
      >
        <Check color="#FFFFFF" size={32} strokeWidth={3} />
      </Animated.View>

      <Text className="mt-6 text-center text-[28px] font-bold tracking-[-0.6px] text-foreground">
        {title}
      </Text>
      <Text className="mt-2.5 max-w-[320px] text-center text-[15px] leading-[22px] text-muted-foreground">
        {subtitle}
      </Text>
    </View>
  );
}
