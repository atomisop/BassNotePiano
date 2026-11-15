"use client";

import { useEffect, useState } from "react";
import { Moon, Search, Sun } from "@/components/ui/appIcons";
import { Kbd } from "@/components/ui/Kbd";
import { OPEN_COMMAND_EVENT } from "@/lib/shortcuts";
import { themeMode } from "@/lib/themes";
import { useTheme } from "@/components/theme/ThemeProvider";
import { IconSwap } from "@/components/ui/IconSwap";

/** Computers (lg and up): search (opens the command menu, which grows out of this button) and the light/dark switch, in the top bar. */
export function TopBarTools() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = themeMode(resolvedTheme) === "dark";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
        data-search-trigger=""
        title="Search and commands"
        className="lgx-btn tap press flex h-9 items-center gap-2 rounded-full px-3 text-small font-medium text-slate-300 hover:text-slate-100"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>Search</span>
        <Kbd keys={["Mod", "K"]} />
      </button>
      <button
        type="button"
        onClick={() => setTheme(dark ? "paper" : "ink")}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
        className="lgx-btn tap press flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:text-slate-100"
      >
        {mounted && <IconSwap state={dark}>{dark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />}</IconSwap>}
      </button>
    </div>
  );
}
