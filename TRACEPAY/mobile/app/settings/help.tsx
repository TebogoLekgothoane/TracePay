import Constants from "expo-constants";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  Mail,
  MessageSquare,
  Phone,
  Shield,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { IconButton } from "../../src/components/ui/IconButton";
import { SUPPORT_EMAIL } from "../../src/features/auth/auth.constants";
import { COLORS } from "../../src/theme/colors";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

const FAQS = [
  {
    id: "import",
    question: "How do I add my bank transactions?",
    answer:
      "Open Linked accounts and import a PDF bank statement. TracePay extracts the transaction rows and saves them to your account. We never ask for your bank username or password.",
  },
  {
    id: "leaks",
    question: "What are money leaks?",
    answer:
      "Money leaks are patterns TracePay finds in your imported transactions such as rising fees, forgotten subscriptions, or unusual debits. Treat each insight as a suggestion and confirm before you cancel anything.",
  },
  {
    id: "security",
    question: "How is my information protected?",
    answer:
      "Your session is authenticated, statements stay on your TracePay account, and this device can be locked with a PIN and biometrics. TracePay does not store your bank login credentials.",
  },
  {
    id: "balances",
    question: "Can I hide my balances on Home?",
    answer:
      "Yes. Go to Security & privacy and turn on Hide balances on Home. You can also tap the eye icon on the Home balance card.",
  },
] as const;

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="rounded-2xl bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-75"
        onPress={onToggle}
      >
        <Text className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">
          {question}
        </Text>
        {open ? (
          <ChevronUp color={palette.placeholder} size={18} strokeWidth={2} />
        ) : (
          <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
        )}
      </Pressable>
      {open ? (
        <Text className="border-t border-border/40 px-4 pb-4 pt-3 text-[14px] leading-5 text-muted-foreground">
          {answer}
        </Text>
      ) : null}
    </View>
  );
}

export default function HelpSupportScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [openingMail, setOpeningMail] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQS[0].id);

  const openSupportEmail = () => {
    if (openingMail) {
      return;
    }

    setOpeningMail(true);
    const subject = encodeURIComponent(`TracePay support (v${APP_VERSION})`);
    const body = encodeURIComponent(
      `Hi TracePay support,\n\nI need help with:\n\nApp version: ${APP_VERSION}\n`,
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    void Linking.openURL(url)
      .catch(() => {
        Alert.alert(
          "Email unavailable",
          `No mail app is available. Please write to ${SUPPORT_EMAIL}.`,
        );
      })
      .finally(() => {
        setOpeningMail(false);
      });
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
                Help & support
              </Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                Get answers or contact TracePay
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-3xl px-4 py-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-[15px] font-semibold text-foreground">
                We’re here to help
              </Text>
            </View>
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Browse the questions below, or email support with your issue and
              app version. Typical replies are within one business day.
            </Text>
          </View>

          <Text className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            Frequently asked
          </Text>
          <View className="gap-2">
            {FAQS.map((faq) => (
              <FaqItem
                key={faq.id}
                answer={faq.answer}
                open={openFaqId === faq.id}
                question={faq.question}
                onToggle={() =>
                  setOpenFaqId((current) =>
                    current === faq.id ? null : faq.id,
                  )
                }
              />
            ))}
          </View>

          <Text className="mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
            Contact support
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={openingMail}
            onPress={openSupportEmail}
            className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Mail color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                Email TracePay support
              </Text>
              <Text className="mt-0.5 text-[13px] text-muted-foreground">
                {SUPPORT_EMAIL}
              </Text>
            </View>
            <ExternalLink color={palette.placeholder} size={16} strokeWidth={2} />
          </Pressable>

          <View className="mt-3 flex-row items-start gap-3 rounded-2xl bg-card px-4 py-3.5">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Phone color={palette.primary} size={18} strokeWidth={2.2} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                Account access issues
              </Text>
              <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                If you cannot sign in, email support from another device and
                include the mobile number on your TracePay account.
              </Text>
            </View>
          </View>

          <Text className="mt-8 text-center text-[12px] text-muted-foreground">
            TracePay · Version {APP_VERSION}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
