import {
  View,
  Text,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { TracePayLogo } from "@/components/TracePayLogo";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/cn";

const LANGUAGES = [
  { code: "English", label: "English", sub: "South African English", pop: "Most widely used" },
  { code: "isiZulu", label: "isiZulu", sub: "KwaZulu-Natal, Gauteng", pop: "~25% of SA" },
  { code: "isiXhosa", label: "isiXhosa", sub: "Eastern Cape, Western Cape", pop: "~19% of SA" },
  { code: "Afrikaans", label: "Afrikaans", sub: "Western Cape, Northern Cape", pop: "~13% of SA" },
  { code: "Sesotho", label: "Sesotho", sub: "Free State, Gauteng", pop: "~8% of SA" },
  { code: "Setswana", label: "Setswana", sub: "North West, Gauteng", pop: "~8% of SA" },
  { code: "Sepedi", label: "Sepedi", sub: "Limpopo, Mpumalanga", pop: "~9% of SA" },
  { code: "SiSwati", label: "SiSwati", sub: "Mpumalanga, Eswatini border", pop: "~3% of SA" },
  { code: "Xitsonga", label: "Xitsonga", sub: "Limpopo", pop: "~4% of SA" },
  { code: "Tshivenda", label: "Tshivenda", sub: "Limpopo", pop: "~2% of SA" },
  { code: "isiNdebele", label: "isiNdebele", sub: "Mpumalanga, Limpopo", pop: "~2% of SA" },
];

export default function LanguageScreen() {
  const { selectedLanguage, setSelectedLanguage } = useOnboardingStore();
  const setLanguage = useProfileStore((s) => s.setLanguage);

  const handleContinue = () => {
    setLanguage(selectedLanguage);
    router.push("/(onboarding)/welcome");
  };

  return (
    <SafeAreaView className="screen">
      <StatusBar barStyle="dark-content" />

      <View className="onboarding-header">
        <TracePayLogo />
        <View className="step-dots">
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              className={cn(
                "step-dot",
                i === 0 && "step-dot-active",
              )}
            />
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="screen-scroll-onboarding"
        showsVerticalScrollIndicator={false}
      >
        <Text className="overline-brand mb-2.5">
          STEP 1 OF 5
        </Text>
        <Text className="heading-xl mb-2.5">
          Choose your language
        </Text>
        <Text className="text-[15px] font-sans text-gray-500 leading-[22px] mb-6">
          TracePay supports all 11 official South African languages.
        </Text>

        <View className="gap-2.5">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <Button
                key={lang.code}
                variant="outline"
                className={cn(
                  "flex-row items-center gap-3 rounded-[14px] p-3.5",
                  isSelected && "border-brand-purple bg-brand-purple-faint",
                )}
                onPress={() => setSelectedLanguage(lang.code)}
              >
                <Text className="text-[22px]">🇿🇦</Text>
                <View className="flex-1">
                  <Text
                    className={cn(
                      "text-[15px] font-semibold text-gray-700 mb-0.5",
                      isSelected && "text-brand-purple",
                    )}
                  >
                    {lang.label}
                  </Text>
                  <Text className="caption">
                    {lang.sub} · {lang.pop}
                  </Text>
                </View>
                <View
                  className={cn(
                    "w-[22px] h-[22px] rounded-full border-2 border-gray-300 items-center justify-center",
                    isSelected && "border-brand-purple",
                  )}
                >
                  {isSelected && <View className="w-2.5 h-2.5 rounded-full bg-brand-purple" />}
                </View>
              </Button>
            );
          })}
        </View>
      </ScrollView>

      <View className="onboarding-footer">
        <Button
          size="lg"
          fullWidth
          onPress={handleContinue}
          iconRight={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
        >
          Continue
        </Button>
      </View>
    </SafeAreaView>
  );
}
