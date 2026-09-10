import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LeakFlowShell } from "../../../../../src/components/leaks/LeakFlowShell";
import { Button } from "../../../../../src/components/ui/Button";
import { InfoSheet } from "../../../../../src/components/ui/Modal";
import { getActionDetail } from "../../../../../src/features/leaks/fixContent";
import { COLORS, withAlpha } from "../../../../../src/theme/colors";

export default function FixGuideScreen() {
  const params = useLocalSearchParams<{ id: string; actionId: string }>();
  const leakId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "fees";
  const actionId = Array.isArray(params.actionId)
    ? params.actionId[0]
    : params.actionId;
  const detail = getActionDetail(actionId ?? "");
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
          {detail.steps.map((step, index) => (
            <View
              key={step.id}
              className="flex-row items-start gap-3 rounded-2xl bg-card px-4 py-3.5"
            >
              <View
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: withAlpha(palette.primary, 0.12) }}
              >
                <Text className="text-[14px] font-bold text-primary">{index + 1}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground">{step.title}</Text>
                <Text className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  {step.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-7 rounded-3xl bg-muted p-4">
          <Text className="text-[15px] font-bold text-foreground">
            {detail.helpTitle ?? "Need help?"}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {detail.helpSubtitle ??
              "Follow each numbered step above in order. Keep screenshots as proof."}
          </Text>
          <Pressable
            onPress={() => setShowTip(true)}
            className="mt-3 rounded-2xl bg-card px-4 py-3 active:opacity-80"
          >
            <Text className="text-[13px] font-semibold text-primary">
              Quick tip
            </Text>
            <Text className="mt-0.5 text-[12px] text-muted-foreground">
              Tap for a short reminder before you start
            </Text>
          </Pressable>
        </View>

        <Button
          className="mt-6"
          size="md"
          onPress={() => router.push(`/leak/${leakId}/fix/${actionId}/success`)}
        >
          {detail.guideCta}
        </Button>
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
