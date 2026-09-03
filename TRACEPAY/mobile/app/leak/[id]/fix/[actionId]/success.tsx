import { router, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { LeakFlowShell } from "../../../../../src/components/leaks/LeakFlowShell";
import { Button } from "../../../../../src/components/ui/Button";
import { getActionDetail } from "../../../../../src/features/leaks/fixContent";
import { COLORS, TRACEPAY, withAlpha } from "../../../../../src/theme/colors";

function SuccessIllustration({ primary, accent }: { primary: string; accent: string }) {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="42" fill={withAlpha(primary, 0.15)} />
      <Circle cx="60" cy="60" r="30" fill={primary} />
      <Path
        d="M48 60 L56 68 L74 50"
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx="24" cy="28" r="4" fill={accent} opacity={0.8} />
      <Circle cx="96" cy="24" r="3" fill={accent} opacity={0.6} />
      <Circle cx="88" cy="92" r="5" fill={withAlpha(accent, 0.7)} />
      <Circle cx="18" cy="88" r="3" fill={withAlpha(primary, 0.5)} />
    </Svg>
  );
}

export default function FixSuccessScreen() {
  const { id, actionId } = useLocalSearchParams<{ id: string; actionId: string }>();
  const leakId = id ?? "fees";
  const detail = getActionDetail(actionId ?? "");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  if (!detail) {
    return null;
  }

  return (
    <LeakFlowShell title="">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 120,
          alignItems: "center",
          paddingTop: 24,
        }}
      >
        <SuccessIllustration primary={palette.primary} accent={trace.splashAccentPink} />

        <Text className="mt-6 text-center text-[28px] font-bold text-foreground">
          {detail.successTitle}
        </Text>
        <Text className="mt-2 px-4 text-center text-[15px] leading-6 text-muted-foreground">
          {detail.successSubtitle}
        </Text>

        <View className="mt-8 w-full rounded-3xl bg-muted p-4">
          <Text className="text-[15px] font-bold text-foreground">What happens next?</Text>
          <View className="mt-3 gap-3">
            {detail.nextSteps.map((step) => (
              <View key={step} className="flex-row items-start gap-3">
                <View
                  className="mt-0.5 h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: withAlpha(palette.primary, 0.14) }}
                >
                  <Check color={palette.primary} size={12} strokeWidth={2.5} />
                </View>
                <Text className="flex-1 text-[14px] leading-5 text-foreground">{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <Button
          className="mt-8"
          size="md"
          onPress={() => router.replace(`/leak/${leakId}/progress`)}
        >
          {detail.doneCta}
        </Button>
      </ScrollView>
    </LeakFlowShell>
  );
}
