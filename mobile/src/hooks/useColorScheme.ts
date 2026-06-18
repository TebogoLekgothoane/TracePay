import { useColorScheme as useNativewindColorScheme } from "nativewind";

import {
  COLORS,
  type ColorScheme,
  type ThemePalette,
} from "@/theme/colors";

export function useColorScheme(): {
  colorScheme: ColorScheme;
  isDarkColorScheme: boolean;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  colors: ThemePalette;
} {
  const {
    colorScheme,
    setColorScheme: setNativewindColorScheme,
    toggleColorScheme: toggleNativewindColorScheme,
  } = useNativewindColorScheme();

  const resolved: ColorScheme = colorScheme === "dark" ? "dark" : "light";

  return {
    colorScheme: resolved,
    isDarkColorScheme: resolved === "dark",
    setColorScheme: (scheme: ColorScheme) => {
      setNativewindColorScheme(scheme);
    },
    toggleColorScheme: () => {
      toggleNativewindColorScheme();
    },
    colors: COLORS[resolved],
  };
}
