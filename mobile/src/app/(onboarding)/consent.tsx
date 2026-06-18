import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
} from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { OnboardingHeader, ONBOARDING_STEPS } from "@/components/OnboardingHeader";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { consentCopy as t } from "@/constants/consent-copy";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useIngestion } from "@/context/SMSIngestionContext";

const ROADMAP_STEPS = 6;

const ROADMAP_ICONS: (keyof typeof Feather.glyphMap)[] = [
  "database",
  "smartphone",
  "target",
  "shield",
  "check-circle",
  "lock",
];

const PURPLE = "#7C3AED";
const STEP_OFF = "#E5E7EB";
const STEP_BORDER_OFF = "#D1D5DB";

function RoadmapStep({
  index,
  filledSteps,
  icon,
}: {
  index: number;
  total: number;
  filledSteps: SharedValue<number>;
  icon: keyof typeof Feather.glyphMap;
}) {
  const circleStyle = useAnimatedStyle(() => {
    const isFilled = filledSteps.value > index;
    return {
      backgroundColor: isFilled ? PURPLE : STEP_OFF,
      borderWidth: 2,
      borderColor: isFilled ? PURPLE : STEP_BORDER_OFF,
    };
  });

  const filledIconStyle = useAnimatedStyle(() => ({
    opacity: filledSteps.value > index ? 1 : 0,
  }));

  const unfilledIconStyle = useAnimatedStyle(() => ({
    opacity: filledSteps.value > index ? 0 : 1,
  }));

  return (
    <Animated.View
      className="h-11 w-11 items-center justify-center rounded-full"
      style={circleStyle}
    >
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={unfilledIconStyle}
      >
        <Feather name={icon} size={18} color="#6B7280" />
      </Animated.View>
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={filledIconStyle}
      >
        <Feather name={icon} size={18} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

function ConsentSection({
  title,
  items,
  delay,
}: {
  title: string;
  items: string[];
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Card className="mb-4 p-0">
        <Text className="mb-3 text-base font-semibold text-foreground">{title}</Text>
        <View className="gap-2">
          {items.map((item, index) => (
            <View key={index} className="flex-row items-start">
              <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-brand-purple" />
              <Text className="flex-1 text-sm leading-5 text-muted-foreground">{item}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}

export default function ConsentScreen() {
  const scrollViewRef = useRef<ScrollView>(null);

  const includeMomoData = useOnboardingStore((s) => s.includeMomoData);
  const setIncludeMomoData = useOnboardingStore((s) => s.setIncludeMomoData);
  const setConsentGiven = useOnboardingStore((s) => s.setConsentGiven);
  const { requestPermission, refreshPermission, openPermissionSettings } = useIngestion();

  const [localMomoSetting, setLocalMomoSetting] = useState(includeMomoData);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const scrollProgress = useSharedValue(0);
  const filledSteps = useSharedValue(0);
  const roadmapHeight = useSharedValue(0);
  const [cardsSectionY, setCardsSectionY] = useState(0);
  const [cardsSectionHeight, setCardsSectionHeight] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const scrollY = contentOffset.y;
    const viewport = layoutMeasurement.height;
    if (cardsSectionHeight <= 0) return;

    const cardsScrollStart = cardsSectionY;
    const cardsScrollEnd = cardsSectionY + cardsSectionHeight - viewport;
    const range = Math.max(1, cardsScrollEnd - cardsScrollStart);
    const rawProgress = Math.max(0, Math.min(1, (scrollY - cardsScrollStart) / range));

    let fillProgress: number;
    if (rawProgress >= 0.85) {
      fillProgress = 0.7 + ((rawProgress - 0.85) / 0.15) * 0.3;
    } else {
      fillProgress = Math.pow(rawProgress, 1.2) * 0.82;
    }
    fillProgress = Math.min(1, fillProgress);

    scrollProgress.value = withTiming(fillProgress, { duration: 200 });

    let step = Math.floor(rawProgress * ROADMAP_STEPS);
    if (rawProgress >= 0.9 || step >= ROADMAP_STEPS - 1) {
      step = ROADMAP_STEPS - 1;
    }
    filledSteps.value = withTiming(step + 1, { duration: 150 });
  };

  const handleCardsSectionLayout = (e: {
    nativeEvent: { layout: { height: number; y: number } };
  }) => {
    const { height, y } = e.nativeEvent.layout;
    setCardsSectionY(y);
    setCardsSectionHeight(height);
    roadmapHeight.value = height;
  };

  const roadmapFillStyle = useAnimatedStyle(() => ({
    height: scrollProgress.value * roadmapHeight.value,
    backgroundColor: PURPLE,
  }));

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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={24}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingHeader currentStep={ONBOARDING_STEPS.consent} />

        <Animated.View entering={FadeInDown.delay(50).springify()} className="mb-6">
          <Text className="text-[32px] font-bold leading-[38px] text-foreground">
            Privacy &{" "}
            <Text className="text-brand-purple">consent</Text>
          </Text>
          <Text className="mt-3 text-base leading-6 text-muted-foreground">
            {t.consentSubtitle}
          </Text>
          <Text className="mt-3 text-[15px] leading-[22px] text-foreground">
            {t.consentIntro}
          </Text>
        </Animated.View>

        <View className="mb-6 flex-row items-stretch" onLayout={handleCardsSectionLayout}>
          <View className="relative mr-1 min-h-[200px] w-14">
            <View className="absolute bottom-0 left-5 top-0 w-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <Animated.View
                className="absolute left-0 right-0 top-0 rounded-full"
                style={roadmapFillStyle}
              />
            </View>
            {Array.from({ length: ROADMAP_STEPS }).map((_, i) => (
              <View
                key={i}
                className="absolute left-0 -mt-[22px]"
                style={{ top: `${(i / (ROADMAP_STEPS - 1)) * 100}%` }}
              >
                <RoadmapStep
                  index={i}
                  total={ROADMAP_STEPS}
                  filledSteps={filledSteps}
                  icon={ROADMAP_ICONS[i]}
                />
              </View>
            ))}
          </View>

          <View className="min-w-0 flex-1">
            <ConsentSection
              title={t.dataAccessTitle}
              items={[t.dataAccess1, t.dataAccess2]}
              delay={100}
            />

            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <Card className="mb-4 flex-row items-center justify-between p-0">
                <View className="mr-4 flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {t.includeMomoData}
                  </Text>
                  <Text className="mt-2 text-sm leading-[18px] text-muted-foreground">
                    {t.momoDescription}
                  </Text>
                </View>
                <Switch
                  value={localMomoSetting}
                  onValueChange={handleMomoToggle}
                  trackColor={{ false: "#E5E7EB", true: PURPLE }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </Card>
            </Animated.View>

            <ConsentSection
              title={t.whyWeNeedTitle}
              items={[t.whyWeNeed1, t.whyWeNeed2, t.whyWeNeed3]}
              delay={200}
            />
            <ConsentSection
              title={t.whatWeDoNotTitle}
              items={[t.whatWeDoNot1, t.whatWeDoNot2, t.whatWeDoNot3]}
              delay={250}
            />
            <ConsentSection
              title={t.yourRightsTitle}
              items={[t.yourRights1, t.yourRights2, t.yourRights3]}
              delay={300}
            />
            <ConsentSection
              title={t.importantTitle}
              items={[t.important1, t.important2, t.important3]}
              delay={350}
            />
          </View>
        </View>

        {permissionBlocked && (
          <View className="mb-4 gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
            <View className="flex-row items-center gap-2">
              <Feather name="shield" size={20} color="#DC2626" />
              <Text className="flex-1 text-base font-semibold text-red-800 dark:text-red-300">
                Android blocked SMS access
              </Text>
            </View>
            <Text className="text-sm leading-5 text-red-900 dark:text-red-200">
              Your phone showed a security warning instead of Allow/Deny. On newer Android this is
              normal for dev builds. Open Settings, go to Permissions → SMS, allow access for
              TracePay, then return here.
            </Text>
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
        )}
      </ScrollView>

      <View className="border-t border-border bg-background px-6 pb-6 pt-4">
        <Button
          size="lg"
          fullWidth
          className="h-14 rounded-[24px]"
          onPress={handleAgree}
          testID="button-agree"
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
    </SafeAreaView>
  );
}
