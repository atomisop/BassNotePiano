/**
 * The theme registry — the single source of truth shared by the provider,
 * the picker UI, and the no-flash boot script.
 *
 * A look is two independent choices:
 *   theme  — the ground and the material (paper / ink / glass)
 *   accent — the single highlight colour, layered on top
 *
 * They're separate because they answer different questions ("light or dark?"
 * vs "what colour are my buttons?"), and keeping them orthogonal means five
 * accents cover all three themes instead of needing fifteen presets.
 *
 * Only three themes exist now — the app's own hand-authored ones. A 32-theme
 * daisyUI-sourced batch used to sit alongside these (each a complete,
 * self-contained look with its own baked-in accent, not participating in
 * the rust/rose/gold/sage/indigo axis at all); it was removed by direct
 * instruction, in favour of one coherent system rather than choosing between
 * "this app's design" and "someone else's 32 designs" per visit. Glass is
 * no longer one distinct option among three, either — every theme now
 * carries the same translucent, blurred material (see themes.css), so the
 * three remaining choices differ by ground colour and light/dark, not by
 * whether they're "the glass one".
 */

export const CURATED_THEME_IDS = ["paper", "ink", "glass"] as const;
export type CuratedThemeId = (typeof CURATED_THEME_IDS)[number];

export const THEME_IDS = CURATED_THEME_IDS;
export type ThemeId = (typeof THEME_IDS)[number];

export const ACCENT_IDS = ["rust", "rose", "gold", "sage", "indigo", "signal"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

/** "system" follows the OS light/dark setting and resolves to paper or ink. */
export type ThemeChoice = ThemeId | "system";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description?: string;
  mode: "light" | "dark";
  source: "curated";
  /** Swatches for the picker preview: [ground, surface, text]. */
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "paper",
    label: "Editorial Paper",
    description: "Warm cream and ink, like a printed method book — now with real frosted-glass panels.",
    mode: "light",
    source: "curated",
    swatch: ["#FAF6EC", "#FFFFFF", "#1A150F"],
  },
  {
    id: "ink",
    label: "Editorial Ink",
    description: "True near-black and near-white, with frosted-glass panels — the default look.",
    mode: "dark",
    source: "curated",
    swatch: ["#1A1A1A", "#2E2E2E", "#F5F5F5"],
  },
  {
    id: "glass",
    label: "Midnight Glass",
    description: "Ink's own black, at full glass intensity — the most translucent of the three.",
    mode: "dark",
    source: "curated",
    swatch: ["#1A1A1A", "#2E2E2E", "#F5F5F5"],
  },
];

export interface AccentMeta {
  id: AccentId;
  label: string;
  /** Preview dot per mode — the accent differs by ground to stay readable. */
  light: string;
  dark: string;
}

export const ACCENTS: AccentMeta[] = [
  { id: "rust", label: "Rust", light: "#A04E1E", dark: "#D98E5A" },
  { id: "rose", label: "Dusty Rose", light: "#A34A5E", dark: "#D1A094" },
  { id: "gold", label: "Gold", light: "#8A6A12", dark: "#D9B65A" },
  { id: "sage", label: "Sage", light: "#4A6B3D", dark: "#8FB87A" },
  { id: "indigo", label: "Indigo", light: "#4A4FA8", dark: "#9BA0E0" },
  { id: "signal", label: "Signal", light: "#027A03", dark: "#05E901" },
];

export const DEFAULT_THEME: ThemeChoice = "ink";
export const DEFAULT_ACCENT: AccentId = "signal";

export const THEME_STORAGE_KEY = "bnp-theme";
export const ACCENT_STORAGE_KEY = "bnp-accent";

export function themeMode(theme: ThemeId): "light" | "dark" {
  return THEMES.find((t) => t.id === theme)?.mode ?? "light";
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENT_IDS as readonly string[]).includes(value);
}

/**
 * Nobody signed in gets a theme picker — not on the storefront (home,
 * classes, pricing, terms), and not on the road to actually signing in
 * (login, register, forgot/reset password, verify email) either. All nine
 * are locked to Ink: every visitor sees the same look right up until
 * they're actually inside the app, at which point ThemeProvider switches to
 * whatever they picked at Settings → Themes & Appearance. `/onboarding` is
 * deliberately excluded — it's behind `middleware.ts`'s auth check, so
 * reaching it means a real session already exists; it should look like the
 * app, not like the pitch for it.
 *
 * Locked to Ink (not Paper) so the black/signal-green identity is what
 * every first-time visitor actually sees — matches `DEFAULT_THEME` below,
 * one consistent default rather than two different ones. Marketing pages
 * under `(marketing)/` override these tokens with their own scoped ramp
 * anyway (see marketing.css); this mainly governs the functional auth pages
 * (login, register, …), which don't carry that override.
 *
 * `isLoggedOutPath` is an exact-match allow-list (not a prefix check) so a
 * future nested route under one of these — e.g. a dynamic `/classes/[id]`
 * — doesn't silently inherit the lock without a deliberate decision to add
 * it here.
 */
export const LOGGED_OUT_THEME: ThemeId = "ink";
export const LOGGED_OUT_PATHS = [
  "/",
  "/classes",
  "/pricing",
  "/terms",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
] as const;

export function isLoggedOutPath(pathname: string | null | undefined): boolean {
  return pathname != null && (LOGGED_OUT_PATHS as readonly string[]).includes(pathname);
}

/**
 * Runs before first paint, inlined into <head> — see RootLayout.
 *
 * This has to be a string of plain ES5-ish JS rather than an imported
 * function: it executes in a <script> tag ahead of hydration, so it can't
 * reach anything in the bundle. Without it the page paints with the default
 * theme and then snaps to the stored one, which is the classic dark-mode
 * flash. Wrapped in try/catch because localStorage throws outright in
 * Safari's private mode rather than returning null.
 *
 * The logged-out lock (see `isLoggedOutPath` above) has to be duplicated
 * here as a plain array rather than imported, same reason the rest of this
 * script is inlined: it runs ahead of the bundle.
 */
export const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var d = document.documentElement;
    var loggedOutPaths = ${JSON.stringify(LOGGED_OUT_PATHS)};
    if (loggedOutPaths.indexOf(window.location.pathname) !== -1) {
      d.setAttribute('data-theme', '${LOGGED_OUT_THEME}');
      d.setAttribute('data-mode', '${themeMode(LOGGED_OUT_THEME)}');
      d.setAttribute('data-accent', '${DEFAULT_ACCENT}');
      d.style.colorScheme = '${themeMode(LOGGED_OUT_THEME)}';
      return;
    }
    var ids = ${JSON.stringify(THEME_IDS)};
    var modes = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.mode])))};
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
    var a = localStorage.getItem('${ACCENT_STORAGE_KEY}') || '${DEFAULT_ACCENT}';
    if (t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper';
    }
    if (ids.indexOf(t) === -1) t = '${DEFAULT_THEME}';
    if (['rust','rose','gold','sage','indigo','signal'].indexOf(a) === -1) a = '${DEFAULT_ACCENT}';
    var mode = modes[t] || 'light';
    d.setAttribute('data-theme', t);
    d.setAttribute('data-mode', mode);
    d.setAttribute('data-accent', a);
    d.style.colorScheme = mode;
  } catch (e) {}
})();
`.trim();
