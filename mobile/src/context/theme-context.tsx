import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, ThemeColors } from "@/theme/theme";

const STORAGE_KEY = "@tracepay:darkMode";

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
  c: ThemeColors;
}

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  toggle: () => {},
  c: COLORS.light,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "1") setIsDark(true);
    });
  }, []);

  const toggle = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle, c: isDark ? COLORS.dark : COLORS.light }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
