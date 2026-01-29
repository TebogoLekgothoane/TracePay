import React, { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/keyboard-aware-scrollview";

export default function VoiceModalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { t, language, analysisData } = useApp();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const waveScale1 = useSharedValue(1);
  const waveScale2 = useSharedValue(1);
  const waveScale3 = useSharedValue(1);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      waveScale1.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );

      setTimeout(() => {
        waveScale2.value = withRepeat(
          withSequence(
            withTiming(1.5, { duration: 400, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        );
      }, 100);

      setTimeout(() => {
        waveScale3.value = withRepeat(
          withSequence(
            withTiming(1.4, { duration: 350, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 350, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        );
      }, 200);
    } else {
      waveScale1.value = withTiming(1, { duration: 200 });
      waveScale2.value = withTiming(1, { duration: 200 });
      waveScale3.value = withTiming(1, { duration: 200 });
    }
  }, [isPlaying]);

  const wave1Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: waveScale1.value }],
  }));

  const wave2Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: waveScale2.value }],
  }));

  const wave3Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: waveScale3.value }],
  }));

  const summaryText = analysisData?.summary[language as "en" | "xh"] || analysisData?.summary.en || "";

  const handlePlayPause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isPlaying) {
      await Speech.stop();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      const langCode = language === "xh" ? "xh-ZA" : "en-ZA";
      
      if (!summaryText) {
        setIsLoading(false);
        return;
      }
      
      Speech.speak(summaryText, {
        language: langCode,
        rate: 0.9,
        onStart: () => {
          setIsLoading(false);
          setIsPlaying(true);
        },
        onDone: () => {
          setIsPlaying(false);
        },
        onStopped: () => {
          setIsPlaying(false);
        },
        onError: () => {
          setIsLoading(false);
          setIsPlaying(false);
        },
      });
    }
  };

  const handleClose = () => {
    Speech.stop();
    router.back();
  };

  return (
    <ThemedView className="flex-1">
      <View
        className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200/10"
        style={{ paddingTop: insets.top + Spacing.sm }}
      >
        <ThemedText type="h3" className="text-text">{t("voiceExplanation")}</ThemedText>
        <Pressable
          onPress={handleClose}
          className="p-1 active:opacity-60"
          testID="button-close-voice"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing["3xl"],
          paddingBottom: insets.bottom + Spacing["6xl"],
          alignItems: "center",
        }}
      >
        <Animated.View
          entering={FadeIn.delay(100)}
          className="mb-6"
        >
          <Image
            source={require("../assets/images/voice-avatar.png")}
            className="w-[120px] h-[120px]"
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).springify()}>
          <Pressable
            onPress={handlePlayPause}
            disabled={isLoading}
            className="mb-8 active:scale-[0.97]"
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.97 : 1 }],
              opacity: isLoading ? 0.7 : 1,
            })}
            testID="button-play-audio"
          >
            <View className="flex-row items-center gap-2 h-[60px]">
              <Animated.View
                className="w-1.5 h-6 rounded"
                style={[
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave1Style,
                ]}
              />
              <Animated.View
                className="w-1.5 h-10 rounded"
                style={[
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave2Style,
                ]}
              />
              <Animated.View
                className="w-1.5 h-6 rounded"
                style={[
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave3Style,
                ]}
              />
              <Animated.View
                className="w-1.5 h-10 rounded"
                style={[
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave1Style,
                ]}
              />
              <Animated.View
                className="w-1.5 h-6 rounded"
                style={[
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave2Style,
                ]}
              />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(400).springify()}
          className="w-full"
        >
          <ThemedText
            type="small"
            className="mb-2 uppercase tracking-wide text-xs"
            style={{ color: theme.textSecondary }}
          >
            Transcript (with PLAY button)
          </ThemedText>
          <ThemedText type="body" className="leading-[26px] text-text">
            {summaryText}
          </ThemedText>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </ThemedView>
  );
}
