"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music2, CalendarCheck, Users, MessageSquare, User, Settings, Globe, ArrowUpRight, Search, Sun, Moon, type LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { SidebarSpotlight } from "@/components/layout/SidebarSpotlight";
import type { SidebarCard } from "@/lib/sidebarCards";
import { Kbd } from "@/components/ui/Kbd";
import { goKeysFor, OPEN_COMMAND_EVENT } from "@/lib/shortcuts";
import { themeMode } from "@/lib/themes";
import { useTheme } from "@/components/theme/ThemeProvider";
import { GlassLens } from "@/components/ui/GlassLens";

type Item = { href: string; label: string; icon: LucideIcon; dataTour?: string; match?: string[]; external?: boolean };

// Same destinations as the phone dock, plus Practice and Profile, which have
// room here. Grouped so a long list stays scannable.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Main menu",
    items: [
      { href: "/dashboard", label: "Home", icon: Home, dataTour: "nav-roadmap", match: ["/scales"] },
      { href: "/practice", label: "Practice", icon: Music2 },
      { href: "/lessons", label: "Online Lessons", icon: CalendarCheck, dataTour: "nav-lessons" },
    ],
  },
  {
    title: "Community",
    items: [
      { href: "/friends", label: "Friends", icon: Users, dataTour: "nav-friends" },
      { href: "/messages", label: "Messages", icon: MessageSquare, dataTour: "nav-messages" },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/profile", label: "Profile", icon: User },
      { href: "/account", label: "Settings", icon: Settings, dataTour: "nav-settings" },
      // The public homepage, in a new tab so the app stays where it is.
      { href: "/", label: "Website", icon: Globe, external: true },
    ],
  },
];

/**
 * Desktop navigation (lg and up). Phones and tablets keep the floating
 * AppDock; this takes its place on wide screens so nothing floats over the
 * content and every destination has a label. Sits under the fixed TopBar.
 */
export function AppSidebar({ unreadMessageCount: initial, cards, isAdmin }: { unreadMessageCount: number; cards: SidebarCard[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const unread = useUnreadMessages(initial);
  const { resolvedTheme, setTheme } = useTheme();
  const dark = themeMode(resolvedTheme) === "dark";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The selector: one pane of Liquid Glass that glides to whichever page is open (it follows the row as the sidebar opens, closes or scrolls).
  const navRef = useRef<HTMLElement>(null);
  const [sel, setSel] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      setSel(el ? { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight } : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(nav);
    nav.querySelectorAll("a").forEach((a) => ro.observe(a));
    // The width of the open or closing sidebar changes over a third of a second: keep up with it.
    const timer = window.setInterval(schedule, 40);
    const stop = window.setTimeout(() => window.clearInterval(timer), 500);
    return () => {
      ro.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(stop);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname, mounted]);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="app-sidebar fixed bottom-0 left-0 top-[3.75rem] z-40 hidden w-52 flex-col gap-5 overflow-y-auto overflow-x-hidden bg-ground px-3 pb-3 pt-2 lg:flex"
    >
      {sel && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-0 rounded-xl"
          style={{ top: sel.top, left: sel.left, width: sel.width, height: sel.height, transition: "top 460ms cubic-bezier(0.22,1.1,0.36,1), left 380ms var(--ease-ios), width 380ms var(--ease-ios), height 300ms var(--ease-ios)" }}
        >
          <GlassLens radius={12} bezel={11} strength={10} />
        </span>
      )}
      {GROUPS.map((group) => (
        <div key={group.title} className="sb-group relative z-10">
          <p className="sb-group-title px-2.5 pb-1.5 text-small font-medium text-slate-500">{group.title}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`) ||
                (item.match?.some((m) => pathname.startsWith(m)) ?? false);
              const badge = item.href === "/messages" ? unread : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={item.label}
                      className="sb-item press-soft flex h-10 items-center gap-3 rounded-xl px-3 text-small font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="sb-label truncate">{item.label}</span>
                      <ArrowUpRight className="sb-label ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                  <Link
                    href={item.href}
                    prefetch
                    data-tour={item.dataTour}
                    data-prerender={item.href === "/messages" ? undefined : ""}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`sb-item group/sb press-soft relative flex h-10 items-center gap-3 rounded-xl px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "text-slate-50"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal-fg" : ""}`} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    <span className="sb-label truncate">{item.label}</span>
                    {goKeysFor(item.href) && badge === 0 && <Kbd keys={goKeysFor(item.href) ?? []} className="sb-label ml-auto opacity-0 transition-opacity group-hover/sb:opacity-100 group-focus-visible/sb:opacity-100" />}
                    {badge > 0 && (
                      <span className="sb-badge ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Discord invitation (until linked), next class, streak, admin counts and the rest: one card at a time. */}
      <SidebarSpotlight initial={cards} isAdmin={isAdmin} />

      {/* Search (opens the command menu) next to the light/dark switch. */}
      <div className="sb-tools sticky bottom-0 mt-auto flex items-center gap-2 bg-ground pt-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
          data-search-trigger=""
          title="Search and commands"
          className="sb-item press-soft flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-neu-base px-3 text-small font-medium text-slate-300 shadow-raised-low transition hover:text-slate-100 hover:shadow-raised-mid active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="sb-label truncate">Search</span>
          <Kbd keys={["Mod", "K"]} className="sb-label ml-auto" />
        </button>
        <button
          type="button"
          onClick={() => setTheme(dark ? "paper" : "ink")}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          title={dark ? "Light theme" : "Dark theme"}
          className="press-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neu-base text-slate-300 shadow-raised-low transition hover:text-slate-100 hover:shadow-raised-mid active:shadow-pressed-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mounted && (dark ? <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden /> : <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden />)}
        </button>
      </div>
    </nav>
  );
}
