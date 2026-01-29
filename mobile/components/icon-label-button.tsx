import React from "react";
import { View, Pressable, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

type IconLabelButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** "accent" = red/primary CTA, "primary" = purple-ish, "white" = white text on colored bg */
  variant?: "accent" | "primary" | "white";
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

/**
 * Button with Feather icon + label. Used for voice CTA, primary actions.
 */
export function IconLabelButton({
  icon,
  label,
  onPress,
  variant = "accent",
  iconSize = 18,
  style,
  className = "",
}: IconLabelButtonProps) {
  const isWhite = variant === "white" || variant === "accent";
  const textColor = isWhite ? "#FFFFFF" : undefined;
  const bgClass =
    variant === "accent"
      ? "bg-accent"
      : variant === "primary"
        ? "bg-primary"
        : "bg-accent";

  return (
    <Pressable
      onPress={onPress}
      className={`${bgClass} rounded-full px-5 py-3 flex-row items-center ${className}`}
      style={style}
    >
      <Feather name={icon} size={iconSize} color={textColor ?? "#FFFFFF"} />
      <View style={{ width: Spacing.sm }} />
      <ThemedText type="button" className={textColor ? "text-white" : "text-primary"}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
