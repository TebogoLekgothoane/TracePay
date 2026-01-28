import React from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";

export function VoiceModal({ text }: { text: string }) {
  return (
    <View className="bg-white rounded-3xl px-6 py-6">
      <ThemedText type="h3" className="text-text">
        Mamela imali yam
      </ThemedText>
      <ThemedText type="body" className="text-text-muted mt-4">
        {text}
      </ThemedText>
    </View>
  );
}

