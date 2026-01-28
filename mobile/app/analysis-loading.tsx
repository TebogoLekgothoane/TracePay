import React, { useEffect } from "react";
import { View, StyleSheet, Image } from "react-native";
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
import { mockAnalysisData, mockAnalysisDataWithMomo } from "@/data/mock-analysis";

export default function AnalysisLoadingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { t, setAnalysisData, setIsAnalysisComplete, includeMomoData } = useApp();

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

    const timer = setTimeout(() => {
      const data = includeMomoData ? mockAnalysisDataWithMomo : mockAnalysisData;
      setAnalysisData(data);
      setIsAnalysisComplete(true);
      router.replace("/(tabs)/home" as any);
    }, 3000);

    return () => clearTimeout(timer);
  }, [includeMomoData]);

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
    <ThemedView className="bg-bg" style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["6xl"],
            paddingBottom: insets.bottom + Spacing["6xl"],
          },
        ]}
      >
        <Animated.View entering={FadeIn.delay(100)} style={styles.imageContainer}>
          <Animated.View style={pulseStyle}>
            <Image
              source={require("../assets/trace-pay logo.png")}
              style={styles.loadingImage}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(300).springify()}
          style={styles.textContainer}
        >
          <View style={styles.loadingTextContainer}>
            <ThemedText type="h1" className="text-text" style={styles.loadingText}>
              {t("analyzing")}
            </ThemedText>
            <View style={styles.dotsContainer}>
              <Animated.View
                style={[
                  styles.dot,
                  dot1Style,
                ]}
                className="bg-accent"
              />
              <Animated.View
                style={[
                  styles.dot,
                  dot2Style,
                ]}
                className="bg-accent"
              />
              <Animated.View
                style={[
                  styles.dot,
                  dot3Style,
                ]}
                className="bg-accent"
              />
            </View>
          </View>
          <ThemedText
            type="body"
            className="text-text-muted"
            style={styles.detailText}
          >
            {t("analyzingDetail")}
          </ThemedText>
        </Animated.View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  imageContainer: {
    marginBottom: Spacing["4xl"],
  },
  loadingImage: {
    width: 180,
    height: 180,
  },
  textContainer: {
    alignItems: "center",
  },
  loadingTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  loadingText: {
    textAlign: "center",
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700",
  },
  dotsContainer: {
    flexDirection: "row",
    marginLeft: Spacing.xs,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailText: {
    textAlign: "center",
  },
});
