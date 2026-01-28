import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing, Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";

interface HeaderTitleProps {
  title: string;
}

export function HeaderTitle({ title }: HeaderTitleProps) {
  const { isDark } = useTheme();

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <ThemedText
        style={[
          styles.title,
          { color: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
        ]}
      >
        {title}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  icon: {
    width: 28,
    height: 28,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
});
