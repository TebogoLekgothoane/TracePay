export interface ThemeColors {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSub: string;
  primary: string;
  primarySoft: string;
  primaryXSoft: string;
  border: string;
  borderSoft: string;
}

const light: ThemeColors = {
  bg: "#FFFFFF",
  bgAlt: "#F7F6FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F4F6",
  text: "#111827",
  textMuted: "#6B7280",
  textSub: "#4B5563",
  primary: "#7C3AED",
  primarySoft: "#C4B5FD",
  primaryXSoft: "#F5F3FF",
  border: "#E5E7EB",
  borderSoft: "#F3F4F6",
};

const dark: ThemeColors = {
  bg: "#111827",
  bgAlt: "#0F172A",
  surface: "#1F2937",
  surfaceAlt: "#374151",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSub: "#D1D5DB",
  primary: "#A78BFA",
  primarySoft: "#5B21B6",
  primaryXSoft: "#2E1065",
  border: "#374151",
  borderSoft: "#1F2937",
};

export const COLORS = { light, dark };
