import React, { useState } from "react";
import {
  View,
  ScrollView,
  Switch,
  Pressable,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AppText } from "@/components/Typography";
import { consentCopy as t } from "@/constants/consent-copy";
import { cn } from "@/lib/cn";
import { goBackOr } from "@/lib/navigation";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useProfileStore } from "@/stores/profileStore";

const PURPLE = "#A855F7";

type AccordionCardProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  title: string;
  summary: string;
  details?: readonly string[];
  expanded: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
};

function AccordionCard({
  icon,
  iconColor = PURPLE,
  title,
  summary,
  details,
  expanded,
  onToggle,
  trailing,
}: AccordionCardProps) {
  return (
    <Card contentClassName="gap-0">
      <View className="flex-row items-start gap-4">
        <Pressable
          onPress={onToggle}
          className="min-w-0 flex-1 flex-row items-start gap-4 active:opacity-90"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <View className="shrink-0">
            <MaterialCommunityIcons name={icon} size={28} color={iconColor} />
          </View>
          <View className="min-w-0 flex-1">
            <AppText variant="title">{title}</AppText>
            <AppText variant="lead" className="mt-2">{summary}</AppText>
          </View>
        </Pressable>
        {trailing}
        <Pressable onPress={onToggle} hitSlop={8} className="shrink-0 pt-1" accessibilityRole="button">
          <Feather
            name="chevron-down"
            size={20}
            color="#FFFFFF"
            style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          />
        </Pressable>
      </View>
      {expanded && details && details.length > 0 ? (
        <View className="mt-4 gap-2 border-t border-white/10 pt-4">
          {details.map((item, index) => (
            <View key={index} className="flex-row items-start gap-2">
              <View className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <AppText variant="bodySm" className="flex-1">{item}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

type ConsentCheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function ConsentCheckbox({ checked, onToggle, children }: ConsentCheckboxProps) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-start gap-3 active:opacity-90"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          checked ? "border-primary bg-primary" : "border-white/25 bg-transparent",
        )}
      >
        {checked ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
      </View>
      <AppText variant="bodySm" className="flex-1 leading-5 text-foreground">{children}</AppText>
    </Pressable>
  );
}

export default function ConsentScreen() {
  const includeMomoData = useOnboardingStore((s) => s.includeMomoData);
  const setIncludeMomoData = useOnboardingStore((s) => s.setIncludeMomoData);
  const setConsentGiven = useProfileStore((s) => s.setConsentGiven);

  const [localMomoSetting, setLocalMomoSetting] = useState(includeMomoData);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [privacyPolicyChecked, setPrivacyPolicyChecked] = useState(false);
  const [dataProcessingChecked, setDataProcessingChecked] = useState(false);

  const canContinue = privacyPolicyChecked && dataProcessingChecked;

  const handleAgree = async () => {
    if (!canContinue) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIncludeMomoData(localMomoSetting);
    setConsentGiven(true);
    router.push("/(onboarding)/sms-permission");
  };

  const openPrivacyPolicy = () => {
    void Linking.openURL("https://tracepay.co.za/privacy");
  };

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-transparent" edges={["left", "right", "bottom"]}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="relative mb-6 mt-8">
            <AppText variant="titleLg">
              Privacy & <AppText variant="titleLg" className="text-brand-purple">consent</AppText>
            </AppText>
            <AppText variant="bodyMuted" className="mt-2 text-[15px] leading-[22px]">{t.consentSubtitle}</AppText>
          </View>

          <View className="gap-4">
            <AccordionCard
              icon="database-outline"
              title={t.dataAccessTitle}
              summary={t.dataAccessSummary}
              details={t.dataAccessDetails}
              expanded={expandedId === "data"}
              onToggle={() => setExpandedId((c) => (c === "data" ? null : "data"))}
            />
            <AccordionCard
              icon="cellphone"
              iconColor="#8B5CF6"
              title={t.includeMomoData}
              summary={t.momoDescription}
              details={["Includes Vodacom, MTN, Cell C and Telkom MoMo SMS.", "You can turn this off at any time in settings."]}
              expanded={expandedId === "momo"}
              onToggle={() => setExpandedId((c) => (c === "momo" ? null : "momo"))}
              trailing={
                <Switch
                  value={localMomoSetting}
                  onValueChange={setLocalMomoSetting}
                  trackColor={{ false: "#3F3F46", true: PURPLE }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <AccordionCard
              icon="crosshairs-gps"
              iconColor="#3B82F6"
              title={t.whyWeNeedTitle}
              summary={t.whyWeNeedSummary}
              details={t.whyWeNeedDetails}
              expanded={expandedId === "why"}
              onToggle={() => setExpandedId((c) => (c === "why" ? null : "why"))}
            />
            <AccordionCard
              icon="shield-off-outline"
              iconColor="#22C55E"
              title={t.whatWeDoNotTitle}
              summary={t.whatWeDoNotSummary}
              details={t.whatWeDoNotDetails}
              expanded={expandedId === "not"}
              onToggle={() => setExpandedId((c) => (c === "not" ? null : "not"))}
            />
          </View>

          <Card className="mt-4">
            <AppText variant="title" className="mb-4">{t.yourConsentTitle}</AppText>
            <View className="gap-4">
              <ConsentCheckbox checked={privacyPolicyChecked} onToggle={() => setPrivacyPolicyChecked((v) => !v)}>
                {t.privacyPolicyConsent}{" "}
                <AppText variant="bodySm" className="text-brand-purple underline" onPress={openPrivacyPolicy}>
                  {t.privacyPolicyLink}
                </AppText>
                .
              </ConsentCheckbox>
              <ConsentCheckbox checked={dataProcessingChecked} onToggle={() => setDataProcessingChecked((v) => !v)}>
                {t.dataProcessingConsent}
              </ConsentCheckbox>
            </View>
          </Card>
        </ScrollView>

        <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
          <Button size="lg" fullWidth className="h-14 rounded-[24px]" onPress={handleAgree} disabled={!canContinue}>
            {t.agreeAndContinue}
          </Button>
          <Button variant="outline" size="lg" fullWidth className="mt-3 h-14 rounded-[24px]" onPress={() => goBackOr("/(onboarding)/biometrics")}>
            {t.cancel}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
