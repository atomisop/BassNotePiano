"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sun, ShieldCheck,
  BadgePercent,
  History,
  Briefcase,
  BookUser,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Headphones,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  BookOpen,
  Repeat,
  Settings,
  Users,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

/**
 * The one admin menu. Every admin page is a single entry in one grouped list,
 * the way YouTube Studio and Google's admin consoles lay theirs out: nothing is
 * hidden behind a second row of tabs or a dropdown, and each name matches the
 * heading of the page it opens. From md up it is a list on the left (Settings
 * pinned underneath); on phones it is one bar naming the page you are on, which opens
 * a sheet with every entry in a grid (no sideways swiping).
 * Pages keep their own tabs for what is inside them (statuses, filters).
 */
interface AdminNavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface AdminNavGroup {
  label: string;
  leaves: AdminNavLeaf[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    leaves: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/activity", label: "Activity", icon: History },
    ],
  },
  {
    label: "Billing",
    leaves: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/payment-plans", label: "Payment Plans", icon: Repeat },
      { href: "/admin/pricing", label: "Pricing", icon: BadgePercent },
    ],
  },
  {
    label: "People",
    leaves: [
      { href: "/admin/students", label: "Applications", icon: ClipboardList },
      { href: "/admin/users", label: "Accounts", icon: Users },
      { href: "/admin/contacts", label: "Contacts", icon: BookUser },
      { href: "/admin/employees", label: "Employees", icon: Briefcase },
    ],
  },
  {
    label: "Teaching",
    leaves: [
      { href: "/admin/today", label: "Today", icon: Sun },
      { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/admin/lessons", label: "Lessons", icon: BookOpen },
      { href: "/admin/discord", label: "Discord", icon: Headphones },
    ],
  },
  {
    label: "Inbox",
    leaves: [
      { href: "/admin/support", label: "Support Chat", icon: LifeBuoy },
      { href: "/admin/messages", label: "Messages", icon: Megaphone },
    ],
  },
];

/** Pinned under the groups, set apart, like the settings entry in Google's consoles. */
const SETTINGS_LEAF: AdminNavLeaf = { href: "/admin/settings", label: "Settings", icon: Settings };
const SECURITY_LEAF: AdminNavLeaf = { href: "/admin/security", label: "Security", icon: ShieldCheck };

/** What is waiting, by page address. Pages with nothing waiting have no entry. */
export type AdminNavBadges = Record<string, number>;

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

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

/** md and up: the grouped list on the left. */
function AdminSideRail({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();

  function Item({ leaf }: { leaf: AdminNavLeaf }) {
    const active = isLeafActive(leaf.href, pathname);
    const Icon = leaf.icon;
    return (
      <Link
        href={leaf.href}
        prefetch
        aria-current={active ? "page" : undefined}
        className={`press-soft flex h-9 items-center gap-2.5 rounded-control px-2.5 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active ? "bg-neu-lift text-slate-50 shadow-pressed-low" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal-fg" : ""}`} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
        <span className="truncate">{leaf.label}</span>
        <Count count={badges[leaf.href] ?? 0} className="ml-auto" />
      </Link>
    );
  }

  return (
    <nav aria-label="Admin sections" className="hidden w-48 shrink-0 flex-col gap-4 md:sticky md:top-0 md:flex md:self-start">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {/* A lone entry that shares its group's name needs no heading. */}
          {!(group.leaves.length === 1 && group.leaves[0].label === group.label) && (
            <p className="px-2.5 pb-1 text-small font-medium text-slate-500">{group.label}</p>
          )}
          <ul className="grid gap-0.5">
            {group.leaves.map((leaf) => (
              <li key={leaf.href}>
                <Item leaf={leaf} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-(--neu-edge) pt-3">
        <Item leaf={SETTINGS_LEAF} />
        <Item leaf={SECURITY_LEAF} />
      </div>
    </nav>
  );
}

/**
 * Phones: one bar that names the page you are on and opens every page in a sheet. Sixteen pages used to sit in one row you had
 * to swipe sideways; now nothing scrolls. What is waiting shows on the bar (the total) and on each entry.
 */
function AdminPhoneMenu({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = [...NAV_GROUPS, { label: "Settings", leaves: [SETTINGS_LEAF, SECURITY_LEAF] }];
  const all = groups.flatMap((g) => g.leaves);
  // Longest address first, so /admin/payment-plans is not mistaken for /admin/payments and the Overview never wins by default.
  const current = [...all].sort((a, b) => b.href.length - a.href.length).find((leaf) => isLeafActive(leaf.href, pathname)) ?? all[0];
  const CurrentIcon = current.icon;
  const waiting = Object.values(badges).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);

  return (
    <div className="mb-4 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Admin menu, you are on ${current.label}${waiting > 0 ? `, ${waiting} waiting` : ""}`}
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
        <nav aria-label="Admin sections" className="space-y-2.5">
          {groups.map((group) => (
            <div key={group.label}>
              {!(group.leaves.length === 1 && group.leaves[0].label === group.label) && (
                <p className="px-1 pb-1 text-small font-medium leading-tight text-slate-500">{group.label}</p>
              )}
              <ul className="grid grid-cols-2 gap-1.5">
                {group.leaves.map((leaf) => {
                  const active = leaf.href === current.href;
                  const Icon = leaf.icon;
                  return (
                    <li key={leaf.href}>
                      <Link
                        href={leaf.href}
                        prefetch
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`press-soft flex h-10 items-center gap-2 rounded-2xl px-3 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active ? "bg-neu-lift text-signal-fg shadow-pressed-low" : "bg-neu-base text-slate-200 shadow-raised-low"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{leaf.label}</span>
                        <Count count={badges[leaf.href] ?? 0} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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
