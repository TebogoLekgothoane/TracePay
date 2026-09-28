import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Pressable,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, withAlpha } from "../../theme/colors";
import { Button } from "./Button";

function useSheetRef(visible: boolean) {
  const ref = useRef<BottomSheetModal>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) {
      return;
    }
    if (visible) {
      sheet.present();
      return;
    }
    sheet.dismiss();
  }, [visible]);

  return ref;
}

type InfoSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

/** Native Expo UI community bottom sheet for short explanations. */
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
  const ref = useSheetRef(visible);

  return (
    <BottomSheetModal
      ref={ref}
      backgroundStyle={{ backgroundColor: palette.card }}
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: palette.border, width: 36 }}
      onDismiss={onClose}
    >
      <BottomSheetView
        style={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        <Text className="text-[17px] font-bold text-foreground">{title}</Text>
        <Text className="mt-2 text-[14px] leading-6 text-muted-foreground">
          {message}
        </Text>
        <Button className="mt-5" size="md" onPress={onClose}>
          {confirmLabel}
        </Button>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Native Expo UI community bottom sheet wrapper. */
export function Modal({ visible, onClose, children, style }: ModalProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const ref = useSheetRef(visible);

  return (
    <BottomSheetModal
      ref={ref}
      backgroundStyle={{ backgroundColor: palette.card }}
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: palette.border, width: 36 }}
      onDismiss={onClose}
    >
      <BottomSheetView
        style={[
          {
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 20),
          },
          style,
        ]}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

type SelectionOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type SelectionSheetProps<T extends string> = {
  visible: boolean;
  title: string;
  options: SelectionOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
};

/** Native Expo UI community bottom sheet for single-choice filters. */
export function SelectionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: SelectionSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const ref = useSheetRef(visible);
  const snapPoints = useMemo(() => ["50%", "75%"], []);

  return (
    <BottomSheetModal
      ref={ref}
      backgroundStyle={{ backgroundColor: palette.card }}
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: palette.border, width: 36 }}
      snapPoints={snapPoints}
      onDismiss={onClose}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        <Text className="mb-1 text-[17px] font-bold text-foreground">{title}</Text>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className="rounded-2xl border px-4 py-3.5 active:opacity-80"
              style={{
                borderColor: isSelected ? palette.primary : palette.border,
                backgroundColor: isSelected
                  ? withAlpha(palette.primary, 0.12)
                  : palette.card,
              }}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              <Text
                className="text-[15px] font-semibold"
                style={{
                  color: isSelected ? palette.primary : palette.foreground,
                }}
              >
                {option.label}
              </Text>
              {option.description ? (
                <Text className="mt-0.5 text-[13px] text-muted-foreground">
                  {option.description}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

type FormSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When false, swipe-to-dismiss and backdrop tap are locked (e.g. while submitting). */
  dismissible?: boolean;
  snapPoints?: Array<string | number>;
};

/** Dismissible Expo UI community bottom sheet for forms (auth, filters, etc.). */
export function FormSheet({
  visible,
  onClose,
  children,
  dismissible = true,
  snapPoints: snapPointsProp,
}: FormSheetProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const ref = useSheetRef(visible);
  const snapPoints = useMemo(
    () => snapPointsProp ?? ["72%", "92%"],
    [snapPointsProp],
  );

  return (
    <BottomSheetModal
      ref={ref}
      backgroundStyle={{ backgroundColor: palette.card }}
      enablePanDownToClose={dismissible}
      handleIndicatorStyle={{ backgroundColor: palette.border, width: 36 }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      snapPoints={snapPoints}
      onDismiss={onClose}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 28,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 28),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
