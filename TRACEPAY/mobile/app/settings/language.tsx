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
import { DEFAULT_ONBOARDING_LANGUAGE } from "../../src/features/onboarding/onboarding.constants";
import {
  isOnboardingLanguage,
  loadOnboardingLanguage,
  persistOnboardingLanguage,
} from "../../src/features/onboarding/onboarding.service";
import { setOnboardingLanguage } from "../../src/features/onboarding/onboarding.store";
import type { OnboardingLanguage } from "../../src/features/onboarding/onboarding.types";
import { COLORS } from "../../src/theme/colors";

type LanguageOption = {
  id: OnboardingLanguage;
  title: string;
  subtitle?: string;
};

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { id: "English", title: "English" },
  { id: "isiXhosa", title: "isiXhosa", subtitle: "Xhosa" },
  { id: "Afrikaans", title: "Afrikaans" },
  { id: "Sesotho", title: "Sesotho", subtitle: "Southern Sotho" },
  { id: "Setswana", title: "Setswana", subtitle: "Tswana" },
  { id: "isiZulu", title: "isiZulu", subtitle: "Zulu" },
];

function LanguageRow({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: LanguageOption;
  selected: boolean;
  disabled: boolean;
  onSelect: (language: OnboardingLanguage) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={
        option.subtitle ? `${option.title}, ${option.subtitle}` : option.title
      }
      disabled={disabled}
      onPress={() => onSelect(option.id)}
      className="min-h-[56px] flex-row items-center gap-3 px-4 active:opacity-70"
    >
      <View className="min-w-0 flex-1 py-3">
        <Text className="text-[16px] font-medium text-foreground">
          {option.title}
        </Text>
        {option.subtitle ? (
          <Text className="mt-0.5 text-[13px] text-muted-foreground">
            {option.subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Check color={palette.primary} size={20} strokeWidth={2.4} />
      ) : (
        <View className="h-5 w-5" />
      )}
    </Pressable>
  );
}

export default function LanguageSettingsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [selected, setSelected] = useState<OnboardingLanguage>(
    DEFAULT_ONBOARDING_LANGUAGE,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

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
        if (!active) {
          return;
        }
        setSelected(language);
        setOnboardingLanguage(language);
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
    if (!isOnboardingLanguage(language) || saving || loading || language === selected) {
      return;
    }

    const previous = selected;
    const requestId = ++requestIdRef.current;
    setSelected(language);
    setSaving(true);

    void (async () => {
      try {
        await persistOnboardingLanguage(language);
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setOnboardingLanguage(language);
      } catch {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setSelected(previous);
        Alert.alert(
          "Could not save language",
          "Please try again in a moment.",
        );
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setSaving(false);
        }
      }
    })();
  };

  const busy = loading || saving;

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
            <Text className="flex-1 text-[24px] font-bold text-foreground">
              Language
            </Text>
          </View>

          <Text className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            Preferred language
          </Text>

          <View
            accessibilityRole="radiogroup"
            className="overflow-hidden rounded-3xl bg-card"
          >
            {LANGUAGE_OPTIONS.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? (
                  <View className="ml-4 h-px bg-border/50" />
                ) : null}
                <LanguageRow
                  disabled={busy}
                  option={option}
                  selected={option.id === selected}
                  onSelect={handleSelect}
                />
              </View>
            ))}
          </View>

          <Text className="mt-4 px-1 text-[13px] leading-5 text-muted-foreground">
            Applies to TracePay on this device.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
