import React, { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";

type FloatingButtonProps = {
  children: ReactNode;
  bottomOffset?: number;
  rightOffset?: number;
};

export function FloatingButton({
  children,
  bottomOffset = Spacing.lg,
  rightOffset = Spacing.lg,
}: FloatingButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="absolute"
      style={{
        bottom: insets.bottom + bottomOffset,
        right: rightOffset,
      }}
    >
      {children}
    </View>
  );
}
