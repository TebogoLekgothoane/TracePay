/**
 * Colours taken from the Leaks tab and the leak category pages, so Insights looks like the same app.
 *
 * Sources: category tile tints (leak-categories.ts), the up/down change colours on the category tiles
 * (LeakCategoryCards.tsx) and the theme's success, blue and warning marks used on the category pages.
 */
export const LEAK_COLORS = {
  /** Bank fees tile. */
  purple: "#6D3FE0",
  /** Subscriptions tile. */
  orange: "#F97316",
  /** Airtime & Data tile. */
  yellow: "#EAB308",
  /** Debit orders tile. */
  blue: "#2563EB",
  /** Spending went up on a category tile. */
  up: "#F43F5E",
  /** Spending went down on a category tile. */
  down: "#22C55E",
  /** Theme success mark on the category pages. */
  teal: "rgb(20, 184, 166)",
  /** Theme blue mark on the category pages. */
  sky: "rgb(50, 125, 252)",
} as const;

/** Order for charts that give each row its own colour: the four category tints first. */
export const LEAK_SERIES = [
  LEAK_COLORS.purple,
  LEAK_COLORS.orange,
  LEAK_COLORS.yellow,
  LEAK_COLORS.blue,
  LEAK_COLORS.teal,
  LEAK_COLORS.up,
  LEAK_COLORS.down,
  LEAK_COLORS.sky,
];
