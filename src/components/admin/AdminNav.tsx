"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/payment-plans", label: "Payment Plans" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/progress", label: "Progress" },
  { href: "/admin/lessons", label: "Lessons" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/credits", label: "Credits" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/support", label: "Support Chat" },
  { href: "/admin/announcements", label: "Announcements" },
];

function isActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/**
 * Below sm: a native <select>. Twelve sections wrapped into five rows of
 * pills at phone width — technically no longer side-scrolling, but it
 * pushed the actual page content down almost a full screen's worth before
 * you ever reach it. A single-line dropdown is the same "jump to any
 * section" job in the footprint mobile actually has room for — same split
 * AccountSettings already uses (DesktopSettingsNav vs. MobileSettingsMenu)
 * for its own many-sections problem.
 *
 * text-base, not text-sm, on the <select> below: under 16px, tapping it
 * makes iOS Safari zoom the whole page in, and this is the *only* way to
 * move between admin sections on a phone — so every visit to another
 * section re-triggered it. iOS doesn't reliably restore zoom/scroll after,
 * which is what actually got reported ("the whole screen shifts weirdly
 * going between admin and roadmap, need to pinch to fix it, can't scroll
 * to reveal the top"). Same root cause and same fix as the lesson-video
 * fullscreen bug documented in LessonVideoPlayer.tsx.
 */
function MobileAdminSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActive(item.href, pathname))?.href ?? NAV_ITEMS[0].href;

  return (
    <select
      value={current}
      onChange={(e) => router.push(e.target.value)}
      aria-label="Admin section"
      className="glass-surface-subtle w-full rounded-xl px-3 py-2.5 text-base font-medium text-slate-100 outline-none transition focus:border-[rgb(var(--c-s-50)/0.6)] sm:hidden"
    >
      {NAV_ITEMS.map((item) => (
        <option key={item.href} value={item.href}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

/** sm and up: real width to work with, so wrapping to 2-3 rows of pills stays compact — no dropdown needed once there's room to just show every section. */
function DesktopAdminPills() {
  const pathname = usePathname();
  return (
    <nav className="hidden flex-wrap gap-1.5 rounded-2xl border border-ink/10 p-1.5 sm:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
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
