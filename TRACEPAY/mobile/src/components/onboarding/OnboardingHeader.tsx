import { memo } from "react";
import { View } from "react-native";

import { Button } from "../ui/Button";

type Props = {
  canGoBack: boolean;
  showSkip: boolean;
  disabled: boolean;
  onBack: () => void;
  onSkip: () => void;
};

function OnboardingHeaderComponent({
  canGoBack,
  showSkip,
  disabled,
  onBack,
  onSkip,
}: Props) {
  return (
    <View className="h-12 flex-row items-center justify-between px-6">
      {canGoBack ? (
        <Button
          accessibilityLabel="Back"
          disabled={disabled}
          hitSlop={12}
          onPress={onBack}
          size="sm"
          variant="ghost"
          className="min-h-11 px-0"
        >
          Back
        </Button>
      ) : (
        <View />
      )}

      {showSkip ? (
        <Button
          accessibilityLabel="Skip onboarding"
          disabled={disabled}
          hitSlop={12}
          onPress={onSkip}
          size="sm"
          variant="ghost"
          className="min-h-11 px-0"
        >
          Skip
        </Button>
      ) : (
        <View />
      )}
    </View>
  );
}

export const OnboardingHeader = memo(OnboardingHeaderComponent);
