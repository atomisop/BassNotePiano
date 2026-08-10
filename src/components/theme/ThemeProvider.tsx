"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  MARKETING_THEME,
  THEME_STORAGE_KEY,
  isAccentId,
  isDaisyTheme,
  isMarketingPath,
  isThemeId,
  themeMode,
  type AccentId,
  type ThemeChoice,
  type ThemeId,
} from "@/lib/themes";

interface ThemeContextValue {
  /** What the user picked — may be "system". */
  theme: ThemeChoice;
  /** What "system" actually resolved to; equals `theme` otherwise. */
  resolvedTheme: ThemeId;
  accent: AccentId;
  setTheme: (theme: ThemeChoice) => void;
  setAccent: (accent: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ThemeId {
  if (typeof window === "undefined") return "paper";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "ink" : "paper";
}

function resolve(choice: ThemeChoice): ThemeId {
  return choice === "system" ? systemTheme() : choice;
}

/** The one place that writes theme/mode/accent onto <html>. */
function applyToDocument(theme: ThemeId, accent: AccentId) {
  const el = document.documentElement;
  el.setAttribute("data-theme", theme);
  el.setAttribute("data-mode", themeMode(theme));
  // A daisyUI-sourced theme carries its own baked-in accent (see themes.css)
  // and never matches rust/rose/gold/sage/indigo, so writing the theme's own
  // id here means no [data-mode][data-accent="…"] rule matches at all — only
  // the theme's own [data-theme="…"] block sets --c-a-*.
  el.setAttribute("data-accent", isDaisyTheme(theme) ? theme : accent);
  el.style.colorScheme = themeMode(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Initialised to the defaults rather than read from localStorage, because
  // this runs during SSR too. THEME_BOOT_SCRIPT has already put the correct
  // attributes on <html> before paint; the effect below syncs React's copy
  // of that state without ever causing a visible flash.
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_THEME);
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [resolvedTheme, setResolvedTheme] = useState<ThemeId>("paper");

  useEffect(() => {
    let storedTheme: ThemeChoice = DEFAULT_THEME;
    let storedAccent: AccentId = DEFAULT_ACCENT;
    try {
      const t = localStorage.getItem(THEME_STORAGE_KEY);
      if (t === "system" || isThemeId(t)) storedTheme = t;
      const a = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (isAccentId(a)) storedAccent = a;
    } catch {
      // Safari private mode throws on localStorage access — defaults are fine.
    }
    setThemeState(storedTheme);
    setAccentState(storedAccent);
    setResolvedTheme(resolve(storedTheme));
  }, []);

  // Only meaningful while the choice is "system": follow the OS if it flips
  // (e.g. macOS auto light/dark at sunset) without a reload.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(systemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // The single place <html> actually gets written to. Marketing pages (the
  // logged-out storefront — home, classes, pricing, terms) have no picker
  // and are locked to Luxury regardless of what's stored, so this is also
  // the one spot that lock needs to live. A layout effect, not a plain one,
  // so switching between a marketing page and the dashboard resolves before
  // the browser paints — matching THEME_BOOT_SCRIPT's no-flash guarantee on
  // first load, now also true for client-side navigation between the two.
  useLayoutEffect(() => {
    if (isMarketingPath(pathname)) {
      applyToDocument(MARKETING_THEME, DEFAULT_ACCENT);
    } else {
      applyToDocument(resolvedTheme, accent);
    }
  }, [pathname, resolvedTheme, accent]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    setResolvedTheme(resolve(next));
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist; the current page still updates.
    }
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      // As above.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, accent, setTheme, setAccent }),
    [theme, resolvedTheme, accent, setTheme, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
