"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export interface SidebarProps {
  name?: string | null;
  isAdmin: boolean;
  unreadMessageCount: number;
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_PATHS = {
  roadmap: "M4 6h11a3 3 0 010 6H9a3 3 0 000 6h11M4 6l3-3M4 6l3 3M17 18l3 3M17 18l3-3",
  friends: "M8 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6M17 11a3 3 0 100-6 3 3 0 000 6zM13.5 14c2.9.3 5.5 2.8 5.5 6",
  messages: "M4 5h16v11H8l-4 4V5z",
  profile: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  admin: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
  settings:
    "M10.3 3.3c.3-1 1.7-1 2 0l.2.7c.2.6.8 1 1.4.8l.7-.2c1-.3 1.8.7 1.3 1.6l-.4.6c-.3.5-.1 1.2.4 1.5l.6.4c.9.5.9 1.9 0 2.4l-.6.4c-.5.3-.7 1-.4 1.5l.4.6c.5.9-.3 1.9-1.3 1.6l-.7-.2c-.6-.2-1.2.2-1.4.8l-.2.7c-.3 1-1.7 1-2 0l-.2-.7c-.2-.6-.8-1-1.4-.8l-.7.2c-1 .3-1.8-.7-1.3-1.6l.4-.6c.3-.5.1-1.2-.4-1.5l-.6-.4c-.9-.5-.9-1.9 0-2.4l.6-.4c.5-.3.7-1 .4-1.5l-.4-.6c-.5-.9.3-1.9 1.3-1.6l.7.2c.6.2 1.2-.2 1.4-.8l.2-.7z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
} as const;

const NAV_ITEMS = [
  { href: "/dashboard", label: "Roadmap", icon: ICON_PATHS.roadmap },
  { href: "/friends", label: "Friends", icon: ICON_PATHS.friends },
  { href: "/messages", label: "Messages", icon: ICON_PATHS.messages },
];

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition ${
        active
          ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
          : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      <NavIcon path={icon} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {Boolean(badge) && (
        <span className="absolute right-1.5 top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-slate-950">
          {badge! > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ name, isAdmin, unreadMessageCount }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-24 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-slate-950/40 py-5 backdrop-blur-2xl">
      <Link
        href="/"
        aria-label="Bass Note Piano"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/5 font-serif text-xs text-amber-300 shadow-[0_0_20px_-4px_rgba(251,191,36,0.4)]"
      >
        BN
      </Link>

      <div className="mt-3">
        <NotificationBell />
      </div>

      <nav className="mt-6 flex w-full flex-col items-center gap-1 px-2">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname === item.href}
            badge={item.href === "/messages" ? unreadMessageCount : undefined}
          />
        ))}
        {isAdmin && (
          <NavItem href="/admin/payments" label="Admin" icon={ICON_PATHS.admin} active={pathname.startsWith("/admin")} />
        )}
      </nav>

      <div className="my-4 h-px w-8 bg-white/10" />

      <NavItem href="/profile" label="Profile" icon={ICON_PATHS.profile} active={pathname === "/profile"} />

      <div className="flex-1" />

      <div className="flex w-full flex-col items-center gap-1 px-2 pb-1">
        <NavItem href="/account" label="Settings" icon={ICON_PATHS.settings} active={pathname === "/account"} />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          title={name ? `Sign out (${name})` : "Sign out"}
          className="flex flex-col items-center gap-1 rounded-xl border border-transparent px-2 py-2.5 text-center text-slate-500 transition hover:border-white/10 hover:bg-white/5 hover:text-slate-200"
        >
          <NavIcon path={ICON_PATHS.logout} />
          <span className="text-[10px] font-medium leading-none">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
