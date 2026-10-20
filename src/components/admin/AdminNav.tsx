"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { TAB_TRACK, tabItem } from "@/components/ui/tabStyles";

// Two-level nav now, by direct instruction ("keep maximum 4 main tabs with
// multiple tabs inside them"), the previous flat 11-item version (already
// trimmed down once from 15, see the fold-history notes on each page this
// grouping now contains) still read as too many top-level buttons at a
// glance, even wrapped onto two rows. Every leaf page keeps its own real
// URL exactly as before (nothing here changes routing or breaks a
// bookmark/notification deep-link), this only changes how those same
// pages are grouped and presented.
//
// Grouping rationale: Billing is every page that touches money (a Zelle
// queue, standing installment plans plus their own cancellation-feedback
// tab, manual credit corrections). Students is every page about a
// specific person's account (the registration queue, full account
// management, who is ready for their next scale). Operations is everything else that
// keeps the actual teaching running (the weekly schedule plus its own
// booking/attendance tab, uploaded lesson content, live support, Discord
// connections and broadcast announcements), the one deliberately mixed bucket, since
// splitting communication out into its own 5th group would have broken
// the 4-group cap this exists to satisfy.
interface AdminNavLeaf {
  href: string;
  label: string;
}

interface AdminNavGroup {
  label: string;
  leaves: AdminNavLeaf[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    leaves: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
  {
    label: "Billing",
    leaves: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/payment-plans", label: "Payment Plans" },
    ],
  },
  {
    label: "Students",
    leaves: [
      { href: "/admin/students", label: "Students" },
      { href: "/admin/employees", label: "Employees" },
      { href: "/admin/users", label: "People" },
    ],
  },
  {
    label: "Operations",
    leaves: [
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/lessons", label: "Lessons" },
      { href: "/admin/support", label: "Support Chat" },
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/discord", label: "Discord" },
    ],
  },
];

const ALL_LEAVES = NAV_GROUPS.flatMap((g) => g.leaves);

/** What is waiting, by page address. Pages with nothing waiting have no entry. */
export type AdminNavBadges = Record<string, number>;

function groupCount(group: AdminNavGroup, badges: AdminNavBadges): number {
  return group.leaves.reduce((sum, leaf) => sum + (badges[leaf.href] ?? 0), 0);
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-[rgb(var(--signal)/0.18)] px-1.5 text-small font-semibold tabular-nums text-signal" aria-label={`${count} waiting`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function activeGroup(pathname: string): AdminNavGroup {
  return NAV_GROUPS.find((g) => g.leaves.some((leaf) => isLeafActive(leaf.href, pathname))) ?? NAV_GROUPS[0];
}

/**
 * Below sm: a single native <select>, same reasoning (and same iOS-zoom
 * text-body fix) as the flat version this replaces, a phone has no room
 * for a real two-level control, so every leaf page is still one flat list,
 * just visually grouped via <optgroup> so the same four buckets are still
 * legible instead of eleven undifferentiated rows.
 */
function MobileAdminSelect({ badges }: { badges: AdminNavBadges }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = ALL_LEAVES.find((leaf) => isLeafActive(leaf.href, pathname))?.href ?? ALL_LEAVES[0].href;

  return (
    <select
      value={current}
      onChange={(e) => router.push(e.target.value)}
      aria-label="Admin section"
      className="h-11 w-full rounded-control bg-neu-base px-4 text-body font-medium text-slate-100 shadow-pressed-low outline-none transition focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
    >
      {NAV_GROUPS.map((group) =>
        group.leaves.length === 1 ? (
          <option key={group.leaves[0].href} value={group.leaves[0].href}>
            {group.leaves[0].label}
            {badges[group.leaves[0].href] ? ` (${badges[group.leaves[0].href]})` : ""}
          </option>
        ) : (
          <optgroup key={group.label} label={group.label}>
            {group.leaves.map((leaf) => (
              <option key={leaf.href} value={leaf.href}>
                {leaf.label}
                {badges[leaf.href] ? ` (${badges[leaf.href]})` : ""}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </select>
  );
}

/**
 * sm and up: the real two-level nav, four group pills, and (for whichever
 * group the current page belongs to) a second row of that group's own
 * leaf pills right below. A single-leaf group (just Overview) never grows
 * a second row at all, nothing to switch between.
 */
function DesktopAdminPills({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();
  const group = activeGroup(pathname);

  return (
    <nav className="hidden flex-col gap-2 sm:flex lg:hidden">
      <div className={`${TAB_TRACK} self-start`}>
        {NAV_GROUPS.map((g) => {
          const active = g.label === group.label;
          return (
            <Link
              key={g.label}
              href={g.leaves[0].href}
              className={tabItem(active)}
            >
              {g.label}
              <Badge count={groupCount(g, badges)} />
            </Link>
          );
        })}
      </div>
      {group.leaves.length > 1 && (
        <div className={`${TAB_TRACK} self-start`}>
          {group.leaves.map((leaf) => {
            const active = isLeafActive(leaf.href, pathname);
            return (
              <Link
                key={leaf.href}
                href={leaf.href}
                className={tabItem(active)}
              >
                {leaf.label}
                <Badge count={badges[leaf.href] ?? 0} />
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

/**
 * lg and up: every admin page in a vertical list on the left, grouped under
 * the same four headings, so nothing hides behind a second row of pills.
 */
function AdminSideRail({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="hidden w-44 shrink-0 flex-col gap-4 lg:flex">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-2.5 pb-1.5 text-small font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
          <ul className="grid gap-0.5">
            {group.leaves.map((leaf) => {
              const active = isLeafActive(leaf.href, pathname);
              const count = badges[leaf.href] ?? 0;
              return (
                <li key={leaf.href}>
                  <Link
                    href={leaf.href}
                    aria-current={active ? "page" : undefined}
                    className={`press-soft flex h-8 items-center rounded-control px-2.5 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? "bg-neu-lift text-slate-50 shadow-pressed-low" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                    }`}
                  >
                    <span className="truncate">{leaf.label}</span>
                    {count > 0 && (
                      <span className="ml-auto rounded-full bg-[rgb(var(--signal)/0.18)] px-1.5 text-small font-semibold tabular-nums text-signal" aria-label={`${count} waiting`}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminNav({ badges = {} }: { badges?: AdminNavBadges }) {
  return (
    <>
      <MobileAdminSelect badges={badges} />
      <DesktopAdminPills badges={badges} />
      <AdminSideRail badges={badges} />
    </>
  );
}
