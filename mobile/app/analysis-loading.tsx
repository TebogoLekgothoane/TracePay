import React, { useEffect, useState } from "react";
import { View, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  FadeInUp,
} from "react-native-reanimated";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing } from "@/constants/theme";
import { Button } from "@/components/ui/button";

export default function AnalysisLoadingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, setAnalysisData, setIsAnalysisComplete } = useApp();
  const [analysisError, setAnalysisError] = useState(false);

  const pulseScale = useSharedValue(1);
  const dotOpacity1 = useSharedValue(0.3);
  const dotOpacity2 = useSharedValue(0.3);
  const dotOpacity3 = useSharedValue(0.3);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    dotOpacity1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ),
      -1,
      false
    );

    setTimeout(() => {
      dotOpacity2.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      );
    }, 200);

    setTimeout(() => {
      dotOpacity3.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      );
    }, 400);

    // No backend: just redirect to home after a short delay (no fetch).
    const timer = setTimeout(() => {
      setAnalysisData(null);
      setIsAnalysisComplete(true);
      router.replace("/(tabs)/home" as any);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const dot1Style = useAnimatedStyle(() => ({
    opacity: dotOpacity1.value,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: dotOpacity2.value,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: dotOpacity3.value,
  }));

  return (
    <ThemedView className="flex-1 bg-bg">
      <View
        className="flex-1 items-center justify-center px-6"
        style={{
          paddingTop: insets.top + Spacing["6xl"],
          paddingBottom: insets.bottom + Spacing["6xl"],
        }}
      >
        <Animated.View entering={FadeIn.delay(100)} className="mb-10">
          <Animated.View style={pulseStyle}>
            <Image
              source={require("../assets/trace-pay logo.png")}
              className="w-[180px] h-[180px]"
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(300).springify()}
          className="items-center"
        >
          <View className="flex-row items-center mb-3">
            <ThemedText type="h1" className="text-text text-center text-[32px] leading-10 font-bold">
              {t("analyzing")}
            </ThemedText>
            <View className="flex-row ml-1 gap-1">
              <Animated.View
                style={[dot1Style]}
                className="w-1.5 h-1.5 rounded-full bg-accent"
              />
              <Animated.View
                style={[dot2Style]}
                className="w-1.5 h-1.5 rounded-full bg-accent"
              />
              <Animated.View
                style={[dot3Style]}
                className="w-1.5 h-1.5 rounded-full bg-accent"
              />
            </View>
          </View>
          <ThemedText
            type="body"
            className="text-text-muted text-center"
          >
            {t("analyzingDetail")}
          </ThemedText>
          {analysisError ? (
            <View className="mt-6 items-center">
              <ThemedText type="body" className="text-text-muted text-center mb-3">
                Could not load analysis. Check your connection and try again.
              </ThemedText>
              <Button
                onPress={() => {
                  setAnalysisError(false);
                  setAnalysisData(null);
                  setIsAnalysisComplete(true);
                  router.replace("/(tabs)/home" as any);
                }}
                className="bg-accent"
                textClassName="text-white"
              >
                Retry
              </Button>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </ThemedView>
  );
}
