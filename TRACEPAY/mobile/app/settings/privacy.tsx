import { router } from "expo-router";
import {
  ChevronLeft,
  FileText,
  Lock,
  Shield,
  ShieldCheck,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import { COLORS } from "../../src/theme/colors";

const PRIVACY_URL = "https://tracepay.co.za/privacy";

const SECTIONS = [
  {
    id: "collect",
    Icon: FileText,
    title: "What we collect",
    body: "TracePay processes the bank statement PDFs you choose to upload, plus the account details needed to sign in (your name and mobile number).",
  },
  {
    id: "use",
    Icon: Shield,
    title: "How we use it",
    body: "Your data is used to show transactions, detect money leaks, and give you personalised insights. We do not sell your financial data.",
  },
  {
    id: "control",
    Icon: Lock,
    title: "You stay in control",
    body: "You decide which statements to upload. You can remove linked accounts and log out at any time. TracePay never asks for your bank login password.",
  },
] as const;

export default function PrivacyScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

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
                Privacy & consent
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                How TracePay handles your information
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row items-center gap-3 rounded-3xl border border-primary/20 bg-primary/10 px-4 py-4">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/15">
              <ShieldCheck color={palette.primary} size={22} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                POPIA aligned
              </Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                We only process personal information you provide for money
                insights on this device and your TracePay account.
              </Text>
            </View>
          </View>

          <View className="mt-5 gap-2">
            {SECTIONS.map((section) => (
              <View key={section.id} className="rounded-2xl bg-card px-4 py-3.5">
                <View className="flex-row items-center gap-2">
                  <section.Icon
                    color={palette.primary}
                    size={16}
                    strokeWidth={2.2}
                  />
                  <Text className="text-[15px] font-semibold text-foreground">
                    {section.title}
                  </Text>
                </View>
                <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                  {section.body}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="link"
            className="mt-5 active:opacity-75"
            onPress={() => {
              void Linking.openURL(PRIVACY_URL).catch(() => undefined);
            }}
          >
            <Text className="text-center text-[13px] font-semibold text-primary">
              Read the full privacy policy
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
