"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronDown, CreditCard, Inbox, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { isHeadingForFlyout, type Point } from "@/lib/safeTriangle";
import { ADMIN_HUBS, hubWaiting, locateAdminPage, type AdminHub, type AdminHubId, type AdminNavBadges } from "@/lib/adminNav";

/**
 * The admin menu: six choices (Overview, Billing, People, Classes, Inbox, Setup). Each one holds its related pages as tabs
 * (`AdminSectionTabs`, drawn under the menu on every admin page), so seventeen pages are one tap away without seventeen choices
 * on screen. From md up the six are a list on the left; on phones they are one bar naming where you are, which opens a sheet of six
 * equal rows. The shape of the menu lives in `lib/adminNav.ts`.
 */
export type { AdminNavBadges };

const HUB_ICON: Record<AdminHubId, LucideIcon> = {
  overview: LayoutDashboard,
  billing: CreditCard,
  people: Users,
  classes: CalendarDays,
  inbox: Inbox,
  setup: Settings,
};

function Count({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`rounded-full bg-[rgb(var(--signal)/0.18)] px-1.5 text-small font-semibold tabular-nums text-signal-fg ${className}`}
      aria-label={`${count} waiting`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Where you are: the hub of the current address, or the Overview for an address that is in none. */
function useCurrentHub(): AdminHub {
  const pathname = usePathname();
  return locateAdminPage(pathname)?.hub ?? ADMIN_HUBS[0];
}

/**
 * md and up: the six choices as a list on the left. Resting on a section (or tabbing to it) opens a flyout of its pages beside it, so a
 * page two levels deep is one move away. Reaching for the flyout in a diagonal does not swap it for the row you cross on the way (the
 * "safe triangle", see lib/safeTriangle.ts).
 */
function AdminSideRail({ badges }: { badges: AdminNavBadges }) {
  const current = useCurrentHub();
  const pathname = usePathname();
  const [openId, setOpenId] = useState<AdminHubId | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const leftAt = useRef<Point | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const navRef = useRef<HTMLElement>(null);

  const cancelClose = useCallback(() => window.clearTimeout(closeTimer.current), []);
  const closeSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 120);
  }, []);

  // A page change closes it.
  useEffect(() => setOpenId(null), [pathname]);

  // While a flyout is open and the pointer is on neither the row nor the flyout, keep it as long as the pointer is inside the triangle.
  useEffect(() => {
    if (!openId) return;
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        judge(e);
      });
    };
    const judge = (e: MouseEvent) => {
      const inside = (el: Element | null) => !!el && el.contains(e.target as Node);
      if (inside(flyoutRef.current) || inside(navRef.current?.querySelector(`[data-hub="${openId}"]`) ?? null)) return cancelClose();
      const rect = flyoutRef.current?.getBoundingClientRect();
      if (rect && leftAt.current && isHeadingForFlyout({ x: e.clientX, y: e.clientY }, leftAt.current, { left: rect.left, top: rect.top, bottom: rect.bottom })) {
        // Moving toward it: keep it, and re-anchor so a slow approach keeps the triangle tight.
        leftAt.current = { x: e.clientX, y: e.clientY };
        return cancelClose();
      }
      closeSoon();
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [openId, cancelClose, closeSoon]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <nav ref={navRef} aria-label="Admin sections" className="hidden w-48 shrink-0 flex-col gap-1 md:sticky md:top-0 md:flex md:self-start">
      {ADMIN_HUBS.map((hub) => {
        const active = hub.id === current.id;
        const Icon = HUB_ICON[hub.id];
        const hasPages = hub.pages.length > 1;
        return (
          <div
            key={hub.id}
            data-hub={hub.id}
            className="relative"
            onMouseMove={(e) => {
              // Remember where the pointer is on the open row, so leaving it can be judged against the triangle.
              if (openId === hub.id && !flyoutRef.current?.contains(e.target as Node)) leftAt.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseEnter={(e) => {
              cancelClose();
              const rect = flyoutRef.current?.getBoundingClientRect();
              // Crossing another row on the way to the open flyout does not swap it.
              if (openId && openId !== hub.id && rect && leftAt.current && isHeadingForFlyout({ x: e.clientX, y: e.clientY }, leftAt.current, { left: rect.left, top: rect.top, bottom: rect.bottom })) return;
              setOpenId(hasPages ? hub.id : null);
            }}
            onMouseLeave={(e) => {
              leftAt.current = { x: e.clientX, y: e.clientY };
              if (openId === hub.id) closeSoon();
            }}
            onFocus={() => setOpenId(hasPages ? hub.id : null)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenId((id) => (id === hub.id ? null : id));
            }}
            onKeyDown={(e) => e.key === "Escape" && setOpenId(null)}
          >
            <Link
              href={hub.pages[0].href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-haspopup={hasPages ? "true" : undefined}
              aria-expanded={hasPages ? openId === hub.id : undefined}
              className={`press-soft flex h-10 items-center gap-2.5 rounded-control px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "bg-neu-lift text-slate-50 shadow-pressed-low" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal-fg" : ""}`} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
              <span className="truncate">{hub.label}</span>
              <Count count={hubWaiting(hub, badges)} className="ml-auto" />
            </Link>
            {hasPages && (
              <div ref={openId === hub.id ? flyoutRef : undefined} data-open={openId === hub.id} className="admin-flyout absolute left-full top-0 z-30 pl-1.5" role="group" aria-label={`${hub.label} pages`}>
                <ul className="min-w-44 rounded-card bg-neu-lift p-1.5 shadow-raised-high">
                  {hub.pages.map((page, i) => (
                    <li key={page.href} style={{ "--i": i } as React.CSSProperties}>
                      <Link
                        href={page.href}
                        prefetch
                        className="flex h-9 items-center justify-between gap-3 rounded-control px-3 text-small text-slate-300 hover:bg-[rgb(var(--c-s-50)/0.08)] hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {page.label}
                        {(badges[page.href] ?? 0) > 0 && <span aria-label={`${badges[page.href]} waiting`} className="h-2 w-2 rounded-full bg-signal" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Phones: one bar that names the section you are on and opens a sheet of the six. Nothing scrolls, and each row says what is inside
 * it, so nobody has to guess where a page went.
 */
function AdminPhoneMenu({ badges }: { badges: AdminNavBadges }) {
  const current = useCurrentHub();
  const [open, setOpen] = useState(false);
  const CurrentIcon = HUB_ICON[current.id];
  const waiting = ADMIN_HUBS.reduce((sum, hub) => sum + hubWaiting(hub, badges), 0);

  return (
    <div className="mb-3 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Admin menu, you are in ${current.label}${waiting > 0 ? `, ${waiting} waiting` : ""}`}
        className="tap press-soft flex h-11 w-full items-center gap-2.5 rounded-full bg-neu-base px-4 text-left text-small font-medium text-slate-100 shadow-raised-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CurrentIcon className="h-4 w-4 shrink-0 text-signal-fg" strokeWidth={2.1} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        <Count count={waiting} />
        <span className="flex items-center gap-1 text-slate-400">
          Menu
          <ChevronDown aria-hidden className="h-4 w-4" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen} title="Admin menu">
        <nav aria-label="Admin sections">
          <ul className="grid grid-cols-1 gap-2">
            {ADMIN_HUBS.map((hub) => {
              const active = hub.id === current.id;
              const Icon = HUB_ICON[hub.id];
              const count = hubWaiting(hub, badges);
              return (
                <li key={hub.id}>
                  <Link
                    href={hub.pages[0].href}
                    prefetch
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`press-soft flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? "bg-neu-lift text-signal-fg shadow-pressed-low" : "bg-neu-base text-slate-100 shadow-raised-low"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-body font-semibold leading-tight">{hub.label}</span>
                        <Count count={count} />
                      </span>
                      {hub.pages.length > 1 && (
                        <span className="block truncate text-small leading-tight text-slate-400">{hub.pages.map((p) => p.label).join(", ")}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Dialog>
    </div>
  );
}

export function AdminNav({ badges = {} }: { badges?: AdminNavBadges }) {
  return (
    <>
      <AdminPhoneMenu badges={badges} />
      <AdminSideRail badges={badges} />
    </>
  );
}

/**
 * The pages inside the current section, as one row of tabs above the page (nothing for a section with a single page). Evenly
 * spaced across a phone so none of it scrolls sideways; underlined, so it never reads as the page's own filter pills below it.
 */
export function AdminSectionTabs({ badges = {} }: { badges?: AdminNavBadges }) {
  const pathname = usePathname();
  const located = locateAdminPage(pathname);
  if (!located || located.hub.pages.length < 2) return null;
  const { hub, page: currentPage } = located;

  return (
    <nav aria-label={`${hub.label} pages`} className="mb-5 border-b border-(--neu-edge)">
      <ul className="flex">
        {hub.pages.map((page) => {
          const active = page.href === currentPage.href;
          const count = badges[page.href] ?? 0;
          return (
            <li key={page.href} className="min-w-0 flex-auto md:flex-none">
              <Link
                href={page.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center justify-center gap-1 whitespace-nowrap px-1 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5 ${
                  active
                    ? "text-signal-fg after:absolute after:inset-x-1 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-signal md:after:inset-x-3"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                <span className="min-w-0 truncate">{page.label}</span>
                {count > 0 && <span aria-label={`${count} waiting`} className="h-2 w-2 shrink-0 rounded-full bg-signal" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
