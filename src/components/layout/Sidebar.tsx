"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export interface SidebarProps {
  name?: string | null;
  email?: string | null;
  isProMember: boolean;
  isAdmin: boolean;
  unreadMessageCount: number;
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_PATHS = {
  roadmap: "M4 6h11a3 3 0 010 6H9a3 3 0 000 6h11M4 6l3-3M4 6l3 3M17 18l3 3M17 18l3-3",
  friends: "M8 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6M17 11a3 3 0 100-6 3 3 0 000 6zM13.5 14c2.9.3 5.5 2.8 5.5 6",
  messages: "M4 5h16v11H8l-4 4V5z",
  payments: "M3 8h18M3 6h18v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM7 15h4",
  pricing: "M4 4h6l10 10-6 6L4 10V4zM8.5 8.5h.01",
  account: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  admin: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
} as const;

const NAV_ITEMS = [
  { href: "/dashboard", label: "Roadmap", icon: ICON_PATHS.roadmap },
  { href: "/friends", label: "Friends", icon: ICON_PATHS.friends },
  { href: "/messages", label: "Messages", icon: ICON_PATHS.messages },
  { href: "/billing/history", label: "Payment history", icon: ICON_PATHS.payments },
  { href: "/pricing", label: "Pricing", icon: ICON_PATHS.pricing },
  { href: "/account", label: "Account", icon: ICON_PATHS.account },
];

export function Sidebar({ name, email, isProMember, isAdmin, unreadMessageCount }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-900 bg-neutral-950/80 px-4 py-6">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="font-serif text-sm tracking-[0.2em] text-neutral-200">
          BASS NOTE <span className="text-amber-400">PIANO</span>
        </Link>
        <NotificationBell />
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-amber-400/10 text-amber-300"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <NavIcon path={item.icon} />
                {item.label}
              </span>
              {item.href === "/messages" && unreadMessageCount > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-neutral-950">
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </span>
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin/payments"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              pathname.startsWith("/admin")
                ? "bg-amber-400/10 text-amber-300"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
            }`}
          >
            <NavIcon path={ICON_PATHS.admin} />
            Admin
          </Link>
        )}
      </nav>

      <div className="mt-auto border-t border-neutral-900 pt-4">
        <p className="truncate px-2 text-sm text-neutral-200">{name ?? email ?? "Student"}</p>
        <p className="mt-0.5 px-2 text-xs text-neutral-500">
          {isProMember ? "Pro · Lifetime access" : "Pay-As-You-Go"}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 w-full rounded-lg border border-neutral-800 px-3 py-1.5 text-left text-xs font-medium text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
