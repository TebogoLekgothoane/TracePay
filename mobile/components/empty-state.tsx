import React from "react";
import { View, ImageSourcePropType } from "react-native";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";

type EmptyStateProps = {
  title: string;
  description: string;
  image?: ImageSourcePropType;
  imageSize?: number;
};

export function EmptyState({
  title,
  description,
  image,
  imageSize = 180,
}: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-24">
      {image ? (
        <Image
          source={image}
          className="mb-8"
          style={{ width: imageSize, height: imageSize }}
          contentFit="contain"
        />
      ) : null}
      <ThemedText type="h2" className="text-center mb-2 text-text">
        {title}
      </ThemedText>
      <ThemedText type="body" className="text-center text-text-muted">
        {description}
      </ThemedText>
    </View>
  );
}
