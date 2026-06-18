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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const NAVY = "#0B1B3A";
const STEP_OFF = "#E0E0E0";
const STEP_BORDER_OFF = "#C0C0C0";

const Spacing = {
  "2xl": 24,
  "4xl": 32,
  "6xl": 48,
};

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
      backgroundColor: isFilled ? NAVY : STEP_OFF,
      borderWidth: 2,
      borderColor: isFilled ? NAVY : STEP_BORDER_OFF,
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
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      className="card mb-4"
    >
      <Text className="mb-3 text-base font-semibold text-strong">{title}</Text>
      <View className="gap-2">
        {items.map((item, index) => (
          <View key={index} className="flex-row items-start">
            <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-blue-600" />
                <Text className="flex-1 text-sm font-sans leading-5 text-gray-500 dark:text-gray-400">{item}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
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

  const topPadding = insets.top + Spacing["6xl"];

  return (
    <View className="screen">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerClassName="px-4"
        contentContainerStyle={{
          paddingTop: topPadding,
          paddingBottom: insets.bottom + Spacing["4xl"],
        }}
        onScroll={handleScroll}
        scrollEventThrottle={24}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(50).springify()} className="pb-4">
          <Text className="heading-xl mb-2">{t.consentTitle}</Text>
          <Text className="body-text text-[15px] mb-4">{t.consentSubtitle}</Text>
          <Text className="body-text text-[15px] leading-[22px] text-strong mb-6">
            {t.consentIntro}
          </Text>
        </Animated.View>

        <View className="mb-10 flex-row items-stretch" onLayout={handleCardsSectionLayout}>
          <View className="relative mr-1 min-h-[200px] w-14">
            <View className="absolute bottom-0 left-5 top-0 w-1.5 overflow-hidden rounded-[3px] bg-gray-300 dark:bg-gray-600">
              <Animated.View
                className="absolute left-0 right-0 top-0 rounded-[3px] bg-navy"
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

            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              className="card mb-4 flex-row items-center justify-between"
            >
              <View className="mr-4 flex-1">
                <Text className="mb-3 text-base font-semibold text-strong">
                  {t.includeMomoData}
                </Text>
                <Text className="mt-1 text-[13px] font-sans leading-[18px] text-gray-500">
                  {t.momoDescription}
                </Text>
              </View>
              <Switch
                value={localMomoSetting}
                onValueChange={handleMomoToggle}
                trackColor={{ false: "#E0E0E0", true: "#BF00FF" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E0E0E0"
              />
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
          <View className="mb-4 gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <View className="flex-row items-center gap-2">
              <Feather name="shield" size={20} color="#DC2626" />
              <Text className="flex-1 text-base font-semibold text-red-800">
                Android blocked SMS access
              </Text>
            </View>
            <Text className="text-sm font-sans leading-5 text-red-900">
              Your phone showed a security warning instead of Allow/Deny. On newer Android this is
              normal for dev builds. Open Settings, go to Permissions → SMS, allow access for
              TracePay, then return here.
            </Text>
            <Button variant="accent" fullWidth onPress={handleOpenSettings}>
              Open Settings
            </Button>
            <Button variant="info" fullWidth onPress={continueIfGranted}>
              I&apos;ve enabled it — check again
            </Button>
          </View>
        )}

        <View className="gap-3" style={{ paddingBottom: insets.bottom + Spacing["2xl"] }}>
          <Button variant="accent" fullWidth onPress={handleAgree} testID="button-agree">
            {permissionBlocked ? "Try SMS permission again" : t.agreeAndContinue}
          </Button>
          <Button
            variant="info"
            fullWidth
            onPress={handleCancel}
            testID="button-cancel"
            className="mt-1"
          >
            {t.cancel}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
