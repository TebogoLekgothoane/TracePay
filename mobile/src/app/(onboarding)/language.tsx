import { Feather } from "@expo/vector-icons";
import {
  View,
  ScrollView,
  Image,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

const robotSource = require("@/assets/images/robothandup.png");

/** South Africa's 11 official languages. */
const LANGUAGES = [
  "English",
  "Afrikaans",
  "isiNdebele",
  "isiXhosa",
  "isiZulu",
  "Sepedi",
  "Sesotho",
  "Setswana",
  "siSwati",
  "Tshivenda",
  "Xitsonga",
];

export default function LanguageScreen() {
  const { selectedLanguage, setSelectedLanguage } = useOnboardingStore();
  const setLanguage = useProfileStore((s) => s.setLanguage);
  const { isDarkColorScheme } = useColorScheme();

  const handleContinue = () => {
    setLanguage(selectedLanguage);
    router.push("/(onboarding)/welcome");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-transparent"
      edges={["left", "right", "bottom"]}
    >
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: 16,
          }}
          showsVerticalScrollIndicator={false}
        >
        {/* Hero */}
        <View className="flex-row items-center mb-8">
          <View className="flex-1 pr-2">
            <AppText variant="display">
              Choose your{"\n"}
              ideal <AppText variant="displayAccent">language</AppText>
            </AppText>

            <AppText variant="lead" className="mt-3">
              Select the language you&apos;d like to use TracePay in.
            </AppText>
          </View>
          

          <Image
            source={robotSource}
            resizeMode="contain"
            className="h-[200px] w-[180px]"
          />
          
        </View>

        {/* Language Cards */}
        <View className="gap-3">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang;

            return (
              <Pressable
                key={lang}
                onPress={() => setSelectedLanguage(lang)}
                className={cn(
                  "flex-row items-center rounded-[28px] px-5 py-5",
                  isDarkColorScheme
                    ? isSelected
                      ? "border border-white/10 bg-white/[0.12]"
                      : "border border-white/10 bg-white/[0.08]"
                    : isSelected
                      ? "border border-border bg-white"
                      : "border border-border bg-white",
                )}
                style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
              >
                <View className="min-w-0 flex-1 pr-3">
                  <AppText variant="body" className="font-semibold">
                    {lang}
                  </AppText>
                </View>

                <View
                  className={cn(
                    "h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    isSelected
                      ? "bg-brand-purple dark:bg-primary"
                      : "border-2 border-gray-300 dark:border-white/30",
                  )}
                >
                  {isSelected ? (
                    <Feather name="check" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        </ScrollView>

        {/* Footer — pinned below scroll, above touch layer */}
        <View className="z-10 bg-background px-6 pb-6 pt-4 dark:bg-transparent">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={handleContinue}
          >
            Continue
          </Button>

          <AppText variant="bodyMuted" className="mt-5 text-center">
            You can change this later in Settings
          </AppText>
        </View>
      </View>
    </SafeAreaView>
  );
}
