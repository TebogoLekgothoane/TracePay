import { StatusBar } from "react-native";

import { useTheme } from "@/context/theme-context";

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {children}
    </>
  );
}
