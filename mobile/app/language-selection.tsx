import React, { useEffect, useState } from "react";
import { View, Image } from "react-native";
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
import { Spacing } from "@/constants/theme";
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
    setLanguage(selectedLang);
    router.push("/consent" as any);
  };

  return (
    <ThemedView className="flex-1 bg-white">
      <View
        className="flex-1 px-6 items-center justify-center"
        style={{
          paddingTop: insets.top + Spacing["7xl"],
          paddingBottom: insets.bottom + Spacing["7xl"],
        }}
      >
        <Animated.View entering={FadeIn.delay(100)} className="mb-10">
          <AnimatedImage
            source={require("../assets/trace-pay logo.png")}
            className="w-[200px] h-[200px]"
            style={logoAnimatedStyle}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <ThemedText type="h1" className="text-text text-center mb-2">
            Select Your Language
          </ThemedText>
          <ThemedText type="body" className="text-text-muted text-center mb-10">
            Khetha Ulwimi Lwakho
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} className="w-full mb-6">
          <LanguageDropdown
            selectedLanguage={selectedLang}
            onSelect={handleSelectLanguage}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()} className="w-full">
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
