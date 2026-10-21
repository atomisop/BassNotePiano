"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music2, CalendarCheck, Users, MessageSquare, User, Settings, Globe, ArrowUpRight, ArrowRight, type LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/lib/useUnreadMessages";
import { useMeStatus } from "@/components/layout/MeStatusProvider";
import { DiscordIcon } from "@/components/ui/icons";

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
export function AppSidebar({ unreadMessageCount: initial }: { unreadMessageCount: number }) {
  const pathname = usePathname();
  const unread = useUnreadMessages(initial);
  const status = useMeStatus();

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
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-signal" : ""}`} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
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

      {/* Shown only until Discord is linked: live classes happen there. The two logos link up with a travelling pulse. */}
      {status && !status.discordConnected && (
        <a
          href="/api/discord/connect"
          className="press-soft mt-auto block overflow-hidden rounded-card bg-neu-lift shadow-raised-low hover:shadow-raised-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden className="link-scene relative flex h-24 items-center justify-center gap-1.5 bg-[rgb(var(--c-s-950))]">
            <span className="link-star left-[14%] top-[22%]" />
            <span className="link-star left-[82%] top-[30%] [animation-delay:0.7s]" />
            <span className="link-star left-[26%] top-[78%] [animation-delay:1.3s]" />
            <span className="link-star left-[70%] top-[80%] [animation-delay:0.3s]" />
            <span className="link-tile link-tile-a flex h-11 w-11 items-center justify-center rounded-[0.9rem] bg-[#5865F2] text-white shadow-raised-mid">
              <DiscordIcon size={24} />
            </span>
            <span className="flex items-center gap-1">
              <span className="link-dot" />
              <span className="link-dot [animation-delay:0.15s]" />
              <span className="link-dot [animation-delay:0.3s]" />
              <span className="link-dot [animation-delay:0.45s]" />
            </span>
            <span className="link-tile link-tile-b flex h-11 w-11 items-center justify-center rounded-[0.9rem] bg-neu-lift shadow-raised-mid">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
            </span>
          </span>
          <span className="block p-3">
            <span className="block text-small font-semibold text-slate-50">Link your Discord</span>
            <span className="mt-0.5 block text-small text-slate-400">Your private class call opens there before each lesson.</span>
            <span className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-signal">
              Connect Discord
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
        </a>
      )}
    </nav>
  );
}
