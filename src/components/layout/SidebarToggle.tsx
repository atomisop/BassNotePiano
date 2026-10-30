"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeft } from "@/components/ui/appIcons";
import { TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";

const KEY = "bnp-sidebar-collapsed";

/**
 * Expands the desktop sidebar or shrinks it to a rail of icons (lg and up). The choice is kept in
 * localStorage and applied as `data-sidebar` on <html>, which globals.css
 * reads, so the sidebar and the page padding follow without any shared state.
 */
export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === "1";
    } catch {
      // Storage blocked: start open.
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
      title={`${collapsed ? "Expand sidebar" : "Collapse sidebar"} (B)`}
      className="sidebar-toggle press hidden h-8 w-8 items-center justify-center rounded-control text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
    >
      <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
