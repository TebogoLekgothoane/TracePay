import { memo, useCallback, useState } from "react";
import {
  type LayoutChangeEvent,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import type {
  OnboardingIllustration,
  OnboardingInfoSlide,
} from "../../features/onboarding/onboarding.types";

type Props = {
  slide: OnboardingInfoSlide;
  index: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
};

function fitContain(
  maxWidth: number,
  maxHeight: number,
  aspectRatio: number,
): { width: number; height: number } {
  if (maxWidth <= 0 || maxHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const heightFromWidth = maxWidth / aspectRatio;
  if (heightFromWidth <= maxHeight) {
    return { width: maxWidth, height: heightFromWidth };
  }

  return { width: maxHeight * aspectRatio, height: maxHeight };
}

function IllustrationFrame({
  Illustration,
  aspectRatio,
}: {
  Illustration: OnboardingIllustration;
  aspectRatio: number;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  const size = fitContain(frame.width, frame.height, aspectRatio);

  return (
    <View
      accessible={false}
      className="h-full w-full items-center justify-center"
      onLayout={handleLayout}
    >
      {size.width > 0 ? (
        <Illustration
          width={size.width}
          height={size.height}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
    </View>
  );
}

function OnboardingInfoSlideComponent({
  slide,
  index,
  pageWidth,
  scrollX,
}: Props) {
  const illustrationStyle = useAnimatedStyle(() => {
    const progress =
      (scrollX.value - index * pageWidth) / Math.max(pageWidth, 1);

    return {
      opacity: interpolate(
        Math.abs(progress),
        [0, 1],
        [1, 0.78],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            Math.abs(progress),
            [0, 1],
            [1, 0.96],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <View className="flex-1">
      <Animated.View
        className="min-h-[220px] flex-1 items-center justify-center"
        style={illustrationStyle}
      >
        <IllustrationFrame
          Illustration={slide.Illustration}
          aspectRatio={slide.aspectRatio}
        />
      </Animated.View>

      <Text className="mt-2 px-2 text-center text-[28px] font-bold leading-[34px] tracking-[-0.6px] text-foreground">
        {slide.title}
      </Text>
      <Text className="mt-3 px-3 pb-2 text-center text-[15px] leading-[22px] text-muted-foreground">
        {slide.description}
      </Text>
    </View>
  );
}

export const OnboardingInfoSlideView = memo(OnboardingInfoSlideComponent);
