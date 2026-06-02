import { useThemeContext } from "@/context/theme-context";

export function useTheme() {
  const { theme, isDark, colorScheme, themeMode, setThemeMode } = useThemeContext();

  return {
    theme,
    isDark,
    colorScheme,
    themeMode,
    setThemeMode,
  };
}
