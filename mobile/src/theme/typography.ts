/** Central typography scale — single source of truth for text sizes. */
export const textVariants = {
  /** Page hero headline (welcome, onboarding titles). */
  display: "text-4xl font-bold leading-tight tracking-tight text-foreground",
  /** Brand-coloured inline word in a display headline. */
  displayAccent: "text-4xl font-bold leading-tight tracking-tight text-brand-purple",
  /** Large intro / subtitle under headlines. */
  lead: "text-lg font-sans leading-7 text-muted-foreground",
  /** Section title — semibold. */
  title: "text-lg font-semibold text-foreground",
  /** Section title — bold, smaller pages. */
  titleMd: "text-2xl font-bold text-foreground",
  /** Screen section heading. */
  titleLg: "text-[28px] font-bold leading-[34px] text-foreground",
  /** Default body copy. */
  body: "text-base font-sans leading-6 text-foreground",
  /** Default body copy — muted. */
  bodyMuted: "text-base font-sans leading-6 text-muted-foreground",
  /** Secondary / compact body. */
  bodySm: "text-sm font-sans leading-5 text-muted-foreground",
  /** Form labels, list row labels. */
  label: "text-[13px] font-semibold text-secondary-foreground",
  /** Fine print, timestamps. */
  caption: "text-xs font-sans text-muted-foreground",
  /** Uppercase section kicker. */
  overline: "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground",
  /** Uppercase brand kicker. */
  overlineBrand:
    "text-[11px] font-semibold uppercase tracking-wider text-brand-purple",
  /** Inline brand accent (inherits surrounding size). */
  accent: "text-brand-purple",
} as const;

export type TextVariant = keyof typeof textVariants;
