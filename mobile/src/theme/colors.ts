import {
  DarkTheme,
  DefaultTheme,
  type Theme,
} from "@react-navigation/native";

export type ColorScheme = "light" | "dark";

export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  primaryLight: string;
  primarySoft: string;
  primaryXSoft: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  borderSoft: string;
  input: string;
  success: string;
  successLight: string;
  warning: string;
  leakRed: string;
  leakRedLight: string;
  leakOrange: string;
  leakOrangeLight: string;
  leakYellow: string;
  leakYellowLight: string;
  purpleGradientStart: string;
  purpleGradientEnd: string;
  tint: string;
  /** @deprecated use `background` */
  bg: string;
  /** @deprecated use `background` */
  bgAlt: string;
  /** @deprecated use `card` */
  surface: string;
  /** @deprecated use `muted` */
  surfaceAlt: string;
  /** @deprecated use `foreground` */
  text: string;
  /** @deprecated use `mutedForeground` */
  textMuted: string;
  /** @deprecated use `secondaryForeground` */
  textSub: string;
}

const light: ThemePalette = {
  background: "#F7F6FB",
  foreground: "#111827",
  card: "#FFFFFF",
  cardForeground: "#111827",
  primary: "#7C3AED",
  primaryForeground: "#FFFFFF",
  primaryLight: "#EDE9FE",
  primarySoft: "#C4B5FD",
  primaryXSoft: "#F5F3FF",
  secondary: "#F3F4F6",
  secondaryForeground: "#374151",
  muted: "#F3F4F6",
  mutedForeground: "#6B7280",
  accent: "#A78BFA",
  accentForeground: "#FFFFFF",
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",
  border: "#E5E7EB",
  borderSoft: "#F3F4F6",
  input: "#E5E7EB",
  success: "#16A34A",
  successLight: "#DCFCE7",
  warning: "#F59E0B",
  leakRed: "#DC2626",
  leakRedLight: "#FEF2F2",
  leakOrange: "#EA580C",
  leakOrangeLight: "#FFF7ED",
  leakYellow: "#CA8A04",
  leakYellowLight: "#FEFCE8",
  purpleGradientStart: "#7C3AED",
  purpleGradientEnd: "#A855F7",
  tint: "#7C3AED",
  bg: "#F7F6FB",
  bgAlt: "#F7F6FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F4F6",
  text: "#111827",
  textMuted: "#6B7280",
  textSub: "#4B5563",
};

const dark: ThemePalette = {
  background: "#111827",
  foreground: "#F9FAFB",
  card: "#1F2937",
  cardForeground: "#F9FAFB",
  primary: "#A78BFA",
  primaryForeground: "#FFFFFF",
  primaryLight: "#2E1065",
  primarySoft: "#5B21B6",
  primaryXSoft: "#2E1065",
  secondary: "#374151",
  secondaryForeground: "#D1D5DB",
  muted: "#1F2937",
  mutedForeground: "#9CA3AF",
  accent: "#C4B5FD",
  accentForeground: "#111827",
  destructive: "#F87171",
  destructiveForeground: "#FFFFFF",
  border: "#374151",
  borderSoft: "#1F2937",
  input: "#374151",
  success: "#4ADE80",
  successLight: "#14532D",
  warning: "#FBBF24",
  leakRed: "#F87171",
  leakRedLight: "#7F1D1D",
  leakOrange: "#FB923C",
  leakOrangeLight: "#7C2D12",
  leakYellow: "#FACC15",
  leakYellowLight: "#713F12",
  purpleGradientStart: "#7C3AED",
  purpleGradientEnd: "#A855F7",
  tint: "#A78BFA",
  bg: "#111827",
  bgAlt: "#0F172A",
  surface: "#1F2937",
  surfaceAlt: "#374151",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSub: "#D1D5DB",
};

export const COLORS: Record<ColorScheme, ThemePalette> = { light, dark };

export const NAV_THEME: Record<ColorScheme, Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: light.primary,
      background: light.background,
      card: light.card,
      text: light.foreground,
      border: light.border,
      notification: light.destructive,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: dark.primary,
      background: dark.background,
      card: dark.card,
      text: dark.foreground,
      border: dark.border,
      notification: dark.destructive,
    },
  },
};

export const radius = 12;

export default { light, dark, radius };
