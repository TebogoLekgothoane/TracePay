import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Children, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { COLORS } from "../../theme/colors";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "muted"
  | "ghost"
  | "destructive"
  /** Translucent white, for buttons sitting on the dark purple balance card. */
  | "light";

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  arrow?: boolean;
  className?: string;
  labelClassName?: string;
  style?: StyleProp<ViewStyle>;
};

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-card",
  outline: "bg-primary/10",
  muted: "bg-muted",
  ghost: "bg-transparent",
  destructive: "bg-muted",
  light: "bg-white/15",
};

const LABEL: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-primary",
  outline: "text-primary",
  muted: "text-primary",
  ghost: "text-primary",
  destructive: "text-destructive",
  light: "text-white",
};

/** One size for every button, so they all line up across the app. */
const SIZE = "min-h-[56px] px-6";
const LABEL_SIZE = "text-[16px] font-bold";

/** Joins `Text {value} more` style children into one label so they never render bare. */
function labelFrom(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  if (parts.length === 0) return null;
  return parts.every((part) => typeof part === "string" || typeof part === "number")
    ? parts.join("")
    : null;
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  arrow = false,
  disabled,
  className = "",
  labelClassName = "",
  style,
  accessibilityRole = "button",
  ...props
}: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const isDisabled = Boolean(disabled || loading);
  const onFill = variant === "primary" || variant === "light";
  const spinnerColor = onFill ? COLORS.white : palette.primary;
  const iconColor = onFill ? COLORS.white : palette.primary;
  const label = labelFrom(children);

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${SIZE} ${CONTAINER[variant]} ${isDisabled ? "opacity-50" : ""} ${className}`}
      style={style}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : label !== null ? (
        <Text
          className={`${LABEL_SIZE} ${LABEL[variant]} ${labelClassName}`}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : (
        children
      )}
      {arrow && !loading ? (
        <Ionicons
          color={iconColor}
          name="arrow-forward"
          size={18}
          style={styles.arrow}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrow: {
    position: "absolute",
    right: 20,
  },
});
