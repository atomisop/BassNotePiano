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
 */

export const THEME_IDS = ["paper", "ink", "glass"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const ACCENT_IDS = ["rust", "rose", "gold", "sage", "indigo"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

/** "system" follows the OS light/dark setting and resolves to paper or ink. */
export type ThemeChoice = ThemeId | "system";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  mode: "light" | "dark";
  /** Swatches for the picker preview: [ground, surface, text, accent]. */
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "paper",
    label: "Editorial Paper",
    description: "Warm cream and ink, like a printed method book. Flat cards, no blur.",
    mode: "light",
    swatch: ["#FAF6EC", "#FFFFFF", "#1A150F"],
  },
  {
    id: "ink",
    label: "Editorial Ink",
    description: "The same layout after dark — warm near-black rather than blue.",
    mode: "dark",
    swatch: ["#14110E", "#1C1814", "#FAF7F2"],
  },
  {
    id: "glass",
    label: "Midnight Glass",
    description: "The original look: blue-black, frosted translucent panels.",
    mode: "dark",
    swatch: ["#020617", "#1E293B", "#F8FAFC"],
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
 * Runs before first paint, inlined into <head> — see RootLayout.
 *
 * This has to be a string of plain ES5-ish JS rather than an imported
 * function: it executes in a <script> tag ahead of hydration, so it can't
 * reach anything in the bundle. Without it the page paints with the default
 * theme and then snaps to the stored one, which is the classic dark-mode
 * flash. Wrapped in try/catch because localStorage throws outright in
 * Safari's private mode rather than returning null.
 */
export const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
    var a = localStorage.getItem('${ACCENT_STORAGE_KEY}') || '${DEFAULT_ACCENT}';
    if (t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper';
    }
    if (['paper','ink','glass'].indexOf(t) === -1) t = 'paper';
    if (['rust','rose','gold','sage','indigo'].indexOf(a) === -1) a = 'rust';
    var d = document.documentElement;
    d.setAttribute('data-theme', t);
    d.setAttribute('data-mode', t === 'paper' ? 'light' : 'dark');
    d.setAttribute('data-accent', a);
    d.style.colorScheme = t === 'paper' ? 'light' : 'dark';
  } catch (e) {}
})();
`.trim();
