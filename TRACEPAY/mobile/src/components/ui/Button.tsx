import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { COLORS, TRACEPAY } from "../../theme/colors";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "muted"
  | "ghost"
  | "destructive";

export type ButtonSize = "lg" | "md" | "sm";

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  arrow?: boolean;
  gradient?: boolean;
  className?: string;
  labelClassName?: string;
  style?: StyleProp<ViewStyle>;
};

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "border border-border bg-card",
  outline: "border border-primary bg-transparent",
  muted: "bg-muted",
  ghost: "bg-transparent",
  destructive: "bg-muted",
};

const LABEL: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-primary",
  outline: "text-primary",
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
  arrow = false,
  gradient = false,
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
  const trace = TRACEPAY[scheme];
  const isDisabled = Boolean(disabled || loading);
  const spinnerColor =
    variant === "primary" ? COLORS.white : palette.primary;

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      disabled={isDisabled}
      className={`relative overflow-hidden flex-row items-center justify-center gap-2 rounded-full ${SIZE[size]} ${CONTAINER[variant]} ${isDisabled ? "opacity-50" : ""} ${className}`}
      style={style}
      {...props}
    >
      {({ pressed }) => {
        const showGradient = (gradient || pressed) && !isDisabled;
        const labelTone = showGradient
          ? "text-primary-foreground"
          : LABEL[variant];
        const iconColor = showGradient
          ? COLORS.white
          : variant === "primary"
            ? COLORS.white
            : palette.primary;

        return (
          <>
            {showGradient ? (
              <LinearGradient
                colors={[
                  trace.splashPayStart,
                  trace.primary,
                  trace.splashPayEnd,
                ]}
                pointerEvents="none"
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {loading ? (
              <ActivityIndicator color={spinnerColor} />
            ) : typeof children === "string" || typeof children === "number" ? (
              <Text className={`${LABEL_SIZE[size]} ${labelTone} ${labelClassName}`}>
                {children}
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
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrow: {
    position: "absolute",
    right: 20,
  },
});
