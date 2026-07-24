"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NavIcon, ICON_PATHS } from "./navIcons";

export interface SidebarProps {
  name?: string | null;
  isAdmin: boolean;
  unreadMessageCount: number;
}

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

// Below md, the MobileTabBar takes over navigation entirely — this rail
// only renders from md up, where there's room for it without clutter.
export function Sidebar({ name, isAdmin, unreadMessageCount }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-24 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/10 bg-slate-950/40 py-5 backdrop-blur-2xl md:flex">
      <nav className="flex w-full flex-col items-center gap-1 px-2">
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

      <div className="my-4 h-px w-8 shrink-0 bg-white/10" />

      <NavItem href="/profile" label="Profile" icon={ICON_PATHS.profile} active={pathname === "/profile"} />

      <div className="flex-1" />

      <div className="flex w-full shrink-0 flex-col items-center gap-1 px-2 pb-1">
        <NavItem href="/account" label="Settings" icon={ICON_PATHS.settings} active={pathname === "/account"} />
        <NavItem href="/about" label="About" icon={ICON_PATHS.about} active={pathname === "/about"} />
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
