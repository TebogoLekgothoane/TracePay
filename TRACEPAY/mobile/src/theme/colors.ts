type ColorScheme = "light" | "dark";

function withAlpha(color: string, alpha: number): string {
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}

const TRACEPAY = {
  light: {
    background: "rgb(250, 249, 254)",
    foreground: "rgb(23, 24, 45)",
    card: "rgb(255, 255, 255)",
    muted: "rgb(238, 234, 253)",
    mutedForeground: "rgb(119, 120, 140)",
    primary: "rgb(121, 85, 231)",
    primaryForeground: "rgb(255, 255, 255)",
    secondary: "rgb(50, 125, 252)",
    accent: "rgb(246, 81, 194)",
    destructive: "rgb(209, 76, 103)",
    warning: "rgb(249, 115, 22)",
    success: "rgb(20, 184, 166)",
    border: "rgb(200, 189, 240)",
    input: "rgb(255, 255, 255)",
    inputBorder: "rgb(200, 189, 240)",
    placeholder: "rgb(183, 177, 202)",
    surfaceSoft: "rgb(238, 234, 253)",
    pinEmpty: "rgb(91, 96, 112)",
    pinFilled: "rgb(121, 85, 231)",
    keyPressed: "rgba(116, 84, 219, 0.13)",
    splashBackground: "#FAF9FE",
    splashForeground: "#17182D",
    splashMuted: "#77788C",
    splashAccentPink: "#F651C2",
    splashAccentBlue: "#327DFC",
    splashPayStart: "#C855E9",
    splashPayEnd: "#327DFC",
    splashPoint: "#FA65C5",
    summaryGradient: ["#1E1245", "#2A1860", "#1A1040"] as const,
    heroForeground: "rgb(255, 255, 255)",
    heroMuted: "rgba(255, 255, 255, 0.75)",
    heroSubtle: "rgba(255, 255, 255, 0.1)",
  },
  dark: {
    background: "rgb(11, 11, 15)",
    foreground: "rgb(255, 255, 255)",
    card: "rgb(22, 22, 28)",
    muted: "rgb(28, 28, 34)",
    mutedForeground: "rgb(154, 154, 164)",
    primary: "rgb(167, 139, 250)",
    primaryForeground: "rgb(255, 255, 255)",
    secondary: "rgb(50, 125, 252)",
    accent: "rgb(246, 81, 194)",
    destructive: "rgb(248, 113, 113)",
    warning: "rgb(251, 146, 60)",
    success: "rgb(45, 212, 191)",
    border: "rgb(42, 42, 50)",
    input: "rgb(22, 22, 28)",
    inputBorder: "rgb(58, 58, 68)",
    placeholder: "rgb(107, 113, 133)",
    surfaceSoft: "rgba(167, 139, 250, 0.12)",
    pinEmpty: "rgb(91, 96, 112)",
    pinFilled: "rgb(155, 123, 255)",
    keyPressed: "rgba(167, 139, 250, 0.13)",
    splashBackground: "#0B0B0F",
    splashForeground: "#FFFFFF",
    splashMuted: "#C5C9D8",
    splashAccentPink: "#F651C2",
    splashAccentBlue: "#327DFC",
    splashPayStart: "#C855E9",
    splashPayEnd: "#327DFC",
    splashPoint: "#FA65C5",
    summaryGradient: ["#141025", "#1E1245", "#100A20"] as const,
    heroForeground: "rgb(255, 255, 255)",
    heroMuted: "rgba(255, 255, 255, 0.75)",
    heroSubtle: "rgba(255, 255, 255, 0.1)",
  },
} as const;

const COLORS = {
  white: "rgb(255, 255, 255)",
  black: "rgb(0, 0, 0)",
  background: TRACEPAY.light.background,
  foreground: TRACEPAY.light.foreground,
  grey: TRACEPAY.light.mutedForeground,
  border: TRACEPAY.light.border,
  purple: TRACEPAY.light.primary,
  light: {
    text: TRACEPAY.light.foreground,
    background: TRACEPAY.light.background,
    foreground: TRACEPAY.light.foreground,
    primary: TRACEPAY.light.primary,
    card: TRACEPAY.light.card,
    blue: TRACEPAY.light.secondary,
    purple: TRACEPAY.light.primary,
    destructive: TRACEPAY.light.destructive,
    warning: TRACEPAY.light.warning,
    success: TRACEPAY.light.success,
    accent: TRACEPAY.light.accent,
    muted: TRACEPAY.light.muted,
    mutedForeground: TRACEPAY.light.mutedForeground,
    border: TRACEPAY.light.border,
    input: TRACEPAY.light.input,
    inputBorder: TRACEPAY.light.inputBorder,
    placeholder: TRACEPAY.light.placeholder,
    surfaceSoft: TRACEPAY.light.surfaceSoft,
    pinEmpty: TRACEPAY.light.pinEmpty,
    pinFilled: TRACEPAY.light.pinFilled,
    keyPressed: TRACEPAY.light.keyPressed,
  },
  dark: {
    text: TRACEPAY.dark.foreground,
    background: TRACEPAY.dark.background,
    foreground: TRACEPAY.dark.foreground,
    primary: TRACEPAY.dark.primary,
    card: TRACEPAY.dark.card,
    blue: TRACEPAY.dark.secondary,
    purple: TRACEPAY.dark.primary,
    destructive: TRACEPAY.dark.destructive,
    warning: TRACEPAY.dark.warning,
    success: TRACEPAY.dark.success,
    accent: TRACEPAY.dark.accent,
    muted: TRACEPAY.dark.muted,
    mutedForeground: TRACEPAY.dark.mutedForeground,
    border: TRACEPAY.dark.border,
    input: TRACEPAY.dark.input,
    inputBorder: TRACEPAY.dark.inputBorder,
    placeholder: TRACEPAY.dark.placeholder,
    surfaceSoft: TRACEPAY.dark.surfaceSoft,
    pinEmpty: TRACEPAY.dark.pinEmpty,
    pinFilled: TRACEPAY.dark.pinFilled,
    keyPressed: TRACEPAY.dark.keyPressed,
  },
} as const;

type ImpactTone = "high" | "mediumWarm" | "mediumCool" | "lowTeal" | "lowBlue";

function getImpactToneStyles(scheme: ColorScheme, tone: ImpactTone) {
  const trace = TRACEPAY[scheme];
  const surfaceAlpha = scheme === "dark" ? 0.18 : 0.14;

  const tones: Record<ImpactTone, { color: string; surface: string }> = {
    high: {
      color: trace.destructive,
      surface: withAlpha(trace.destructive, surfaceAlpha),
    },
    mediumWarm: {
      color: trace.warning,
      surface: withAlpha(trace.warning, surfaceAlpha),
    },
    mediumCool: {
      color: trace.primary,
      surface: withAlpha(trace.primary, surfaceAlpha),
    },
    lowTeal: {
      color: trace.success,
      surface: withAlpha(trace.success, surfaceAlpha),
    },
    lowBlue: {
      color: trace.secondary,
      surface: withAlpha(trace.secondary, surfaceAlpha),
    },
  };

  return tones[tone];
}

export { COLORS, TRACEPAY, withAlpha, getImpactToneStyles };
export type { ColorScheme, ImpactTone };
