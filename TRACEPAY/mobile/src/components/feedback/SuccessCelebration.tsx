import { Check } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Dimensions, Text, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import Animated, { ZoomIn } from "react-native-reanimated";

import { COLORS } from "../../theme/colors";

type Props = {
  title: string;
  subtitle: string;
};

export function SuccessCelebration({ title, subtitle }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const confettiOriginX = Dimensions.get("window").width / 2;

  return (
    <View className="flex-1 items-center justify-center">
      <View pointerEvents="none" className="absolute inset-0">
        <ConfettiCannon
          autoStart
          count={80}
          fadeOut
          origin={{ x: confettiOriginX, y: 0 }}
        />
      </View>

      <Animated.View
        accessibilityLabel="Success"
        className="h-16 w-16 items-center justify-center rounded-full"
        entering={ZoomIn.springify()}
        style={{ backgroundColor: palette.success }}
      >
        <Check color={COLORS.white} size={32} strokeWidth={3} />
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
