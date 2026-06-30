import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { TracePayLogo } from "@/components/TracePayLogo";
import { cn } from "@/lib/cn";

export const ONBOARDING_TOTAL_STEPS = 5;

export const ONBOARDING_STEPS = {
  language: 0,
  welcome: 1,
  features: 2,
  consent: 3,
  auth: 4,
} as const;

export type OnboardingHeaderProps = {
  /** Zero-based index of the current onboarding step */
  currentStep: number;
  totalSteps?: number;
  showBack?: boolean;
};

const ROUTE_TO_STEP: Record<string, number> = {
  language: ONBOARDING_STEPS.language,
  welcome: ONBOARDING_STEPS.welcome,
  features: ONBOARDING_STEPS.features,
  consent: ONBOARDING_STEPS.consent,
  index: ONBOARDING_STEPS.auth,
};

export function getOnboardingStepFromRoute(routeName: string): number | null {
  return ROUTE_TO_STEP[routeName] ?? null;
}

export function OnboardingHeader({
  currentStep,
  totalSteps = ONBOARDING_TOTAL_STEPS,
  showBack = false,
}: OnboardingHeaderProps) {
  return (
    <View className="onboarding-header px-6 pt-4">
      <View className="flex-row items-center">
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] dark:bg-white/[0.08]"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={22} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View className="h-9 w-9" />
        )}

        <View className="step-dots onboarding-step-dots flex-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <View
              key={i}
              className={cn(
                "step-dot",
                i === currentStep && "step-dot-active",
                i < currentStep && "step-dot-done",
              )}
            />
          ))}
        </View>

        <View className="h-9 w-9" />
      </View>
    </View>
  );
}
