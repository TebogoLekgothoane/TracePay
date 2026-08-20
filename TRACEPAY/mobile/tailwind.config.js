/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
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
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        warning: "rgb(var(--warning) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        input: {
          DEFAULT: "rgb(var(--input) / <alpha-value>)",
          border: "rgb(var(--input-border) / <alpha-value>)",
        },
        ring: "rgb(var(--ring) / <alpha-value>)",
        placeholder: "rgb(var(--placeholder) / <alpha-value>)",
        "surface-soft": "rgb(var(--surface-soft) / <alpha-value>)",
        "pin-empty": "rgb(var(--pin-empty) / <alpha-value>)",
        "pin-filled": "rgb(var(--pin-filled) / <alpha-value>)",
        "key-pressed": "rgb(var(--key-pressed) / <alpha-value>)",
        "trace-background": "rgb(var(--trace-background) / <alpha-value>)",
        "trace-foreground": "rgb(var(--trace-foreground) / <alpha-value>)",
        "trace-muted": "rgb(var(--trace-muted) / <alpha-value>)",
        "trace-border": "rgb(var(--trace-border) / <alpha-value>)",
        "trace-purple": "rgb(var(--trace-purple) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
