import { Text, type TextProps } from "react-native";

import { useTheme } from "@/hooks/use-theme-color";
import { Typography } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "hero" | "h1" | "h2" | "h3" | "h4" | "body" | "small" | "link" | "button";
  className?: string;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  className,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark } = useTheme();

  const getColor = () => {
    if (isDark && darkColor) {
      return darkColor;
    }

    if (!isDark && lightColor) {
      return lightColor;
    }

    if (type === "link") {
      return theme.link;
    }

    return theme.text;
  };

  const getTypeStyle = () => {
    switch (type) {
      case "hero":
        return Typography.hero;
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "small":
        return Typography.small;
      case "link":
        return Typography.link;
      case "button":
        return Typography.button;
      default:
        return Typography.body;
    }
  };

  // If className is provided, don't apply theme color (let Tailwind handle it)
  const colorStyle = className ? {} : { color: getColor() };

  return (
    <Text className={className} style={[colorStyle, getTypeStyle(), style]} {...rest} />
  );
}
