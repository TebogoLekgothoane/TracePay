import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useColorScheme } from "@/hooks/useColorScheme";

export function useInitialAndroidBarSync() {
  const { colors } = useColorScheme();

  useEffect(() => {
    if (Platform.OS === "android") {
      void SystemUI.setBackgroundColorAsync(colors.background);
    }
  }, [colors.background]);
}
