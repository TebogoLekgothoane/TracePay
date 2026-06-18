import { View } from "react-native";

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
}: OnboardingHeaderProps) {
  return (
    <View className="onboarding-header pt-10">
      {/* <View className="onboarding-header-logo">
        <TracePayLogo size={90} showWordmark={false} />
      </View> */}

      <View className="step-dots onboarding-step-dots">
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
    </View>
  );
}
