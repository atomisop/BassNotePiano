"use client";

import { flushSync } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_THEME,
  LOGGED_OUT_THEME,
  THEME_STORAGE_KEY,
  isLoggedOutPath,
  isThemeId,
  themeGroundColor,
  themeMode,
  type ThemeChoice,
  type ThemeId,
} from "@/lib/themes";

interface ThemeContextValue {
  /** What the user picked, may be "system". */
  theme: ThemeChoice;
  /** What "system" actually resolved to; equals `theme` otherwise. */
  resolvedTheme: ThemeId;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ThemeId {
  if (typeof window === "undefined") return "paper";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "ink" : "paper";
}

function resolve(choice: ThemeChoice): ThemeId {
  return choice === "system" ? systemTheme() : choice;
}

/**
 * The one place that writes theme/mode onto <html>, and, since RootLayout's
 * `viewport` export can only ever bake in one static default (Paper vs. Ink
 * is a signed-in-only, client-stored preference, so the server can't know
 * it ahead of time), the one place that keeps `<meta name="theme-color">` in
 * sync with whichever theme actually resolved. By the time this runs the
 * meta tag is already in the DOM (Next renders it from `viewport` on the
 * server, well before this client effect fires), so this only ever updates
 * an existing tag rather than racing its insertion.
 */
function applyToDocument(theme: ThemeId) {
  const el = document.documentElement;
  el.setAttribute("data-theme", theme);
  el.setAttribute("data-mode", themeMode(theme));
  el.style.colorScheme = themeMode(theme);
  // iOS ignores a changed `content` on an existing tag after the first switch and keeps painting the old colour in the status bar strip, so the tag is replaced with a fresh one.
  const color = themeGroundColor(theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = color;
  document.head.appendChild(meta);
  el.style.backgroundColor = color;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Initialised to the default rather than read from localStorage, because
  // this runs during SSR too. THEME_BOOT_SCRIPT has already put the correct
  // attributes on <html> before paint; the effect below syncs React's copy
  // of that state without ever causing a visible flash.
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_THEME);
  const [resolvedTheme, setResolvedTheme] = useState<ThemeId>("paper");

  useEffect(() => {
    let storedTheme: ThemeChoice = DEFAULT_THEME;
    try {
      const t = localStorage.getItem(THEME_STORAGE_KEY);
      if (t === "system" || isThemeId(t)) storedTheme = t;
    } catch {
      // Safari private mode throws on localStorage access, defaults are fine.
    }
    setThemeState(storedTheme);
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

  // The single place <html> actually gets written to. Every logged-out page,
  // the storefront (home, classes, pricing, terms) and the road to
  // signing in (login, register, forgot/reset password, verify email),
  // has no picker and is locked to Ink regardless of what's stored, so
  // this is also the one spot that lock needs to live. A layout effect, not
  // a plain one, so switching between a locked page and the real app
  // resolves before the browser paints, matching THEME_BOOT_SCRIPT's
  // no-flash guarantee on first load, now also true for client-side
  // navigation between the two.
  useLayoutEffect(() => {
    if (isLoggedOutPath(pathname)) {
      applyToDocument(LOGGED_OUT_THEME);
    } else {
      applyToDocument(resolvedTheme);
    }
  }, [pathname, resolvedTheme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    const change = () => {
      setThemeState(next);
      setResolvedTheme(resolve(next));
    };
    // A slow, even crossfade between the two looks instead of a blink: the browser's View Transition where it exists (the change has
    // to land synchronously, hence flushSync), otherwise every color eases over the same time.
    const root = document.documentElement;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    type Doc = Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> } };
    const start = (document as Doc).startViewTransition;
    if (reduced) {
      change();
    } else if (start) {
      root.setAttribute("data-theme-switching", "");
      try {
        const transition = start.call(document, () => flushSync(change));
        const clear = () => root.removeAttribute("data-theme-switching");
        void transition.finished?.then(clear, clear);
      } catch {
        root.removeAttribute("data-theme-switching");
        change();
      }
    } else {
      root.setAttribute("data-theme-fade", "");
      change();
      window.setTimeout(() => root.removeAttribute("data-theme-fade"), 800);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist; the current page still updates.
    }
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
