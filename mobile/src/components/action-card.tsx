import React from "react";
import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/themed-text";

type IconName = React.ComponentProps<typeof Feather>["name"];

type ActionCardProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
};

/**
 * Card for actions tab: icon in circle + title + subtitle. Pressable.
 */
export function ActionCard({ icon, title, subtitle, onPress }: ActionCardProps) {
  return (
    <Pressable
      className="w-[48%] mb-3 rounded-2xl bg-bg-card px-4 py-3 flex-row items-center"
      onPress={onPress}
    >
      <View className="h-9 w-9 rounded-full items-center justify-center bg-primary/10 mr-3">
        <Feather name={icon} size={18} />
      </View>
      <View className="flex-1">
        <ThemedText type="body" className="text-text">
          {title}
        </ThemedText>
        <ThemedText type="small" className="text-text-muted mt-0.5">
          {subtitle}
        </ThemedText>
      </View>
    </Pressable>
  );
}
