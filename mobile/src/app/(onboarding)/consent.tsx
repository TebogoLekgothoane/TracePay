import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
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

const ROADMAP_STEPS = 6;

const ROADMAP_ICONS: (keyof typeof Feather.glyphMap)[] = [
  "database",
  "smartphone",
  "target",
  "shield",
  "check-circle",
  "lock",
];

const Colors = {
  bg: "#F5F5F7",
  card: "#FFFFFF",
  text: "#111827",
  textMuted: "#6B7280",
  navy: "#0B1B3A",
  accent: "#BF00FF",
  blue: "#2563EB",
  trackOff: "#E0E0E0",
  stepOff: "#E0E0E0",
  stepBorderOff: "#C0C0C0",
  trackBg: "#D1D5DB",
  bullet: "#2563EB",
};

const Spacing = {
  lg: 16,
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
      backgroundColor: isFilled ? Colors.navy : Colors.stepOff,
      borderWidth: 2,
      borderColor: isFilled ? Colors.navy : Colors.stepBorderOff,
    };
  });

  const filledIconStyle = useAnimatedStyle(() => ({
    opacity: filledSteps.value > index ? 1 : 0,
  }));

  const unfilledIconStyle = useAnimatedStyle(() => ({
    opacity: filledSteps.value > index ? 0 : 1,
  }));

  return (
    <Animated.View style={[styles.roadmapStep, circleStyle]}>
      <Animated.View style={[styles.roadmapIconLayer, unfilledIconStyle]}>
        <Feather name={icon} size={18} color="#6B7280" />
      </Animated.View>
      <Animated.View style={[styles.roadmapIconLayer, filledIconStyle]}>
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
      style={styles.consentSection}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionItems}>
        {items.map((item, index) => (
          <View key={index} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.sectionItem}>{item}</Text>
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

  const [localMomoSetting, setLocalMomoSetting] = useState(includeMomoData);
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

  const handleAgree = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIncludeMomoData(localMomoSetting);
    setConsentGiven(true);
    router.push("/(onboarding)/connect-accounts" as any);
  };

  const handleCancel = () => {
    router.back();
  };

  const handleMomoToggle = async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalMomoSetting(value);
  };

  const topPadding = insets.top + Spacing["6xl"];

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topPadding,
            paddingBottom: insets.bottom + Spacing["4xl"],
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={24}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={styles.introBlock}
        >
          <Text style={styles.title}>{t.consentTitle}</Text>
          <Text style={styles.subtitle}>{t.consentSubtitle}</Text>
          <Text style={styles.intro}>{t.consentIntro}</Text>
        </Animated.View>

        <View style={styles.roadmapRow} onLayout={handleCardsSectionLayout}>
          <View style={styles.roadmapRail}>
            <View style={styles.roadmapTrack}>
              <Animated.View style={[styles.roadmapFill, roadmapFillStyle]} />
            </View>
            {Array.from({ length: ROADMAP_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.roadmapStepAnchor,
                  { top: `${(i / (ROADMAP_STEPS - 1)) * 100}%` },
                ]}
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

          <View style={styles.cardsColumn}>
            <ConsentSection
              title={t.dataAccessTitle}
              items={[t.dataAccess1, t.dataAccess2]}
              delay={100}
            />

            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              style={styles.momoCard}
            >
              <View style={styles.momoText}>
                <Text style={styles.sectionTitle}>{t.includeMomoData}</Text>
                <Text style={styles.momoDescription}>{t.momoDescription}</Text>
              </View>
              <Switch
                value={localMomoSetting}
                onValueChange={handleMomoToggle}
                trackColor={{ false: Colors.trackOff, true: Colors.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={Colors.trackOff}
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

        <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <Pressable
            onPress={handleAgree}
            style={({ pressed }) => [styles.agreeBtn, pressed && styles.btnPressed]}
            testID="button-agree"
          >
            <Text style={styles.agreeBtnText}>{t.agreeAndContinue}</Text>
          </Pressable>
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}
            testID="button-cancel"
          >
            <Text style={styles.cancelBtnText}>{t.cancel}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  introBlock: {
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 24,
  },
  roadmapRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 40,
  },
  roadmapRail: {
    width: 56,
    marginRight: 4,
    position: "relative",
    minHeight: 200,
  },
  roadmapTrack: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    width: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Colors.trackBg,
  },
  roadmapFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 3,
    backgroundColor: Colors.navy,
  },
  roadmapStepAnchor: {
    position: "absolute",
    left: 0,
    marginTop: -22,
  },
  roadmapStep: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  roadmapIconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  cardsColumn: {
    flex: 1,
    minWidth: 0,
  },
  consentSection: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  sectionItems: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bullet,
    marginTop: 8,
    marginRight: 12,
  },
  sectionItem: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    lineHeight: 20,
  },
  momoCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  momoText: {
    flex: 1,
    marginRight: 16,
  },
  momoDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  actions: {
    gap: 12,
  },
  agreeBtn: {
    backgroundColor: Colors.accent,
    width: "100%",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  agreeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  cancelBtn: {
    backgroundColor: Colors.blue,
    width: "100%",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  btnPressed: {
    opacity: 0.88,
  },
});
