import type { Config } from "tailwindcss";

/**
 * "Editorial Paper" — the design system for Bass Note Piano.
 *
 * The product is a digital companion to a printed curriculum book, so the
 * interface is built like fine print: warm paper ground, ink text, one rust
 * accent, and depth from hairlines and restrained shadow rather than blur.
 *
 * ── Why the palettes are overridden rather than renamed ──────────────────
 * The codebase already uses `slate-*` and `amber-*` semantically and
 * consistently (slate = ground↔text ramp, amber = the single accent), across
 * ~1,450 utility usages in 113 files. Redefining the two ramps here converts
 * every one of them coherently, instead of hand-editing each file and
 * inevitably missing some. This is the same technique the previous system
 * already used to turn "amber" into a dusty rose — extended, not invented.
 *
 * Both ramps are INVERTED relative to a dark theme: in the old system a low
 * number meant "brighter than the ground"; here it means "darker than the
 * ground". So `text-slate-50` is still the strongest text and `bg-slate-950`
 * is still the page, and every existing className keeps its intended meaning.
 *
 * Every value below is contrast-checked against the page ground (#FAF6EC).
 * Ratios are noted inline; nothing used for text falls under WCAG AA 4.5:1.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Ground → ink. High numbers are paper, low numbers are text.
        slate: {
          50: "#1A150F", // 17.1:1 — display headings
          100: "#262119", // 14.8:1 — primary text
          200: "#35302A", // 12.3:1 — strong body
          300: "#453E36", // 9.9:1  — body
          400: "#574F45", // 7.5:1  — secondary
          500: "#655C51", // 6.1:1  — meta
          600: "#736A5E", // 5.0:1  — faintest text still passing AA
          700: "#D5CAB4", // structural: strong rule / inactive marker
          800: "#E8E0CE", // structural: fills, borders
          900: "#F3EDE0", // structural: tinted panel
          950: "#FAF6EC", // the page itself — and text set on the accent
        },
        // The one accent: rust. Works as a fill (paper text on it) and as
        // text (on paper) at the same ratio, which is what lets the existing
        // `bg-amber-400` / `text-amber-400` usages both stay legible.
        amber: {
          100: "#5A2A0C", // 11.0:1 — inline emphasis
          200: "#6B330F", // 9.3:1
          300: "#7F3D14", // 7.6:1  — hover (darker), eyebrow text
          400: "#A04E1E", // 5.4:1  — the workhorse accent
          500: "#C2691F", // decorative gradient stops only
        },
        // Semantic states, re-cut for a light ground.
        emerald: {
          300: "#145C33",
          400: "#1F7A45", // 5.0:1 both as fill and as text
        },
        red: {
          300: "#8F1B12",
          400: "#B32318", // 6.1:1
          500: "#C2321F", // 5.2:1 — destructive fill
        },
        // Hairlines and tints. Replaces the old `white/N` alphas, which are
        // invisible on paper.
        ink: "#1A150F",
      },
      boxShadow: {
        // Warm, tight, low-opacity — print shadow, not UI drop shadow.
        card: "0 1px 2px rgba(26, 21, 15, 0.04), 0 4px 12px -4px rgba(26, 21, 15, 0.06)",
        "card-lifted":
          "0 2px 4px rgba(26, 21, 15, 0.05), 0 12px 28px -8px rgba(26, 21, 15, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
