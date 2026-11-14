"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeft } from "@/components/ui/appIcons";
import { TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";

const KEY = "bnp-sidebar-collapsed";

/**
 * Expands the sidebar or shrinks it to a rail of icons (tablets and computers, md and up). The choice is kept in
 * localStorage and applied as `data-sidebar` on <html>, which globals.css
 * reads, so the sidebar and the page padding follow without any shared state.
 */
export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // No saved choice yet: a tablet (under 1024px) starts as a rail so the page keeps its room; a computer starts open.
    let saved = window.innerWidth < 1024;
    try {
      const stored = localStorage.getItem(KEY);
      if (stored !== null) saved = stored === "1";
    } catch {
      // Storage blocked: use the width's default.
    }
    setCollapsed(saved);
    document.documentElement.dataset.sidebar = saved ? "collapsed" : "open";
    // Turn the slide animation on only after the saved state has painted.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset.sidebarAnim = "")));
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? "collapsed" : "open";
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Not saved; still applies for this visit.
    }
  }

  // The "B" shortcut (see lib/shortcuts.ts) asks the toggle to flip; always call the latest toggle.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onToggle = () => toggleRef.current();
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
      // The sidebar shows this as a small orange label beside the button (AppSidebar's tooltip), with the shortcut key.
      data-tip={collapsed ? "Expand" : "Collapse"}
      data-tip-key="B"
      data-tip-always=""
      className="lgx-btn sidebar-toggle tap press flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The panel icon turns over as the sidebar closes, so the button shows which way it will go next. */}
      <PanelLeft className={`h-[18px] w-[18px] transition-transform duration-300 ease-[var(--ease-ios)] ${collapsed ? "-scale-x-100" : ""}`} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
