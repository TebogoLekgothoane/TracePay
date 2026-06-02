import { View, type ViewProps } from "react-native";

import { useTheme } from "@/hooks/use-theme-color";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  className?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  className,
  ...otherProps
}: ThemedViewProps) {
  const { theme, isDark } = useTheme();

  const backgroundColor =
    isDark && darkColor
      ? darkColor
      : !isDark && lightColor
        ? lightColor
        : theme.backgroundRoot;

  return <View className={className} style={[{ backgroundColor }, style]} {...otherProps} />;
}
