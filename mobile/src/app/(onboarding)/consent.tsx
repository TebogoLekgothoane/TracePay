import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Switch,
  Pressable,
  Linking,
  AppState,
  Image,
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
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useIngestion } from "@/context/SMSIngestionContext";

const PURPLE = "#A855F7";
const privacyIconSource = require("@/assets/privacy-icon.png");

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
            <AppText variant="lead" className="mt-2">
              {summary}
            </AppText>
          </View>
        </Pressable>

        {trailing}

        <Pressable
          onPress={onToggle}
          hitSlop={8}
          className="shrink-0 pt-1"
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse section" : "Expand section"}
        >
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
              <AppText variant="bodySm" className="flex-1">
                {item}
              </AppText>
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
          checked
            ? "border-primary bg-primary"
            : "border-white/25 bg-transparent",
        )}
      >
        {checked ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
      </View>
      <AppText variant="bodySm" className="flex-1 leading-5 text-foreground">
        {children}
      </AppText>
    </Pressable>
  );
}

export default function ConsentScreen() {
  const includeMomoData = useOnboardingStore((s) => s.includeMomoData);
  const setIncludeMomoData = useOnboardingStore((s) => s.setIncludeMomoData);
  const setConsentGiven = useOnboardingStore((s) => s.setConsentGiven);
  const { requestPermission, refreshPermission, openPermissionSettings } =
    useIngestion();

  const [localMomoSetting, setLocalMomoSetting] = useState(includeMomoData);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [privacyPolicyChecked, setPrivacyPolicyChecked] = useState(false);
  const [dataProcessingChecked, setDataProcessingChecked] = useState(false);

  const canContinue = privacyPolicyChecked && dataProcessingChecked;

  const continueIfGranted = useCallback(async () => {
    const status = await refreshPermission();
    if (status === "granted") {
      setPermissionBlocked(false);
      router.push("/(onboarding)");
      return true;
    }
    setPermissionBlocked(true);
    return false;
  }, [refreshPermission]);

  const handleAgree = async () => {
    if (!canContinue) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIncludeMomoData(localMomoSetting);
    setConsentGiven(true);

    const status = await requestPermission();
    if (status === "granted") {
      router.push("/(onboarding)");
      return;
    }

    setPermissionBlocked(true);
  };

  const handleOpenSettings = async () => {
    await openPermissionSettings();
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && permissionBlocked) {
        void continueIfGranted();
      }
    });
    return () => sub.remove();
  }, [permissionBlocked, continueIfGranted]);

  const handleCancel = () => {
    router.back();
  };

  const handleMomoToggle = async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalMomoSetting(value);
  };

  const toggleAccordion = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const togglePrivacyPolicy = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPrivacyPolicyChecked((value) => !value);
  };

  const toggleDataProcessing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDataProcessingChecked((value) => !value);
  };

  const openPrivacyPolicy = () => {
    void Linking.openURL("https://tracepay.co.za/privacy");
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
          <View className="relative mb-6 mt-2">
            <View className="absolute -right-1 top-0 z-0">
              <Image
                source={privacyIconSource}
                className="h-20 w-[80px]"
                resizeMode="contain"
                accessibilityLabel="Privacy and security"
              />
            </View>

            <View className="relative z-10 pr-[84px]">
              <AppText variant="titleLg">
                Privacy &{" "}
                <AppText variant="titleLg" className="text-brand-purple">
                  consent
                </AppText>
              </AppText>
              <AppText
                variant="bodyMuted"
                className="mt-2 text-[15px] leading-[22px]"
              >
                {t.consentSubtitle}
              </AppText>
            </View>
          </View>

          <View className="gap-4">
            <AccordionCard
              icon="database-outline"
              title={t.dataAccessTitle}
              summary={t.dataAccessSummary}
              details={t.dataAccessDetails}
              expanded={expandedId === "data"}
              onToggle={() => toggleAccordion("data")}
            />

            <AccordionCard
              icon="cellphone"
              iconColor="#8B5CF6"
              title={t.includeMomoData}
              summary={t.momoDescription}
              details={[
                "Includes Vodacom, MTN, Cell C and Telkom MoMo SMS.",
                "You can turn this off at any time in settings.",
              ]}
              expanded={expandedId === "momo"}
              onToggle={() => toggleAccordion("momo")}
              trailing={
                <Switch
                  value={localMomoSetting}
                  onValueChange={handleMomoToggle}
                  trackColor={{ false: "#3F3F46", true: PURPLE }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#3F3F46"
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
              onToggle={() => toggleAccordion("why")}
            />

            <AccordionCard
              icon="shield-off-outline"
              iconColor="#22C55E"
              title={t.whatWeDoNotTitle}
              summary={t.whatWeDoNotSummary}
              details={t.whatWeDoNotDetails}
              expanded={expandedId === "not"}
              onToggle={() => toggleAccordion("not")}
            />
          </View>

          <Card className="mt-4">
            <AppText variant="title" className="mb-4">
              {t.yourConsentTitle}
            </AppText>

            <View className="gap-4">
              <ConsentCheckbox
                checked={privacyPolicyChecked}
                onToggle={togglePrivacyPolicy}
              >
                {t.privacyPolicyConsent}{" "}
                <AppText
                  variant="bodySm"
                  className="text-brand-purple underline"
                  onPress={openPrivacyPolicy}
                >
                  {t.privacyPolicyLink}
                </AppText>
                .
              </ConsentCheckbox>

              <ConsentCheckbox
                checked={dataProcessingChecked}
                onToggle={toggleDataProcessing}
              >
                {t.dataProcessingConsent}
              </ConsentCheckbox>
            </View>
          </Card>

          {permissionBlocked ? (
            <View className="mt-4 gap-3 rounded-[20px] border border-red-500/30 bg-red-500/10 p-4">
              <View className="flex-row items-center gap-2">
                <Feather name="shield" size={20} color="#F87171" />
                <AppText variant="title" className="flex-1 text-base text-red-300">
                  Android blocked SMS access
                </AppText>
              </View>
              <AppText variant="bodySm" className="text-red-200">
                Your phone showed a security warning instead of Allow/Deny. On
                newer Android this is normal for dev builds. Open Settings, go
                to Permissions → SMS, allow access for TracePay, then return
                here.
              </AppText>
              <Button
                size="lg"
                fullWidth
                className="h-12 rounded-[20px]"
                onPress={handleOpenSettings}
              >
                Open Settings
              </Button>
              <Button
                variant="outline"
                size="lg"
                fullWidth
                className="h-12 rounded-[20px]"
                onPress={() => void continueIfGranted()}
              >
                I&apos;ve enabled it — check again
              </Button>
            </View>
          ) : null}
        </ScrollView>

        <View className="z-10 border-t border-border bg-background px-6 pb-6 pt-4 dark:border-white/10 dark:bg-transparent">
          <Button
            size="lg"
            fullWidth
            className="h-14 rounded-[24px]"
            onPress={handleAgree}
            disabled={!canContinue && !permissionBlocked}
            testID="button-agree"
            iconRight={
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            }
          >
            {permissionBlocked ? "Try SMS permission again" : t.agreeAndContinue}
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            className="mt-3 h-14 rounded-[24px]"
            onPress={handleCancel}
            testID="button-cancel"
          >
            {t.cancel}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
