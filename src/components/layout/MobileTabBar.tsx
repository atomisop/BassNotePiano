"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarCheck, Users, MessageSquare, Settings, type LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/lib/useUnreadMessages";

type Tab = { href: string; label: string; icon: LucideIcon; dataTour: string; match?: string[] };

// Single-word labels, five tabs, always visible (Apple HIG: tab bars).
const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: Home, dataTour: "nav-roadmap", match: ["/scales"] },
  { href: "/lessons", label: "Lessons", icon: CalendarCheck, dataTour: "nav-lessons" },
  { href: "/friends", label: "Friends", icon: Users, dataTour: "nav-friends" },
  { href: "/messages", label: "Messages", icon: MessageSquare, dataTour: "nav-messages" },
  { href: "/account", label: "Settings", icon: Settings, dataTour: "nav-settings" },
];

/**
 * The phone and tablet navigation: a full-width translucent tab bar pinned to
 * the bottom edge, icons over labels, a red count badge, home-indicator safe
 * area underneath. Desktop (lg and up) uses AppSidebar instead.
 */
export function MobileTabBar({ unreadMessageCount }: { unreadMessageCount: number }) {
  const pathname = usePathname();
  const unread = useUnreadMessages(unreadMessageCount);

  return (
    <nav
      aria-label="Primary"
      className="ios-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-(--neu-edge) pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-[49px] max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`) || (tab.match?.some((m) => pathname.startsWith(m)) ?? false);
          const badge = tab.href === "/messages" ? unread : 0;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0">
              <Link
                href={tab.href}
                data-tour={tab.dataTour}
                aria-current={active ? "page" : undefined}
                className={`ios-tab flex h-full flex-col items-center justify-center gap-[3px] ${active ? "text-signal" : "text-slate-400"}`}
              >
                <span className="relative">
                  <Icon className="ios-tab-icon h-[25px] w-[25px]" strokeWidth={active ? 2.1 : 1.6} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} aria-hidden />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF453A] px-1 text-[11px] font-semibold leading-none text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none tracking-[0.01em]">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
