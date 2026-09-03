import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { COLORS } from "../../theme/colors";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "muted"
  | "ghost"
  | "destructive";

export type ButtonSize = "lg" | "md" | "sm";

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  labelClassName?: string;
  style?: StyleProp<ViewStyle>;
};

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "border border-border bg-card",
  muted: "bg-muted",
  ghost: "bg-transparent",
  destructive: "bg-muted",
};

const LABEL: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-primary",
  muted: "text-primary",
  ghost: "text-primary",
  destructive: "text-destructive",
};

const SIZE: Record<ButtonSize, string> = {
  lg: "min-h-[56px] px-6",
  md: "min-h-[48px] px-5",
  sm: "min-h-[40px] px-4",
};

const LABEL_SIZE: Record<ButtonSize, string> = {
  lg: "text-[16px] font-bold",
  md: "text-[15px] font-semibold",
  sm: "text-[13px] font-semibold",
};

export function Button({
  children,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled,
  className = "",
  labelClassName = "",
  style,
  accessibilityRole = "button",
  ...props
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const isDisabled = Boolean(disabled || loading);
  const spinnerColor =
    variant === "primary" ? palette.primaryForeground : palette.primary;

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      disabled={isDisabled}
      style={style}
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${SIZE[size]} ${CONTAINER[variant]} ${isDisabled ? "opacity-50" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : typeof children === "string" || typeof children === "number" ? (
        <Text className={`${LABEL_SIZE[size]} ${LABEL[variant]} ${labelClassName}`}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
