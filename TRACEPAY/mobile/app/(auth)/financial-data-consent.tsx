import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../../src/components/auth/SetupBrandHeader";
import { Button } from "../../src/components/ui/Button";
import {
  CONSENT_CHECKBOX,
  CONSENT_SECTIONS,
  CONSENT_SUBTITLE,
} from "../../src/features/privacy/consent.content";
import { saveFinancialConsent } from "../../src/features/privacy/consent.preferences";
import { COLORS } from "../../src/theme/colors";

function ConsentCheckRow({
  checked,
  onToggle,
  borderColor,
  children,
  accessibilityLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  borderColor: string;
  children: ReactNode;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-start gap-3 active:opacity-80"
      onPress={onToggle}
    >
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded-[6px] border-2 ${
          checked ? "border-primary bg-primary" : "bg-transparent"
        }`}
        style={checked ? undefined : { borderColor }}
      >
        {checked ? (
          <Check color={COLORS.white} size={12} strokeWidth={3} />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">{children}</View>
    </Pressable>
  );
}

export default function FinancialDataConsentScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [processingChecked, setProcessingChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const canContinue = privacyChecked && processingChecked;

  const handleContinue = useCallback(async () => {
    if (!canContinue || saving) {
      return;
    }
    setSaving(true);
    try {
      await saveFinancialConsent({ accepted: true });
      router.replace("/(auth)/financial-accounts-setup");
    } finally {
      setSaving(false);
    }
  }, [canContinue, saving]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <SetupBrandHeader />

          <Text className="mt-10 text-center text-[30px] font-bold tracking-[-0.7px] text-foreground">
            Let's get started
          </Text>
          <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
            {CONSENT_SUBTITLE}
          </Text>

          <View className="mt-10 gap-8">
            {CONSENT_SECTIONS.map((section) => (
              <View key={section.id}>
                <Text className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
                  {section.title}
                </Text>
                <Text className="mt-2 text-[15px] leading-[22px] text-foreground">
                  {section.summary}
                </Text>
                <View className="mt-3 gap-2">
                  {section.details.map((detail) => (
                    <View key={detail} className="flex-row items-start gap-2.5">
                      <View className="mt-[9px] h-1 w-1 rounded-full bg-muted-foreground" />
                      <Text className="min-w-0 flex-1 text-[14px] leading-[20px] text-muted-foreground">
                        {detail}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          <View className="mt-10 gap-4">
            <Text className="text-[15px] font-semibold text-foreground">
              Your consent
            </Text>

            <ConsentCheckRow
              accessibilityLabel={`${CONSENT_CHECKBOX.privacyPrefix} ${CONSENT_CHECKBOX.privacyLink}`}
              borderColor={palette.border}
              checked={privacyChecked}
              onToggle={() => setPrivacyChecked((value) => !value)}
            >
              <Text className="text-[14px] leading-[20px] text-foreground">
                {CONSENT_CHECKBOX.privacyPrefix}{" "}
                <Text
                  className="font-semibold text-primary"
                  onPress={() => router.push("/(auth)/consent-form")}
                >
                  {CONSENT_CHECKBOX.privacyLink}
                </Text>
                .
              </Text>
            </ConsentCheckRow>

            <ConsentCheckRow
              accessibilityLabel={CONSENT_CHECKBOX.processing}
              borderColor={palette.border}
              checked={processingChecked}
              onToggle={() => setProcessingChecked((value) => !value)}
            >
              <Text className="text-[14px] leading-[20px] text-foreground">
                {CONSENT_CHECKBOX.processing}
              </Text>
            </ConsentCheckRow>
          </View>
        </ScrollView>

        <View className="border-t border-border px-6 pb-4 pt-4">
          <Button
            disabled={!canContinue}
            loading={saving}
            onPress={() => {
              void handleContinue();
            }}
          >
            {CONSENT_CHECKBOX.agreeLabel}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
