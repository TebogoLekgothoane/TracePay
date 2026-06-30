import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PROMINENT_TAB_CONTENT_INSET } from "@/components/ProminentTabBar";

export type BottomInset = "tab" | "compact";

function bottomPadding(insets: { bottom: number }, isWeb: boolean, mode: BottomInset) {
  const extra = mode === "tab" ? PROMINENT_TAB_CONTENT_INSET : 40;
  return isWeb ? 34 + extra : extra + insets.bottom;
}

/** Safe-area padding for scrollable screen content. */
export function useScreenInsets(bottomInset: BottomInset = "tab") {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return {
    insets,
    isWeb,
    contentPadding: {
      paddingTop: isWeb ? 67 + 16 : insets.top + 16,
      paddingBottom: bottomPadding(insets, isWeb, bottomInset),
    },
    topOffset: isWeb ? 67 : insets.top + 12,
  };
}
