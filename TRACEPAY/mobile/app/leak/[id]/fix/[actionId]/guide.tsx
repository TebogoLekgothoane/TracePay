import { useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  LeakFlowShell,
  neutralCardStyle,
  neutralPillColor,
} from "../../../../../src/components/leaks/LeakFlowShell";
import { InfoSheet } from "../../../../../src/components/ui/Modal";
import { getActionDetail, type GuideLink, type GuideStep } from "../../../../../src/features/leaks/fixContent";
import { personalGuideForAction } from "../../../../../src/features/leaks/personalCancelSteps";
import { useLeakFindings } from "../../../../../src/hooks/useLeakFindings";
import { COLORS } from "../../../../../src/theme/colors";

const PERSONAL_ACTIONS = new Set(["cancel", "pause", "cancel-debit"]);

function stepLinks(step: GuideStep): GuideLink[] {
  if (step.links && step.links.length > 0) return step.links;
  return step.link ? [step.link] : [];
}

async function openGuideLink(link: GuideLink): Promise<void> {
  try {
    await Linking.openURL(link.url);
    return;
  } catch {
    // Fall back to the web URL when the app scheme cannot open on this device.
  }
  if (link.fallbackUrl && link.fallbackUrl !== link.url) {
    try {
      await Linking.openURL(link.fallbackUrl);
    } catch {
      // Ignore if neither opens.
    }
  }
}

export default function FixGuideScreen() {
  const params = useLocalSearchParams<{ id: string; actionId: string }>();
  const actionId = Array.isArray(params.actionId)
    ? params.actionId[0]
    : params.actionId;
  const baseDetail = getActionDetail(actionId ?? "");
  // Generic cancel and debit-order guides are rewritten from the user's own statement findings when we have them.
  // Payments the user said they use are already taken out of these detections.
  const detections = useLeakFindings(PERSONAL_ACTIONS.has(actionId ?? ""));
  const personal = useMemo(
    () => personalGuideForAction(actionId, detections.result),
    [actionId, detections.result],
  );
  const detail = baseDetail && personal
    ? { ...baseDetail, steps: personal.steps, guideSubtitle: personal.subtitle }
    : baseDetail;
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [showTip, setShowTip] = useState(false);

  if (!detail) {
    return null;
  }

  return (
    <LeakFlowShell title={detail.guideTitle} subtitle={detail.guideSubtitle}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <View className="mt-5 gap-2">
          {detail.steps.map((step, index) => {
            const links = stepLinks(step);
            return (
              <View
                key={step.id}
                className="flex-row items-start gap-3 rounded-2xl bg-card px-4 py-3.5"
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: neutralPillColor(palette) }}
                >
                  <Text className="text-[14px] font-bold text-primary">{index + 1}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-foreground">{step.title}</Text>
                  <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                    {step.description}
                  </Text>
                  {links.length > 0 ? (
                    <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                      {links.map((link) => (
                        <Pressable
                          key={`${link.label}:${link.url}`}
                          accessibilityRole="link"
                          accessibilityLabel={`Open ${link.label}`}
                          onPress={() => {
                            void openGuideLink(link);
                          }}
                          className="self-start py-1 active:opacity-60"
                        >
                          <Text
                            className="text-[13px] font-semibold"
                            style={{ textDecorationLine: "underline", color: "#FDBA74" }}
                          >
                            Open {link.label} ↗
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View className="mt-7 rounded-3xl bg-card p-4" style={neutralCardStyle(palette)}>
          <Text className="text-[15px] font-bold text-foreground">
            {detail.helpTitle ?? "Need help?"}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {detail.helpSubtitle ??
              "Follow each numbered step above in order. Keep screenshots as proof."}
          </Text>
          <Pressable
            onPress={() => setShowTip(true)}
            className="mt-3 self-start py-1 active:opacity-60"
          >
            <Text
              className="text-[13px] font-semibold"
              style={{ textDecorationLine: "underline", color: "#FDBA74" }}
            >
              Quick tip
            </Text>
            <Text className="mt-0.5 text-[12px] text-muted-foreground">
              Tap for a short reminder before you start
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <InfoSheet
        visible={showTip}
        title={detail.helpTitle ?? "Before you start"}
        message={
          detail.helpSubtitle ??
          "Do the steps in order, keep confirmation screenshots, and check your next statement to confirm the charge stopped."
        }
        onClose={() => setShowTip(false)}
      />
    </LeakFlowShell>
  );
}
