"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronDown, CreditCard, Inbox, LayoutDashboard, Settings, Users, type AppIcon } from "@/components/ui/appIcons";
import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_HUBS, hubWaiting, locateAdminPage, type AdminHub, type AdminHubId, type AdminNavBadges } from "@/lib/adminNav";

/**
 * The admin menu: six choices (Overview, Billing, People, Classes, Inbox, Setup). Each one holds its related pages as tabs
 * (`AdminSectionTabs`, drawn under the menu on every admin page), so seventeen pages are one tap away without seventeen choices
 * on screen. From md up the six are a list on the left; on phones they are one bar naming where you are, which opens a sheet of six
 * equal rows. The shape of the menu lives in `lib/adminNav.ts`.
 */
export type { AdminNavBadges };

export const HUB_ICON: Record<AdminHubId, AppIcon> = {
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
      className={`rounded-full bg-signal/18 px-1.5 text-small font-semibold tabular-nums text-signal-fg ${className}`}
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
 * Tablets (md up to lg): the six choices as a list on the left. From lg the app's own sidebar lists them under "Admin", so this one
 * steps aside and there is one menu, not two. Each one opens its first page; the section's other pages are the tabs drawn under
 * the menu on every admin page (`AdminSectionTabs`), so nothing pops out when the pointer rests on a row.
 */
function AdminSideRail({ badges }: { badges: AdminNavBadges }) {
  const current = useCurrentHub();
  return (
    <nav aria-label="Admin sections" className="hidden w-48 shrink-0 flex-col gap-1 md:sticky md:top-0 md:flex md:self-start lg:hidden">
      {ADMIN_HUBS.map((hub) => {
        const active = hub.id === current.id;
        const Icon = HUB_ICON[hub.id];
        return (
          <Link
            key={hub.id}
            href={hub.pages[0].href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`press-soft flex h-10 items-center gap-2.5 rounded-control px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "liquid text-slate-50" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal-fg" : ""}`} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
            <span className="truncate">{hub.label}</span>
            <Count count={hubWaiting(hub, badges)} className="ml-auto" />
          </Link>
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
