import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import { CONSENT_FORM_SECTIONS } from "../../src/features/privacy/consent.content";
import { COLORS } from "../../src/theme/colors";

export default function ConsentFormScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-2 px-4 pt-1">
        <IconButton
          accessibilityLabel="Go back"
          variant="ghost"
          onPress={() => router.back()}
        >
          <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
        </IconButton>
        <Text className="flex-1 text-[18px] font-semibold text-foreground">
          Consent form
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mt-4 text-[15px] leading-[22px] text-muted-foreground">
          How TracePay uses the financial information you choose to share.
        </Text>

        <View className="mt-8 gap-8">
          {CONSENT_FORM_SECTIONS.map((section) => (
            <View key={section.id}>
              <Text className="text-[16px] font-semibold text-foreground">
                {section.title}
              </Text>
              <Text className="mt-2 text-[15px] leading-[22px] text-muted-foreground">
                {section.body}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
