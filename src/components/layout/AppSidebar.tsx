"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Music2, Trophy, CalendarCheck, Users, Settings, Globe, ArrowUpRight, ShieldCheck, type AppIcon } from "@/components/ui/appIcons";
import GenerateAIButton from "@/components/ui/button-33";
import { SidebarSpotlight } from "@/components/layout/SidebarSpotlight";
import type { SidebarCard } from "@/lib/sidebarCards";
import { Kbd } from "@/components/ui/Kbd";
import { goKeysFor } from "@/lib/shortcuts";
import { ADMIN_HUBS, hubWaiting, locateAdminPage, type AdminNavBadges, type AdminPage } from "@/lib/adminNav";
import { HUB_ICON } from "@/components/admin/AdminNav";
import { atomHiddenOn, openAtom } from "@/lib/atomTrigger";
import { SlidingPill, useActiveRect } from "@/components/ui/SlidingPill";
import { SidebarToggle } from "@/components/layout/SidebarToggle";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLinkedChildren } from "@/components/parent/useLinkedChildren";

type Item = { href: string; label: string; icon: AppIcon; dataTour?: string; match?: string[]; external?: boolean; isActive?: (pathname: string) => boolean; count?: number; flyout?: { title: string; pages: AdminPage[] } };

// Same destinations as the phone dock, plus Practice and Profile, which have
// room here. Grouped so a long list stays scannable.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Main menu",
    items: [
      { href: "/dashboard", label: "Home", icon: Home },
      { href: "/roadmap", label: "Roadmap", icon: Map, dataTour: "nav-roadmap", match: ["/scales"] },
      { href: "/practice", label: "Practice", icon: Music2 },
      { href: "/lessons", label: "Lessons", icon: CalendarCheck, dataTour: "nav-lessons" },
    ],
  },
  {
    title: "Community",
    items: [
      { href: "/friends", label: "Friends", icon: Users },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/account", label: "Settings", icon: Settings, dataTour: "nav-settings" },
      // The public homepage, in a new tab so the app stays where it is.
      { href: "/", label: "Website", icon: Globe, external: true },
    ],
  },
];

/** The main menu with Parent mode added after Lessons. */
function withParentMode(groups: { title: string; items: Item[] }[]): { title: string; items: Item[] }[] {
  return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, { href: "/parent", label: "Parent mode", icon: ShieldCheck }] } : g));
}

/**
 * Desktop navigation (lg and up). Phones and tablets keep the floating
 * AppDock; this takes its place on wide screens so nothing floats over the
 * content and every destination has a label. Sits under the fixed TopBar.
 */
export function AppSidebar({ cards, isAdmin, adminBadges = {} }: { cards: SidebarCard[]; isAdmin: boolean; adminBadges?: AdminNavBadges }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  // A parent (anyone with an accepted child) gets Parent mode in the main menu, right under Lessons, so it is one tap from anywhere.
  const kids = useLinkedChildren(!isAdmin);
  const base = kids.length > 0 ? withParentMode(GROUPS) : GROUPS;
  // The admin's six sections sit under Website as one more group, so the admin pages need no second menu of their own on a computer.
  const adminHub = pathname.startsWith("/admin") ? locateAdminPage(pathname)?.hub.id ?? "overview" : null;
  const groups: { title: string; items: Item[] }[] = isAdmin
    ? [
        ...base,
        {
          title: "Admin",
          items: ADMIN_HUBS.map((hub) => ({
            href: hub.pages[0].href,
            label: hub.label,
            icon: HUB_ICON[hub.id],
            isActive: () => adminHub === hub.id,
            count: hubWaiting(hub, adminBadges),
            flyout: hub.pages.length > 1 ? { title: hub.label, pages: hub.pages } : undefined,
          })),
        },
      ]
    : base;
  useEffect(() => setMounted(true), []);

  const navRef = useRef<HTMLElement>(null);
  // Atom's chat opens just above this button and points at it.
  const askRef = useRef<HTMLDivElement>(null);
  const askAtom = () => {
    const r = askRef.current?.getBoundingClientRect();
    openAtom(r ? { left: r.left, top: r.top, width: r.width } : undefined);
  };
  // The selector: one solid orange pill that glides to whichever page is open (it follows the row as the sidebar opens, closes or scrolls).
  const sel = useActiveRect(navRef, [pathname, mounted, kids.length]);

  // Hover labels (the rail shows icons only) and the pop-out list of an admin section's pages. Both are drawn in a portal on <body>, so
  // the sidebar's own clipping and view-transition layer can never cut them off.
  const [tip, setTip] = useState<{ label: string; hint?: string; top: number; left: number } | null>(null);
  const [fly, setFly] = useState<{ title: string; pages: AdminPage[]; top: number; left: number } | null>(null);
  const flyClose = useRef<number | undefined>(undefined);
  const itemsByKey = useRef<Record<string, Item>>({});
  const cancelClose = () => window.clearTimeout(flyClose.current);
  const scheduleClose = () => {
    cancelClose();
    flyClose.current = window.setTimeout(() => setFly(null), 140);
  };
  const onPoint = (e: React.MouseEvent | React.FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip],[data-flyout]");
    if (!el) {
      setTip(null);
      scheduleClose();
      return;
    }
    const r = el.getBoundingClientRect();
    const collapsed = document.documentElement.dataset.sidebar === "collapsed";
    const flyKey = el.dataset.flyout;
    if (flyKey) {
      const item = itemsByKey.current[flyKey];
      if (item?.flyout) {
        cancelClose();
        setTip(null);
        const height = 44 + item.flyout.pages.length * 36;
        setFly({ title: item.flyout.title, pages: item.flyout.pages, top: Math.max(8, Math.min(r.top, window.innerHeight - height - 12)), left: r.right + 10 });
        return;
      }
    }
    scheduleClose();
    if (el.dataset.tip && (collapsed || el.dataset.tipAlways !== undefined)) {
      setTip({ label: el.dataset.tip, hint: el.dataset.tipKey, top: r.top + r.height / 2, left: r.right + 10 });
    } else {
      setTip(null);
    }
  };
  const onLeave = () => {
    setTip(null);
    scheduleClose();
  };
  useEffect(() => () => window.clearTimeout(flyClose.current), []);
  // A click or a page change puts the pop-outs away.
  useEffect(() => {
    setTip(null);
    setFly(null);
  }, [pathname]);

  return (
    <>
    <nav
      ref={navRef}
      aria-label="Primary"
      onMouseOver={onPoint}
      onMouseLeave={onLeave}
      onFocus={onPoint}
      onBlur={onLeave}
      className="app-sidebar fixed bottom-0 left-0 top-0 z-40 hidden w-52 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-3 md:flex"
    >
      {/* The sidebar's own header: the logo and the button that folds the sidebar into a rail (the rail stacks them). */}
      <div className="sb-header sticky top-0 z-20 -mx-3 -mt-3 flex items-center justify-between gap-2 bg-ground px-3 pb-2 pt-3">
        <Link href="/dashboard" aria-label="Bass Note Piano, home" className="sb-brand tap flex min-w-0 items-center gap-2 rounded-xl px-0.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo height={22} className="text-slate-50" />
          <span className="sb-label truncate text-caption font-bold tracking-tight text-slate-50">Bass Note Piano</span>
        </Link>
        <SidebarToggle />
      </div>
      <SlidingPill rect={sel} />
      {groups.map((group) => (
        <div key={group.title} className="sb-group relative z-10">
          <p className="sb-group-title px-2.5 pb-1.5 text-small font-medium text-slate-500">{group.title}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = item.isActive
                ? item.isActive(pathname)
                : pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.match?.some((m) => pathname.startsWith(m)) ?? false);
              const badge = item.count ?? 0;
              const Icon = item.icon;
              if (item.flyout) itemsByKey.current[item.href] = item;
              return (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-tip={item.label}
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
                    data-prerender=""
                    data-tip={item.label}
                    data-flyout={item.flyout ? item.href : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`sb-item group/sb press-soft relative flex h-10 items-center gap-3 rounded-xl px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? // Until the pill has been measured (the server's first paint) the open page carries its own orange fill, so its dark label is never alone on the dark ground.
                          `text-signal-ink ${sel ? "" : "bg-signal"}`
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    <span className="sb-label truncate">{item.label}</span>
                    {goKeysFor(item.href) && badge === 0 && (
                      // The label wrapper carries `sb-label` (the rail's own opacity rule); the hint inside shows only on hover or focus.
                      <span className="sb-label ml-auto">
                        <Kbd keys={goKeysFor(item.href) ?? []} className="opacity-0 transition-opacity group-hover/sb:opacity-100 group-focus-visible/sb:opacity-100" />
                      </span>
                    )}
                    {badge > 0 && (
                      <span className={`sb-badge ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-small font-bold ${active ? "bg-[rgb(var(--signal-ink))] text-slate-50" : "bg-signal text-slate-950"}`}>
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
      {/* The admin's cards live in the alerts window by the profile picture: this space holds the admin sections instead. */}
      {!isAdmin && <SidebarSpotlight initial={cards} isAdmin={false} />}

      {/* Ask AI at the foot of the sidebar (search and the light/dark switch are in the top bar): the same Ask AI pill as in the top
          bar (orbiting orange ring, sparkle), just as wide as the sidebar. */}
      <div className="sb-tools sticky bottom-0 mt-auto pt-1">
        {!atomHiddenOn(pathname) && (
        <div ref={askRef}>
          <GenerateAIButton calm ariaLabel="Ask AI" onClick={askAtom} className="sb-item tap h-10 w-full px-3">
            <span className="sb-label">Ask AI</span>
          </GenerateAIButton>
        </div>
        )}
      </div>
    </nav>
    {mounted && tip && createPortal(
      <div role="tooltip" className="sb-tip" style={{ top: tip.top, left: tip.left }}>
        {tip.label}
        {tip.hint && <kbd>{tip.hint}</kbd>}
      </div>,
      document.body,
    )}
    {mounted && fly && createPortal(
      <div role="menu" aria-label={fly.title} className="sb-flyout glass-menu" style={{ top: fly.top, left: fly.left }} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
        <p className="px-3 pb-1 pt-1.5 text-small font-semibold text-slate-500">{fly.title}</p>
        {fly.pages.map((page) => {
          const here = pathname === page.href.split("?")[0] && locateAdminPage(pathname)?.page.href === page.href;
          return (
            <Link key={page.href} href={page.href} prefetch role="menuitem" aria-current={here ? "page" : undefined} className={`flex h-9 items-center rounded-lg px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${here ? "bg-signal/16 text-signal-fg" : "text-slate-300 hover:bg-slate-50/8 hover:text-slate-50"}`}>
              {page.label}
            </Link>
          );
        })}
      </div>,
      document.body,
    )}
    </>
  );
}
