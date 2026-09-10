import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import {
  Modal as RNModal,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../theme/colors";
import { Button } from "./Button";

type InfoSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

/** Lightweight bottom sheet for short explanations (no navigation). */
export function InfoSheet({
  visible,
  title,
  message,
  onClose,
  confirmLabel = "Got it",
}: InfoSheetProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(15, 10, 30, 0.45)" }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="rounded-t-3xl border-t border-border bg-card px-5 pt-5"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <View
            className="mb-4 self-center rounded-full"
            style={{
              width: 36,
              height: 4,
              backgroundColor: palette.border,
            }}
          />
          <Text className="text-[17px] font-bold text-foreground">{title}</Text>
          <Text className="mt-2 text-[14px] leading-6 text-muted-foreground">
            {message}
          </Text>
          <Button className="mt-5" size="md" onPress={onClose}>
            {confirmLabel}
          </Button>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Generic transparent modal wrapper. Prefer InfoSheet for short copy. */
export function Modal({ visible, onClose, children, style }: ModalProps) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="flex-1 items-center justify-center px-6"
        style={[{ backgroundColor: "rgba(15, 10, 30, 0.45)" }, style]}
      >
        <Pressable onPress={(event) => event.stopPropagation()}>{children}</Pressable>
      </Pressable>
    </RNModal>
  );
}
