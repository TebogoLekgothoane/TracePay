import React, { useState, useRef } from "react";
import { View, StyleSheet, ScrollView, Pressable, Switch, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius } from "@/constants/theme";

const ROADMAP_STEPS = 6;

const ROADMAP_ICONS: (keyof typeof Feather.glyphMap)[] = [
  "database",
  "smartphone",
  "target",
  "shield",
  "check-circle",
  "lock",
];

function RoadmapStep({
  index,
  filledSteps,
  icon,
  filled,
}: {
  index: number;
  total: number;
  filledSteps: SharedValue<number>;
  icon: keyof typeof Feather.glyphMap;
  filled: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const isFilled = filledSteps.value > index;
    return {
      backgroundColor: isFilled ? "#0B1B3A" : "#E0E0E0",
      borderWidth: 2,
      borderColor: isFilled ? "#0B1B3A" : "#C0C0C0",
    };
  });
  return (
    <Animated.View style={[styles.roadmapStepCircle, animatedStyle]}>
      <Feather
        name={icon}
        size={18}
        color={filled ? "#FFFFFF" : "#6B7280"}
        style={styles.roadmapStepIcon}
      />
    </Animated.View>
  );
}

interface ConsentSectionProps {
  title: string;
  items: string[];
  delay: number;
}

function ConsentSection({ title, items, delay }: ConsentSectionProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      className="bg-bg-card rounded-lg p-4 mb-4"
    >
      <ThemedText type="h4" className="text-text mb-3">
        {title}
      </ThemedText>
      <View className="gap-2">
        {items.map((item, index) => (
          <View key={index} className="flex-row items-start">
            <View className="w-1.5 h-1.5 rounded-full bg-blue mt-2.5 mr-3" />
            <ThemedText type="body" className="text-text-muted flex-1">
              {item}
            </ThemedText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { t, includeMomoData, setIncludeMomoData } = useApp();
  const scrollViewRef = useRef<ScrollView>(null);

  const [localMomoSetting, setLocalMomoSetting] = useState(includeMomoData);
  const scrollProgress = useSharedValue(0);
  const filledSteps = useSharedValue(0);
  const roadmapHeight = useSharedValue(0);
  const [cardsSectionY, setCardsSectionY] = useState(0);
  const [cardsSectionHeight, setCardsSectionHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    const scrollY = contentOffset.y;
    const viewport = layoutMeasurement.height;
    if (cardsSectionHeight <= 0) return;

    const cardsScrollStart = cardsSectionY;
    const cardsScrollEnd = cardsSectionY + cardsSectionHeight - viewport;
    const range = Math.max(1, cardsScrollEnd - cardsScrollStart);
    const rawProgress = Math.max(0, Math.min(1, (scrollY - cardsScrollStart) / range));
    
    // Fill line: slow and smooth for most of scroll, then reach 100% when near the end
    let fillProgress: number;
    if (rawProgress >= 0.85) {
      fillProgress = 0.7 + (rawProgress - 0.85) / 0.15 * 0.3;
    } else {
      fillProgress = Math.pow(rawProgress, 1.2) * 0.82;
    }
    fillProgress = Math.min(1, fillProgress);
    
    scrollProgress.value = withTiming(fillProgress, { duration: 200 });
    
    // Icons jump when reached - ensure last step fills when user is near/beyond the end
    let step = Math.floor(rawProgress * ROADMAP_STEPS);
    if (rawProgress >= 0.9 || step >= ROADMAP_STEPS - 1) {
      step = ROADMAP_STEPS - 1;
    }
    const newStep = step + 1;
    filledSteps.value = withTiming(newStep, { duration: 150 });
    setCurrentStep((prev) => (prev !== newStep ? newStep : prev));
  };

  const handleCardsSectionLayout = (e: { nativeEvent: { layout: { height: number; y: number } } }) => {
    const { height, y } = e.nativeEvent.layout;
    setCardsSectionY(y);
    setCardsSectionHeight(height);
    roadmapHeight.value = height;
  };

  const handleScrollViewLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    setViewportHeight(e.nativeEvent.layout.height);
  };

  const roadmapFillStyle = useAnimatedStyle(() => ({
    height: scrollProgress.value * roadmapHeight.value,
  }));

  const handleAgree = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setIncludeMomoData(localMomoSetting);
    router.push("/analysis-loading" as any);
  };

  const handleCancel = () => {
    router.back();
  };

  const handleMomoToggle = async (value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalMomoSetting(value);
  };

  return (
    <ThemedView className="bg-bg flex-1">
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing["6xl"],
            paddingBottom: insets.bottom + Spacing["4xl"],
          },
        ]}
        onScroll={handleScroll}
        onLayout={handleScrollViewLayout}
        scrollEventThrottle={24}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.titleBlock}>
          <ThemedText type="h1" className="text-text mb-2">
            {t("consentTitle")}
          </ThemedText>
          <ThemedText type="body" className="text-text-muted mb-4">
            {t("consentSubtitle")}
          </ThemedText>
          <ThemedText type="body" className="text-text mb-6">
            {t("consentIntro")}
          </ThemedText>
        </Animated.View>

        <View
          style={styles.cardsRow}
          onLayout={handleCardsSectionLayout}
        >
          <View style={styles.roadmapColumn}>
            <View style={styles.roadmapTrack}>
              <Animated.View style={[styles.roadmapFill, roadmapFillStyle]} />
            </View>
            {Array.from({ length: ROADMAP_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.roadmapStepWrapper,
                  { top: `${(i / (ROADMAP_STEPS - 1)) * 100}%` },
                ]}
              >
                <RoadmapStep
                  index={i}
                  total={ROADMAP_STEPS}
                  filledSteps={filledSteps}
                  icon={ROADMAP_ICONS[i]}
                  filled={currentStep > i}
                />
              </View>
            ))}
          </View>

          <View style={styles.cardsContent}>
            <ConsentSection
              title={t("dataAccessTitle")}
              items={[t("dataAccess1"), t("dataAccess2")]}
              delay={100}
            />

            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              className="bg-bg-card rounded-lg p-4 mb-4 flex-row items-center justify-between"
            >
              <View className="flex-1 mr-4">
                <ThemedText type="h4" className="text-text mb-1">
                  {t("includeMomoData")}
                </ThemedText>
                <ThemedText type="small" className="text-text-muted">
                  {t("momoDescription")}
                </ThemedText>
              </View>
              <Switch
                value={localMomoSetting}
                onValueChange={handleMomoToggle}
                trackColor={{
                  false: "#E0E0E0",
                  true: "#BF00FF",
                }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E0E0E0"
              />
            </Animated.View>

            <ConsentSection
              title={t("whyWeNeedTitle")}
              items={[t("whyWeNeed1"), t("whyWeNeed2"), t("whyWeNeed3")]}
              delay={200}
            />

            <ConsentSection
              title={t("whatWeDoNotTitle")}
              items={[t("whatWeDoNot1"), t("whatWeDoNot2"), t("whatWeDoNot3")]}
              delay={250}
            />

            <ConsentSection
              title={t("yourRightsTitle")}
              items={[t("yourRights1"), t("yourRights2"), t("yourRights3")]}
              delay={300}
            />

            <ConsentSection
              title={t("importantTitle")}
              items={[t("important1"), t("important2"), t("important3")]}
              delay={350}
            />
          </View>
        </View>

        <View style={[styles.actionsBlock, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <Button
            onPress={handleAgree}
            className="bg-accent w-full"
            textClassName="text-white"
            testID="button-agree"
          >
            {t("agreeAndContinue")}
          </Button>
          <Pressable
            onPress={handleCancel}
            className="bg-blue w-full h-12 rounded-full items-center justify-center mt-3"
            testID="button-cancel"
          >
            <ThemedText type="button" className="text-white">
              {t("cancel")}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  titleBlock: {
    paddingBottom: Spacing.lg,
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: Spacing["4xl"],
  },
  roadmapColumn: {
    width: 56,
    marginRight: Spacing.xs,
    position: "relative",
    minHeight: 200,
  },
  roadmapTrack: {
    position: "absolute",
    left: 19,
    top: 0,
    bottom: 0,
    width: 6,
    borderRadius: 3,
    backgroundColor: "#E0E0E0",
    overflow: "hidden",
  },
  roadmapFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0B1B3A",
    borderRadius: 3,
  },
  roadmapStepWrapper: {
    position: "absolute",
    left: 0,
    marginTop: -22,
  },
  roadmapStepCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  roadmapStepIcon: {
    opacity: 1,
  },
  cardsContent: {
    flex: 1,
    minWidth: 0,
  },
  actionsBlock: {
    gap: Spacing.md,
  },
});
