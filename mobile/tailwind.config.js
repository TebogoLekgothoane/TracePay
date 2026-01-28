/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand palette (single source of truth)
        navy: "#0B1B3A",
        white: "#FFFFFF",
        purple: "#6D28D9",
        "neon-purple": "#BF00FF",
        blue: "#0B1B3A",

        // Semantic tokens (prefer these in className)
        bg: {
          DEFAULT: "#FFFFFF",
          surface: "#F5F5F5",
          card: "#F0F2F7",
        },
        text: {
          DEFAULT: "#0B1B3A",
          muted: "rgba(11, 27, 58, 0.75)",
        },
        accent: {
          DEFAULT: "#BF00FF",
          pressed: "#A800E6",
        },
      },
    },
  },
  plugins: [],
}