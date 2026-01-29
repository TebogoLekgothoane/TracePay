import React, { ReactNode } from "react";
import { View, Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const { theme } = useTheme();

  return (
    <View className="mb-8">
      <ThemedText type="h3" className="text-text mb-3">
        {title}
      </ThemedText>
      <View
        className="rounded-[20px] p-4 gap-4"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {children}
      </View>
    </View>
  );
}

type SettingsRowProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
};

export function SettingsRow({
  title,
  subtitle,
  right,
  onPress,
}: SettingsRowProps) {
  const content = (
    <>
      <View className="flex-1">
        <ThemedText type="body">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" className="text-text-muted mt-1">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right ? <View className="ml-3">{right}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center py-4 active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }

  return <View className="flex-row items-center py-4">{content}</View>;
}
