import { router } from "expo-router";
import { Check, ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import {
  DEFAULT_ONBOARDING_LANGUAGE,
  ONBOARDING_LANGUAGES,
} from "../../src/features/onboarding/onboarding.constants";
import {
  isOnboardingLanguage,
  loadOnboardingLanguage,
  persistOnboardingLanguage,
} from "../../src/features/onboarding/onboarding.service";
import { setOnboardingLanguage } from "../../src/features/onboarding/onboarding.store";
import type { OnboardingLanguage } from "../../src/features/onboarding/onboarding.types";
import { COLORS } from "../../src/theme/colors";

export default function LanguageSettingsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [selected, setSelected] = useState<OnboardingLanguage>(
    DEFAULT_ONBOARDING_LANGUAGE,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadOnboardingLanguage()
      .then((language) => {
        if (active) {
          setSelected(language);
          setOnboardingLanguage(language);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelect = (language: OnboardingLanguage) => {
    if (saving || loading || language === selected) {
      return;
    }

    const previous = selected;
    setSelected(language);
    setSaving(true);

    void (async () => {
      try {
        await persistOnboardingLanguage(language);
        setOnboardingLanguage(language);
        if (mountedRef.current) {
          router.back();
        }
      } catch {
        if (!mountedRef.current) {
          return;
        }
        setSelected(previous);
        Alert.alert(
          "Could not save language",
          "Please try again in a moment.",
        );
      } finally {
        if (mountedRef.current) {
          setSaving(false);
        }
      }
    })();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton
              accessibilityLabel="Go back"
              variant="ghost"
              onPress={() => router.back()}
            >
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-foreground">
                Language
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Choose your preferred TracePay language
              </Text>
            </View>
          </View>

          <Text className="mt-5 text-[13px] leading-5 text-muted-foreground">
            This sets your language preference for TracePay on this device.
            Full translations roll out language by language.
          </Text>

          <View className="mt-5 overflow-hidden rounded-3xl bg-card">
            {ONBOARDING_LANGUAGES.map((language, index) => {
              const isSelected = language === selected;
              return (
                <Pressable
                  key={language}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  disabled={loading || saving}
                  onPress={() => {
                    if (isOnboardingLanguage(language)) {
                      handleSelect(language);
                    }
                  }}
                  className={`min-h-[56px] flex-row items-center px-4 active:opacity-75 ${
                    index < ONBOARDING_LANGUAGES.length - 1
                      ? "border-b border-border/50"
                      : ""
                  } ${isSelected ? "bg-primary/10" : ""} ${
                    loading || saving ? "opacity-60" : ""
                  }`}
                >
                  <Text className="flex-1 text-[16px] font-semibold text-foreground">
                    {language}
                  </Text>
                  {isSelected ? (
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                      <Check color={COLORS.white} size={14} strokeWidth={3} />
                    </View>
                  ) : (
                    <View className="h-6 w-6 rounded-full border-2 border-border" />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
