import type { Config } from "tailwindcss";

/**
 * Bass Note Piano — themeable design tokens.
 *
 * Every colour resolves through a CSS custom property rather than a literal
 * hex, so the whole palette can be swapped at runtime by setting
 * `data-theme` / `data-accent` on <html>. The actual values live in
 * globals.css; this file only wires Tailwind's utility generation to them.
 *
 * ── Why the ramps are still called `slate` and `amber` ───────────────────
 * The codebase uses both semantically and consistently — `slate` as the
 * ground↔text ramp, `amber` as the single accent — across ~1,450 utility
 * usages in 113 files. Keeping the names means every existing className
 * (`text-slate-500`, `bg-amber-400`, …) keeps working and simply re-points
 * at whichever theme is active. Renaming them would have meant editing all
 * 113 files to gain nothing.
 *
 * The ramp's *meaning* is fixed regardless of theme: a LOW number is always
 * the strongest text, a HIGH number is always the page ground. In a light
 * theme that means low = dark; in a dark theme, low = light. Each theme in
 * globals.css fills the ramp accordingly, so `text-slate-50` is "the
 * strongest heading colour" everywhere and never needs a per-theme override
 * at the call site.
 *
 * The `<alpha-value>` placeholder is what keeps opacity modifiers working
 * (`bg-amber-400/10`), so the variables store space-separated RGB channels
 * rather than a hex string.
 */
const ramp = (name: string) => ({
  50: `rgb(var(--c-${name}-50) / <alpha-value>)`,
  100: `rgb(var(--c-${name}-100) / <alpha-value>)`,
  200: `rgb(var(--c-${name}-200) / <alpha-value>)`,
  300: `rgb(var(--c-${name}-300) / <alpha-value>)`,
  400: `rgb(var(--c-${name}-400) / <alpha-value>)`,
  500: `rgb(var(--c-${name}-500) / <alpha-value>)`,
  600: `rgb(var(--c-${name}-600) / <alpha-value>)`,
  700: `rgb(var(--c-${name}-700) / <alpha-value>)`,
  800: `rgb(var(--c-${name}-800) / <alpha-value>)`,
  900: `rgb(var(--c-${name}-900) / <alpha-value>)`,
  950: `rgb(var(--c-${name}-950) / <alpha-value>)`,
});

/**
 * The shadcn/ui colour vocabulary, aliased onto the same themed variables
 * everything else here uses. The CSS values live in globals.css' token
 * bridge; this only generates the utilities (`bg-background`, `border-input`,
 * `text-muted-foreground`, …) that shadcn components are written against.
 *
 * Same `<alpha-value>` treatment as the ramps above, so `bg-primary/90` — the
 * default Button's hover state — actually produces a translucent accent
 * rather than being dropped.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-mode="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // shadcn blocks lay themselves out inside `.container`. Tailwind's stock
    // container has no centring and no gutter, so without this the navbar
    // would sit flush against the left edge on wide screens.
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        serif: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        slate: ramp("s"),
        amber: {
          100: "rgb(var(--c-a-100) / <alpha-value>)",
          200: "rgb(var(--c-a-200) / <alpha-value>)",
          300: "rgb(var(--c-a-300) / <alpha-value>)",
          400: "rgb(var(--c-a-400) / <alpha-value>)",
          500: "rgb(var(--c-a-500) / <alpha-value>)",
        },
        emerald: {
          300: "rgb(var(--c-em-300) / <alpha-value>)",
          400: "rgb(var(--c-em-400) / <alpha-value>)",
        },
        red: {
          300: "rgb(var(--c-rd-300) / <alpha-value>)",
          400: "rgb(var(--c-rd-400) / <alpha-value>)",
          500: "rgb(var(--c-rd-500) / <alpha-value>)",
        },
        // Hairlines and subtle tints. Flips to white on dark themes, which is
        // why it can't double as the modal scrim — see `scrim` below.
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        // Opaque chrome surface (nav rails, sheets, tab bar, panels).
        surface: "rgb(var(--c-surface-solid) / <alpha-value>)",
        // Modal/sheet overlays. Always dark, in every theme: an overlay's job
        // is to push the page back, and a white wash on a dark theme would do
        // the opposite.
        scrim: "rgb(var(--c-scrim) / <alpha-value>)",

        // ---- shadcn/ui vocabulary (see `token` above) --------------------
        background: token("background"),
        foreground: token("foreground"),
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // shadcn components write bare `border` / `border-b` / `border-l` and
      // expect the default to be the themed hairline. Tailwind's stock default
      // is gray-200, which on a dark theme draws a near-white outline — that
      // is what the navigation-menu panel and the sheet's edge were getting.
      // shadcn's own setup does this with a global `* { @apply border-border }`;
      // as a theme default it stays scoped to elements that ask for a border
      // and never specify a colour. Nothing else in this app does — every
      // existing border here names its own colour.
      borderColor: {
        DEFAULT: token("border"),
      },
      boxShadow: {
        card: "var(--surface-shadow)",
        "card-lifted": "var(--elev-shadow)",
      },
      // Radix measures the panel and exposes its height as a variable; the
      // keyframes animate to that. Without them the accordion in the mobile
      // menu snaps open instead of expanding.
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // Supplies the `animate-in` / `data-[state=open]:…` enter-exit utilities the
  // sheet and navigation-menu are written against.
  plugins: [require("tailwindcss-animate")],
};

export default config;
