import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { OnboardingHeader, ONBOARDING_STEPS } from "@/components/OnboardingHeader";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

const robotSource = require("@/assets/images/robothandup.png");

const LANGUAGES = [
  { code: "English", label: "English", sub: "English" },
  { code: "Afrikaans", label: "Afrikaans", sub: "Afrikaans" },
  { code: "isiZulu", label: "isiZulu", sub: "isiZulu" },
  { code: "isiXhosa", label: "isiXhosa", sub: "isiXhosa" },
  { code: "Sesotho", label: "Sesotho", sub: "Sesotho" },
  { code: "Setswana", label: "Setswana", sub: "Setswana" },
];

function getFlagEmoji(code: string) {
  return code === "English" ? "🇬🇧" : "🇿🇦";
}

export default function LanguageScreen() {
  const { selectedLanguage, setSelectedLanguage } = useOnboardingStore();
  const setLanguage = useProfileStore((s) => s.setLanguage);

  const handleContinue = () => {
    setLanguage(selectedLanguage);
    router.push("/(onboarding)/welcome");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingHeader currentStep={ONBOARDING_STEPS.language} />

        {/* Hero */}
        <View className="flex-row items-center mb-8">
          <View className="flex-1 pr-2">
            <Text className="text-4xl font-bold leading-[44px] text-foreground">
              Choose your{"\n"}
              ideal{" "}
              <Text className="text-brand-purple">
                language
              </Text>
            </Text>

            <Text className="mt-3 text-base leading-6 text-muted-foreground">
              Select the language you'd like to use TracePay in.
            </Text>
          </View>
          

          <Image
            source={robotSource}
            resizeMode="contain"
            className="h-[200px] w-[200px]"
          />
          
        </View>

        {/* Language Cards */}
        <View className="gap-3">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;

            return (
              <Pressable
                key={lang.code}
                onPress={() => setSelectedLanguage(lang.code)}
                className={cn(
                  "flex-row items-center rounded-[28px] border px-5 py-5 bg-card",
                  isSelected
                    ? "border-brand-purple bg-brand-purple/5"
                    : "border-border"
                )}
              >
                <Text className="mr-4 text-[28px]">
                  {getFlagEmoji(lang.code)}
                </Text>

                <View className="flex-1">
                  <Text className="text-[17px] font-semibold text-foreground">
                    {lang.label}
                  </Text>

                  <Text className="mt-1 text-sm text-muted-foreground">
                    {lang.sub}
                  </Text>
                </View>

                <View
                  className={cn(
                    "h-7 w-7 rounded-full border-2 items-center justify-center",
                    isSelected
                      ? "border-brand-purple"
                      : "border-border"
                  )}
                >
                  {isSelected && (
                    <View className="h-3 w-3 rounded-full bg-brand-purple" />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View className="border-t border-border bg-background px-6 pb-6 pt-4">
        <Button
          size="lg"
          fullWidth
          className="h-14 rounded-[24px]"
          onPress={handleContinue}
        >
          Continue
        </Button>

        <Text className="mt-5 text-center text-sm text-muted-foreground">
           You can change this later in Settings
        </Text>
      </View>
    </SafeAreaView>
  );
}