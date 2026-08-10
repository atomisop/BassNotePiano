/**
 * The theme registry — the single source of truth shared by the provider,
 * the picker UI, and the no-flash boot script.
 *
 * A look is two independent choices for the three curated themes:
 *   theme  — the ground and the material (paper / ink / glass)
 *   accent — the single highlight colour, layered on top
 *
 * They're separate because they answer different questions ("light or dark?"
 * vs "what colour are my buttons?"), and keeping them orthogonal means five
 * accents cover all three curated themes instead of needing fifteen presets.
 *
 * The 32 daisyUI themes below are a third kind of choice: a complete,
 * self-contained look where the accent is part of the theme's own identity
 * (Dracula IS its pink; forcing "Rust" onto it would just dilute what makes
 * it recognisable) — so they don't participate in the accent axis at all.
 * See `isDaisyTheme` and ThemeProvider's `apply()`.
 *
 * Every one of the 32 was derived — not hand-picked — from daisyUI's own
 * published colours (github.com/saadeghi/daisyui, `src/theming/themes.js`)
 * into this project's own --c-s-50..950 / --c-a-* / --c-em-* / --c-rd-*
 * contract, via a one-time generator script (deleted after running; see the
 * commit that added this). Every text-bearing ramp stop is contrast-checked
 * against that theme's own ground — nothing sits below WCAG AA, same
 * standard the three hand-authored themes hold themselves to.
 */

export const CURATED_THEME_IDS = ["paper", "ink", "glass"] as const;
export type CuratedThemeId = (typeof CURATED_THEME_IDS)[number];

export const DAISY_THEME_IDS = [
  "aqua", "black", "bumblebee", "cmyk", "corporate", "cupcake", "cyberpunk",
  "dark", "dracula", "emerald", "fantasy", "forest", "garden", "halloween",
  "light", "lofi", "luxury", "pastel", "retro", "synthwave", "valentine",
  "wireframe", "autumn", "business", "acid", "lemonade", "night", "coffee",
  "winter", "dim", "nord", "sunset",
] as const;
export type DaisyThemeId = (typeof DAISY_THEME_IDS)[number];

export const THEME_IDS = [...CURATED_THEME_IDS, ...DAISY_THEME_IDS] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const ACCENT_IDS = ["rust", "rose", "gold", "sage", "indigo"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

/** "system" follows the OS light/dark setting and resolves to paper or ink. */
export type ThemeChoice = ThemeId | "system";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description?: string;
  mode: "light" | "dark";
  source: "curated" | "daisyui";
  /** Swatches for the picker preview: [ground, surface, text]. */
  swatch: [string, string, string];
}

const CURATED_THEMES: ThemeMeta[] = [
  {
    id: "paper",
    label: "Editorial Paper",
    description: "Warm cream and ink, like a printed method book. Flat cards, no blur.",
    mode: "light",
    source: "curated",
    swatch: ["#FAF6EC", "#FFFFFF", "#1A150F"],
  },
  {
    id: "ink",
    label: "Editorial Ink",
    description: "The same layout after dark — warm near-black rather than blue.",
    mode: "dark",
    source: "curated",
    swatch: ["#14110E", "#1C1814", "#FAF7F2"],
  },
  {
    id: "glass",
    label: "Midnight Glass",
    description: "The original look: blue-black, frosted translucent panels.",
    mode: "dark",
    source: "curated",
    swatch: ["#020617", "#1E293B", "#F8FAFC"],
  },
];

// Generated from daisyUI's own theme colours — see the module docstring.
const DAISY_THEMES: ThemeMeta[] = [
  { id: "aqua", label: "Aqua", mode: "dark", source: "daisyui", swatch: ["#345da7", "#4268ac", "#fbfbfb"] },
  { id: "black", label: "Black", mode: "dark", source: "daisyui", swatch: ["#000000", "#141414", "#d6d6d6"] },
  { id: "bumblebee", label: "Bumblebee", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f6f6f6", "#181816"] },
  { id: "cmyk", label: "Cmyk", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f6f6f6", "#181816"] },
  { id: "corporate", label: "Corporate", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f6f6f6", "#181a2a"] },
  { id: "cupcake", label: "Cupcake", mode: "light", source: "daisyui", swatch: ["#faf7f5", "#efeae6", "#291334"] },
  { id: "cyberpunk", label: "Cyberpunk", mode: "light", source: "daisyui", swatch: ["#fff248", "#f6e946", "#181816"] },
  { id: "dark", label: "Dark", mode: "dark", source: "daisyui", swatch: ["#1d232a", "#191e24", "#dee2e6"] },
  { id: "dracula", label: "Dracula", mode: "dark", source: "daisyui", swatch: ["#282a36", "#393a45", "#f8f8f2"] },
  { id: "emerald", label: "Emerald", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f7f7f8", "#2d3544"] },
  { id: "fantasy", label: "Fantasy", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f6f6f7", "#1f2937"] },
  { id: "forest", label: "Forest", mode: "dark", source: "daisyui", swatch: ["#171212", "#282323", "#e6e6e4"] },
  { id: "garden", label: "Garden", mode: "light", source: "daisyui", swatch: ["#e9e7e7", "#e0dede", "#100f0f"] },
  { id: "halloween", label: "Halloween", mode: "dark", source: "daisyui", swatch: ["#212121", "#313131", "#e6e6e4"] },
  { id: "light", label: "Light", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f2f2f2", "#1f2937"] },
  { id: "lofi", label: "Lofi", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f2f2f2", "#000000"] },
  { id: "luxury", label: "Luxury", mode: "dark", source: "daisyui", swatch: ["#09090b", "#171618", "#eac894"] },
  { id: "pastel", label: "Pastel", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f9fafb", "#181816"] },
  { id: "retro", label: "Retro", mode: "light", source: "daisyui", swatch: ["#ece3ca", "#e4d8b4", "#232021"] },
  { id: "synthwave", label: "Synthwave", mode: "dark", source: "daisyui", swatch: ["#1a103d", "#2c224c", "#f9f7fd"] },
  { id: "valentine", label: "Valentine", mode: "light", source: "daisyui", swatch: ["#fae7f4", "#f4e0ed", "#441e28"] },
  { id: "wireframe", label: "Wireframe", mode: "light", source: "daisyui", swatch: ["#ffffff", "#eeeeee", "#181816"] },
  { id: "autumn", label: "Autumn", mode: "light", source: "daisyui", swatch: ["#f1f1f1", "#e8e8e8", "#181816"] },
  { id: "business", label: "Business", mode: "dark", source: "daisyui", swatch: ["#202020", "#303030", "#e6e6e4"] },
  { id: "acid", label: "Acid", mode: "light", source: "daisyui", swatch: ["#fafafa", "#f1f1f1", "#181816"] },
  { id: "lemonade", label: "Lemonade", mode: "light", source: "daisyui", swatch: ["#f8fdef", "#eff4e6", "#181816"] },
  { id: "night", label: "Night", mode: "dark", source: "daisyui", swatch: ["#0f172a", "#202839", "#e6e6e4"] },
  { id: "coffee", label: "Coffee", mode: "dark", source: "daisyui", swatch: ["#20161f", "#2d2124", "#e7d8be"] },
  { id: "winter", label: "Winter", mode: "light", source: "daisyui", swatch: ["#ffffff", "#f2f7ff", "#273648"] },
  { id: "dim", label: "Dim", mode: "dark", source: "daisyui", swatch: ["#2a303c", "#242933", "#f0f5f7"] },
  { id: "nord", label: "Nord", mode: "light", source: "daisyui", swatch: ["#eceff4", "#e5e9f0", "#232831"] },
  { id: "sunset", label: "Sunset", mode: "dark", source: "daisyui", swatch: ["#121c22", "#0e171e", "#cddae6"] },
];

export const THEMES: ThemeMeta[] = [...CURATED_THEMES, ...DAISY_THEMES];

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
];

export const DEFAULT_THEME: ThemeChoice = "paper";
export const DEFAULT_ACCENT: AccentId = "rust";

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
 * daisyUI-sourced themes carry their own accent baked into their own
 * `[data-theme="…"]` CSS block (see themes.css) — they never participate in
 * the rust/rose/gold/sage/indigo accent axis. ThemeProvider uses this to
 * decide what to actually write into `data-accent`.
 */
export function isDaisyTheme(id: ThemeId): id is DaisyThemeId {
  return (DAISY_THEME_IDS as readonly string[]).includes(id);
}

/**
 * Nobody signed in gets a theme picker — not on the storefront (home,
 * classes, pricing, terms), and not on the road to actually signing in
 * (login, register, forgot/reset password, verify email) either. All nine
 * are locked to Luxury: every visitor sees the same look right up until
 * they're actually inside the app, at which point ThemeProvider switches to
 * whatever they picked at Settings → Themes & Appearance. `/onboarding` is
 * deliberately excluded — it's behind `middleware.ts`'s auth check, so
 * reaching it means a real session already exists; it should look like the
 * app, not like the pitch for it.
 *
 * `isLoggedOutPath` is an exact-match allow-list (not a prefix check) so a
 * future nested route under one of these — e.g. a dynamic `/classes/[id]`
 * — doesn't silently inherit the lock without a deliberate decision to add
 * it here.
 */
export const LOGGED_OUT_THEME: ThemeId = "luxury";
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
      d.setAttribute('data-accent', '${LOGGED_OUT_THEME}');
      d.style.colorScheme = '${themeMode(LOGGED_OUT_THEME)}';
      return;
    }
    var ids = ${JSON.stringify(THEME_IDS)};
    var daisy = ${JSON.stringify(DAISY_THEME_IDS)};
    var modes = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.mode])))};
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
    var a = localStorage.getItem('${ACCENT_STORAGE_KEY}') || '${DEFAULT_ACCENT}';
    if (t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper';
    }
    if (ids.indexOf(t) === -1) t = 'paper';
    if (['rust','rose','gold','sage','indigo'].indexOf(a) === -1) a = 'rust';
    var mode = modes[t] || 'light';
    var isDaisy = daisy.indexOf(t) !== -1;
    d.setAttribute('data-theme', t);
    d.setAttribute('data-mode', mode);
    d.setAttribute('data-accent', isDaisy ? t : a);
    d.style.colorScheme = mode;
  } catch (e) {}
})();
`.trim();
