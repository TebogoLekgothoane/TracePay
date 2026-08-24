import { memo } from "react";
import { Pressable, Text, View } from "react-native";

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={disabled}
          hitSlop={12}
          onPress={onBack}
          className="min-h-11 justify-center active:opacity-70"
        >
          <Text className="text-[16px] font-semibold text-primary">Back</Text>
        </Pressable>
      ) : (
        <View />
      )}

      {showSkip ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          disabled={disabled}
          hitSlop={12}
          onPress={onSkip}
          className="min-h-11 justify-center active:opacity-70"
        >
          <Text className="text-[16px] font-semibold text-primary">Skip</Text>
        </Pressable>
      ) : (
        <View />
      )}
    </View>
  );
}

export const OnboardingHeader = memo(OnboardingHeaderComponent);
