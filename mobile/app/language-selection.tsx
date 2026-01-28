import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { LanguageDropdown } from "@/components/ui/language-dropdown";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Language } from "@/types/navigation";

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function LanguageSelectionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLanguage } = useApp();
  const [selectedLang, setSelectedLang] = useState<Language>("en");

  const logoScale = useSharedValue(0.7);
  const logoRotate = useSharedValue(0);

  useEffect(() => {
    // Continuous, gentle pulse + sway until user navigates away
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.92, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    logoRotate.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { rotateZ: `${logoRotate.value}deg` },
    ],
  }));

  const handleSelectLanguage = async (lang: Language) => {
    setSelectedLang(lang);
  };

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setLanguage(selectedLang);
    router.push("/consent" as any);
  };

  return (
    <ThemedView className="bg-white" style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["7xl"],
            paddingBottom: insets.bottom + Spacing["7xl"],
          },
        ]}
      >
        <Animated.View entering={FadeIn.delay(100)} style={styles.logoContainer}>
          <AnimatedImage
            source={require("../assets/trace-pay logo.png")}
            style={[styles.logo, logoAnimatedStyle]}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <ThemedText type="h1" className="text-text" style={styles.title}>
            Select Your Language
          </ThemedText>
          <ThemedText type="body" className="text-text-muted" style={styles.subtitle}>
            Khetha Ulwimi Lwakho
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.dropdownContainer}>
          <LanguageDropdown
            selectedLanguage={selectedLang}
            onSelect={handleSelectLanguage}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.buttonContainer}>
          <Button
            onPress={handleContinue}
            className="bg-accent"
            textClassName="text-navy"
            testID="button-continue"
          >
            Continue
          </Button>
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
    paddingHorizontal: Spacing["2xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    marginBottom: Spacing["4xl"],
  },
  logo: {
    width: 200,
    height: 200 ,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing["4xl"],
  },
  dropdownContainer: {
    width: "100%",
    marginBottom: Spacing["2xl"],
  },
  buttonContainer: {
    width: "100%",
  },
});
