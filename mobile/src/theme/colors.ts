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

/** Liquid-glass dark palette — matches premium violet mesh reference UI. */
const dark: ThemePalette = {
  background: "#05010A",
  foreground: "#FFFFFF",
  card: "rgba(255, 255, 255, 0.05)",
  cardForeground: "#FFFFFF",
  primary: "#A855F7",
  primaryForeground: "#FFFFFF",
  primaryLight: "rgba(168, 85, 247, 0.15)",
  primarySoft: "#7C3AED",
  primaryXSoft: "rgba(124, 58, 237, 0.12)",
  secondary: "rgba(255, 255, 255, 0.08)",
  secondaryForeground: "rgba(255, 255, 255, 0.85)",
  muted: "rgba(255, 255, 255, 0.05)",
  mutedForeground: "rgba(255, 255, 255, 0.60)",
  accent: "#A855F7",
  accentForeground: "#FFFFFF",
  destructive: "#F87171",
  destructiveForeground: "#FFFFFF",
  border: "transparent",
  borderSoft: "rgba(255, 255, 255, 0.06)",
  input: "rgba(255, 255, 255, 0.08)",
  success: "#4ADE80",
  successLight: "rgba(74, 222, 128, 0.15)",
  warning: "#FBBF24",
  leakRed: "#F87171",
  leakRedLight: "rgba(248, 113, 113, 0.15)",
  leakOrange: "#FB923C",
  leakOrangeLight: "rgba(251, 146, 60, 0.15)",
  leakYellow: "#FACC15",
  leakYellowLight: "rgba(250, 204, 21, 0.15)",
  purpleGradientStart: "#4C1D95",
  purpleGradientEnd: "#A855F7",
  tint: "#A855F7",
  bg: "#05010A",
  bgAlt: "#0A0118",
  surface: "rgba(255, 255, 255, 0.05)",
  surfaceAlt: "rgba(255, 255, 255, 0.08)",
  text: "#FFFFFF",
  textMuted: "rgba(255, 255, 255, 0.60)",
  textSub: "rgba(255, 255, 255, 0.85)",
};

/** Shared glass tokens for components (dark mode). */
export const GLASS = {
  background: "#05010A",
  meshMid: "#1A0533",
  meshDeep: "#0A0118",
  blobViolet: "rgba(124, 58, 237, 0.35)",
  blobIndigo: "rgba(76, 29, 149, 0.40)",
  blobNeon: "rgba(168, 85, 247, 0.25)",
  surface: "rgba(255, 255, 255, 0.05)",
  surfaceStrong: "rgba(255, 255, 255, 0.08)",
  highlight: "rgba(255, 255, 255, 0.10)",
  primaryTint: "#A855F7",
  primaryGradient: ["#7C3AED", "#A855F7"] as const,
  glow: "rgba(168, 85, 247, 0.45)",
} as const;

export const tailwindTheme = {
  colors: {
    background: "rgb(var(--background) / <alpha-value>)",
    foreground: "rgb(var(--foreground) / <alpha-value>)",
    card: {
      DEFAULT: "rgb(var(--card) / <alpha-value>)",
      foreground: "rgb(var(--card-foreground) / <alpha-value>)",
    },
    muted: {
      DEFAULT: "rgb(var(--muted) / <alpha-value>)",
      foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
    },
    border: "rgb(var(--border) / <alpha-value>)",
    input: "rgb(var(--input) / <alpha-value>)",
    primary: {
      DEFAULT: "rgb(var(--primary) / <alpha-value>)",
      foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
    },
    secondary: {
      DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
      foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
    },
    destructive: "rgb(var(--destructive) / <alpha-value>)",
    accent: "rgb(var(--accent) / <alpha-value>)",
    navy: "rgb(var(--navy) / <alpha-value>)",
    white: "#FFFFFF",
    purple: "#6D28D9",
    "neon-purple": "#A855F7",
    blue: "#0B1B3A",
    bg: {
      DEFAULT: "#FFFFFF",
      surface: "#F5F5F5",
      card: "#F0F2F7",
    },
    text: {
      DEFAULT: "#0B1B3A",
      muted: "rgba(11, 27, 58, 0.75)",
    },
    brand: {
      purple: "#7C3AED",
      "purple-dark": "#A855F7",
      "purple-light": "#EDE9FE",
      "purple-muted": "#C4B5FD",
      "purple-faint": "#FAFAFF",
    },
    app: {
      bg: "#F7F6FB",
    },
    gray: {
      50: "#F9FAFB",
      100: "#F3F4F6",
      200: "#E5E7EB",
      300: "#D1D5DB",
      400: "#9CA3AF",
      500: "#6B7280",
      600: "#4B5563",
      700: "#374151",
      800: "#1F2937",
      900: "#111827",
    },
    red: {
      50: "#FEF2F2",
      100: "#FEE2E2",
      200: "#FECACA",
      600: "#DC2626",
      700: "#B91C1C",
      800: "#991B1B",
      900: "#7F1D1D",
    },
    green: {
      50: "#F0FDF4",
      100: "#DCFCE7",
      200: "#BBF7D0",
      400: "#4ADE80",
      600: "#16A34A",
      700: "#15803D",
    },
    amber: {
      50: "#FFFBEB",
      100: "#FEF3C7",
      200: "#FDE68A",
      500: "#F59E0B",
      600: "#D97706",
    },
    yellow: {
      50: "#FEFCE8",
      100: "#FEF9C3",
      600: "#CA8A04",
      800: "#92400E",
    },
    violet: {
      50: "#F5F3FF",
      100: "#EDE9FE",
      400: "#A78BFA",
    },
    info: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#DC2626",
  },
  fontFamily: {
    sans: ["Inter_400Regular"],
    medium: ["Inter_500Medium"],
    semibold: ["Inter_600SemiBold"],
    bold: ["Inter_700Bold"],
  },
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
