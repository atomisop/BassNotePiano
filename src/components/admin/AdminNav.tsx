"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

// Two-level nav now, by direct instruction ("keep maximum 4 main tabs with
// multiple tabs inside them") — the previous flat 11-item version (already
// trimmed down once from 15, see the fold-history notes on each page this
// grouping now contains) still read as too many top-level buttons at a
// glance, even wrapped onto two rows. Every leaf page keeps its own real
// URL exactly as before (nothing here changes routing or breaks a
// bookmark/notification deep-link) — this only changes how those same
// pages are grouped and presented.
//
// Grouping rationale: Billing is every page that touches money (a Zelle
// queue, standing installment plans plus their own cancellation-feedback
// tab, manual credit corrections). Students is every page about a
// specific person's account (the registration queue, full account
// management, who is ready for their next scale). Operations is everything else that
// keeps the actual teaching running (the weekly schedule plus its own
// booking/attendance tab, uploaded lesson content, live support, and
// broadcast announcements) — the one deliberately mixed bucket, since
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
  { label: "Overview", leaves: [{ href: "/admin", label: "Overview" }] },
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
    ],
  },
];

const ALL_LEAVES = NAV_GROUPS.flatMap((g) => g.leaves);

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function activeGroup(pathname: string): AdminNavGroup {
  return NAV_GROUPS.find((g) => g.leaves.some((leaf) => isLeafActive(leaf.href, pathname))) ?? NAV_GROUPS[0];
}

/**
 * Below sm: a single native <select>, same reasoning (and same iOS-zoom
 * text-body fix) as the flat version this replaces — a phone has no room
 * for a real two-level control, so every leaf page is still one flat list,
 * just visually grouped via <optgroup> so the same four buckets are still
 * legible instead of eleven undifferentiated rows.
 */
function MobileAdminSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const current = ALL_LEAVES.find((leaf) => isLeafActive(leaf.href, pathname))?.href ?? ALL_LEAVES[0].href;

  return (
    <select
      value={current}
      onChange={(e) => router.push(e.target.value)}
      aria-label="Admin section"
      className="glass-surface-subtle w-full rounded-xl px-3 py-2.5 text-body font-medium text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] sm:hidden"
    >
      {NAV_GROUPS.map((group) =>
        group.leaves.length === 1 ? (
          <option key={group.leaves[0].href} value={group.leaves[0].href}>
            {group.leaves[0].label}
          </option>
        ) : (
          <optgroup key={group.label} label={group.label}>
            {group.leaves.map((leaf) => (
              <option key={leaf.href} value={leaf.href}>
                {leaf.label}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </select>
  );
}

/**
 * sm and up: the real two-level nav — four group pills, and (for whichever
 * group the current page belongs to) a second row of that group's own
 * leaf pills right below. A single-leaf group (just Overview) never grows
 * a second row at all, nothing to switch between.
 */
function DesktopAdminPills() {
  const pathname = usePathname();
  const group = activeGroup(pathname);

  return (
    <nav className="hidden flex-col gap-2 sm:flex">
      <div className="flex flex-wrap gap-1.5 rounded-2xl p-1.5 bg-neu-base shadow-raised-low">
        {NAV_GROUPS.map((g) => {
          const active = g.label === group.label;
          return (
            <Link
              key={g.label}
              href={g.leaves[0].href}
              className={`tap inline-flex items-center shrink-0 rounded-full px-3.5 py-1.5 text-small font-medium transition ${
                active ? "bg-[rgb(var(--signal)/0.14)] text-signal" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {g.label}
            </Link>
          );
        })}
      </div>
      {group.leaves.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-2xl p-1.5 bg-neu-base shadow-raised-low">
          {group.leaves.map((leaf) => {
            const active = isLeafActive(leaf.href, pathname);
            return (
              <Link
                key={leaf.href}
                href={leaf.href}
                className={`tap inline-flex items-center shrink-0 rounded-full px-3 py-1.5 text-small font-medium transition ${
                  active ? "bg-[rgb(var(--c-s-50)/0.18)] text-[rgb(var(--c-s-50))]" : "text-slate-500 hover:text-slate-200"
                }`}
              >
                {leaf.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export function AdminNav() {
  return (
    <>
      <MobileAdminSelect />
      <DesktopAdminPills />
    </>
  );
}
