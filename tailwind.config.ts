import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Dusty rose/mauve accent, replacing the original amber-gold accent
      // site-wide. Overriding these specific shades of Tailwind's built-in
      // "amber" scale (rather than renaming every amber-* class across ~130
      // files) means every existing text-amber-400, bg-amber-400/10,
      // border-amber-300, etc. picks up the new color automatically.
      colors: {
        amber: {
          100: "#f5e6e0",
          200: "#ecd0c6",
          300: "#dfb7ac",
          400: "#d1a094",
          500: "#b8806f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
