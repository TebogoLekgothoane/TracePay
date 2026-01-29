import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
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
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
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
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.sm,
          },
        ]}
      >
        <ThemedText type="h3">{t("voiceExplanation")}</ThemedText>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
          testID="button-close-voice"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing["6xl"] },
        ]}
      >
        <Animated.View
          entering={FadeIn.delay(100)}
          style={styles.avatarContainer}
        >
          <Image
            source={require("../assets/images/voice-avatar.png")}
            style={styles.avatarImage}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).springify()}>
          <Pressable
            onPress={handlePlayPause}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.waveformContainer,
              {
                transform: [{ scale: pressed ? 0.97 : 1 }],
                opacity: isLoading ? 0.7 : 1,
              },
            ]}
            testID="button-play-audio"
          >
            <View style={styles.waveform}>
              <Animated.View
                style={[
                  styles.waveBar,
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave1Style,
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  styles.waveBarTall,
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave2Style,
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave3Style,
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  styles.waveBarTall,
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave1Style,
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                  wave2Style,
                ]}
              />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(400).springify()}
          style={styles.transcriptContainer}
        >
          <ThemedText
  type="small"
  style={[styles.transcriptLabel, { color: theme.textSecondary }]}
>
  Transcript (with PLAY button)
</ThemedText>
          <ThemedText type="body" style={styles.transcriptText}>
            {summaryText}
          </ThemedText>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing["3xl"],
    alignItems: "center",
  },
  avatarContainer: {
    marginBottom: Spacing["2xl"],
  },
  avatarImage: {
    width: 120,
    height: 120,
  },
  waveformContainer: {
    marginBottom: Spacing["3xl"],
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 60,
  },
  waveBar: {
    width: 6,
    height: 24,
    borderRadius: 3,
  },
  waveBarTall: {
    height: 40,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["3xl"],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  transcriptContainer: {
    width: "100%",
  },
  transcriptLabel: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
  },
  transcriptText: {
    lineHeight: 26,
  },
});
