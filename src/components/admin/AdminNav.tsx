"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { History,
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
  type LucideIcon,
} from "lucide-react";

/**
 * The one admin menu. Every admin page is a single entry in one grouped list,
 * the way YouTube Studio and Google's admin consoles lay theirs out: nothing is
 * hidden behind a second row of tabs or a dropdown, and each name matches the
 * heading of the page it opens. From md up it is a list on the left (Settings
 * pinned underneath); on phones the same entries are one swipeable row.
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

/** What is waiting, by page address. Pages with nothing waiting have no entry. */
export type AdminNavBadges = Record<string, number>;

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function Count({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`rounded-full bg-[rgb(var(--signal)/0.18)] px-1.5 text-small font-semibold tabular-nums text-signal ${className}`}
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
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal" : ""}`} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
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
      </div>
    </nav>
  );
}

/** Phones: the same entries in one row you swipe, the current one scrolled into view. A thin divider marks each group. */
function AdminSwipeRow({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  const groups = [...NAV_GROUPS, { label: "Settings", leaves: [SETTINGS_LEAF] }];

  return (
    <nav aria-label="Admin sections" className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max items-center gap-1.5">
        {groups.map((group, gi) =>
          group.leaves.map((leaf, li) => {
            const active = isLeafActive(leaf.href, pathname);
            const Icon = leaf.icon;
            return (
              <li key={leaf.href} className={`flex items-center ${li === 0 && gi > 0 ? "ml-1.5 border-l border-(--neu-edge) pl-3" : ""}`}>
                <Link
                  href={leaf.href}
                  prefetch
                  ref={active ? activeRef : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`press-soft flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "bg-neu-lift text-signal shadow-pressed-low" : "bg-neu-base text-slate-300 shadow-raised-low"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.1 : 1.75} aria-hidden />
                  {leaf.label}
                  <Count count={badges[leaf.href] ?? 0} />
                </Link>
              </li>
            );
          }),
        )}
      </ul>
    </nav>
  );
}

export function AdminNav({ badges = {} }: { badges?: AdminNavBadges }) {
  return (
    <>
      <AdminSwipeRow badges={badges} />
      <AdminSideRail badges={badges} />
    </>
  );
}
