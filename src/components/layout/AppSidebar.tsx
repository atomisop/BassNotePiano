"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music2, CalendarCheck, Users, MessageSquare, User, Settings, Globe, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { SidebarSpotlight } from "@/components/layout/SidebarSpotlight";
import type { SidebarCard } from "@/lib/sidebarCards";

type Item = { href: string; label: string; icon: LucideIcon; dataTour?: string; match?: string[]; external?: boolean };

// Same destinations as the phone dock, plus Practice and Profile, which have
// room here. Grouped so a long list stays scannable.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Learn",
    items: [
      { href: "/dashboard", label: "Home", icon: Home, dataTour: "nav-roadmap", match: ["/scales"] },
      { href: "/practice", label: "Practice", icon: Music2 },
      { href: "/lessons", label: "Online Lessons", icon: CalendarCheck, dataTour: "nav-lessons" },
    ],
  },
  {
    title: "Community",
    items: [
      { href: "/friends", label: "Friends", icon: Users, dataTour: "nav-friends" },
      { href: "/messages", label: "Messages", icon: MessageSquare, dataTour: "nav-messages" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: User },
      { href: "/account", label: "Settings", icon: Settings, dataTour: "nav-settings" },
      // The public homepage, in a new tab so the app stays where it is.
      { href: "/", label: "Website", icon: Globe, external: true },
    ],
  },
];

/**
 * Desktop navigation (lg and up). Phones and tablets keep the floating
 * AppDock; this takes its place on wide screens so nothing floats over the
 * content and every destination has a label. Sits under the fixed TopBar.
 */
export function AppSidebar({ unreadMessageCount: initial, cards, isAdmin }: { unreadMessageCount: number; cards: SidebarCard[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const unread = useUnreadMessages(initial);

  return (
    <nav
      aria-label="Primary"
      className="app-sidebar fixed bottom-0 left-0 top-0 z-40 hidden w-52 flex-col gap-5 overflow-y-auto border-r border-(--neu-edge) bg-neu-base px-3 pb-4 pt-14 lg:flex"
    >
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-2.5 pb-1.5 text-small font-semibold uppercase tracking-[0.16em] text-slate-500">{group.title}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`) ||
                (item.match?.some((m) => pathname.startsWith(m)) ?? false);
              const badge = item.href === "/messages" ? unread : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="press-soft flex h-9 items-center gap-2.5 rounded-control px-2.5 text-small font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{item.label}</span>
                      <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                  <Link
                    href={item.href}
                    prefetch
                    data-tour={item.dataTour}
                    aria-current={active ? "page" : undefined}
                    className={`press-soft flex h-9 items-center gap-2.5 rounded-control px-2.5 text-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-neu-lift text-slate-50 shadow-pressed-low"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal-fg" : ""}`} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-small font-bold text-slate-950">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Discord invitation (until linked), next class, streak, admin counts and the rest: one card at a time. */}
      <SidebarSpotlight initial={cards} isAdmin={isAdmin} />
    </nav>
  );
}
