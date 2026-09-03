/**
 * The theme registry — the single source of truth shared by the provider,
 * the picker UI, and the no-flash boot script.
 *
 * One choice: light or dark. There used to be two independent axes here:
 * three themes (paper / ink / glass) and six accent colors layered on top,
 * eighteen combinations in total. Removed by direct instruction ("keep it
 * clean and use one uniform design language"), the same reasoning that
 * already removed an earlier 32-theme daisyUI-sourced batch: one coherent
 * look beats a matrix of choices that don't actually serve different needs.
 * "Glass" was never a materially different look from "Ink" (same ground,
 * same warm-neutral ramp, just a more intense blur) rather than a real
 * light/dark alternative, so it's gone rather than promoted; the five
 * non-signal accents are gone entirely rather than kept as unused code.
 * Signal green, already the one accent the marketing pages and every
 * transactional email hardcode, is now the only accent anywhere in the
 * app, so there's nothing left for a picker to choose between.
 */

export const CURATED_THEME_IDS = ["paper", "ink"] as const;
export type CuratedThemeId = (typeof CURATED_THEME_IDS)[number];

export const THEME_IDS = CURATED_THEME_IDS;
export type ThemeId = (typeof THEME_IDS)[number];

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
    description: "Warm cream and ink, like a printed method book, with real frosted-glass panels.",
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
];

export const DEFAULT_THEME: ThemeChoice = "ink";

export const THEME_STORAGE_KEY = "bnp-theme";

export function themeMode(theme: ThemeId): "light" | "dark" {
  return THEMES.find((t) => t.id === theme)?.mode ?? "light";
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
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
      d.style.colorScheme = '${themeMode(LOGGED_OUT_THEME)}';
      return;
    }
    var ids = ${JSON.stringify(THEME_IDS)};
    var modes = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.mode])))};
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
    if (t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper';
    }
    if (ids.indexOf(t) === -1) t = '${DEFAULT_THEME}';
    var mode = modes[t] || 'light';
    d.setAttribute('data-theme', t);
    d.setAttribute('data-mode', mode);
    d.style.colorScheme = mode;
  } catch (e) {}
})();
`.trim();
