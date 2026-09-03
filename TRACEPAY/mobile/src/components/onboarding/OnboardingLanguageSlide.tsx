import { Check } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { memo, useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ONBOARDING_LANGUAGES } from "../../features/onboarding/onboarding.constants";
import type { OnboardingLanguage } from "../../features/onboarding/onboarding.types";
import { COLORS } from "../../theme/colors";

type Props = {
  selectedLanguage: OnboardingLanguage;
  onSelect: (language: string) => void;
};

function LanguageRow({
  language,
  selected,
  onSelect,
  selectedBackground,
  border,
}: {
  language: OnboardingLanguage;
  selected: boolean;
  onSelect: (language: string) => void;
  selectedBackground: string;
  border: string;
}) {
  const handlePress = useCallback(() => {
    onSelect(language);
  }, [language, onSelect]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={language}
      onPress={handlePress}
      className="min-h-[56px] flex-row items-center rounded-2xl px-4 active:opacity-80"
      style={selected ? { backgroundColor: selectedBackground } : undefined}
    >
      <Text className="flex-1 text-[16px] font-semibold text-foreground">
        {language}
      </Text>
      {selected ? (
        <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
          <Check color={COLORS.white} size={14} strokeWidth={3} />
        </View>
      ) : (
        <View
          className="h-6 w-6 rounded-full border-2"
          style={{ borderColor: border }}
        />
      )}
    </Pressable>
  );
}

function OnboardingLanguageSlideComponent({
  selectedLanguage,
  onSelect,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="flex-1">
      <Text className="text-center text-[28px] font-bold leading-[34px] tracking-[-0.6px] text-foreground">
        Pick your language
      </Text>
      <Text className="mt-2 pb-2 text-center text-[15px] leading-[22px] text-muted-foreground">
        You can change this later
      </Text>

      <ScrollView
        className="mt-6 flex-1"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View accessibilityRole="radiogroup" className="gap-1.5 pb-2">
          {ONBOARDING_LANGUAGES.map((language) => (
            <LanguageRow
              key={language}
              language={language}
              selected={language === selectedLanguage}
              onSelect={onSelect}
              selectedBackground={palette.surfaceSoft}
              border={palette.placeholder}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export const OnboardingLanguageSlide = memo(OnboardingLanguageSlideComponent);
