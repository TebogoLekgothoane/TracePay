import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

import { useColorScheme } from "@/hooks/useColorScheme";
import { GLASS } from "@/theme/colors";

type GlassBackgroundProps = {
  children?: React.ReactNode;
};

/** Deep violet mesh gradient with soft purple light blobs (dark mode only). */
export function GlassBackground({ children }: GlassBackgroundProps) {
  const { isDarkColorScheme } = useColorScheme();

  if (!isDarkColorScheme) {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 bg-background">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[GLASS.background, GLASS.meshMid, GLASS.meshDeep, GLASS.background]}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.blob,
            {
              top: -80,
              right: -60,
              width: 280,
              height: 280,
              backgroundColor: GLASS.blobViolet,
            },
          ]}
        />
        <View
          style={[
            styles.blob,
            {
              top: "28%",
              left: -100,
              width: 320,
              height: 320,
              backgroundColor: GLASS.blobIndigo,
            },
          ]}
        />
        <View
          style={[
            styles.blob,
            {
              bottom: "12%",
              right: -40,
              width: 260,
              height: 260,
              backgroundColor: GLASS.blobNeon,
            },
          ]}
        />
        <View
          style={[
            styles.blob,
            {
              bottom: -120,
              left: "20%",
              width: 300,
              height: 300,
              backgroundColor: GLASS.blobViolet,
              opacity: 0.5,
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    borderRadius: 9999,
  },
});
