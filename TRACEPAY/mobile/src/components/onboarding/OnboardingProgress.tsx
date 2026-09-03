import { useColorScheme } from "nativewind";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { ONBOARDING_PAGINATION_INDICES } from "../../features/onboarding/onboarding.constants";
import { COLORS } from "../../theme/colors";

const DOT_SIZE = 8;

type DotProps = {
  index: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  onPress: (index: number) => void;
};

function PaginationDot({
  index,
  pageWidth,
  scrollX,
  activeColor,
  inactiveColor,
  onPress,
}: DotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollX.value,
      [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    return {
      backgroundColor: interpolateColor(progress, [0, 1], [
        inactiveColor,
        activeColor,
      ]),
      transform: [{ scale: 1 + progress * 0.18 }],
    };
  });

  const handlePress = useCallback(() => {
    onPress(index);
  }, [index, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Go to onboarding step ${index + 1}`}
      hitSlop={10}
      onPress={handlePress}
      className="h-8 w-6 items-center justify-center"
    >
      <Animated.View
        className="rounded-full"
        style={[{ width: DOT_SIZE, height: DOT_SIZE }, animatedStyle]}
      />
    </Pressable>
  );
}

type Props = {
  pageWidth: number;
  scrollX: SharedValue<number>;
  onDotPress: (index: number) => void;
};

function OnboardingPaginationComponent({
  pageWidth,
  scrollX,
  onDotPress,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const inactiveColor =
    colorScheme === "dark" ? "rgba(167, 139, 250, 0.28)" : "rgb(226, 220, 242)";

  return (
    <View
      accessibilityRole="tablist"
      className="h-8 flex-row items-center justify-center"
    >
      {ONBOARDING_PAGINATION_INDICES.map((index) => (
        <PaginationDot
          key={index}
          index={index}
          pageWidth={pageWidth}
          scrollX={scrollX}
          activeColor={palette.primary}
          inactiveColor={inactiveColor}
          onPress={onDotPress}
        />
      ))}
    </View>
  );
}

export const OnboardingPagination = memo(OnboardingPaginationComponent);
