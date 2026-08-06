"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon, ICON_PATHS } from "./navIcons";
import { MoreSheet } from "./MoreSheet";

const TABS = [
  { href: "/dashboard", label: "Roadmap", icon: ICON_PATHS.roadmap },
  { href: "/friends", label: "Friends", icon: ICON_PATHS.friends },
  { href: "/messages", label: "Messages", icon: ICON_PATHS.messages },
  { href: "/profile", label: "Profile", icon: ICON_PATHS.profile },
];

// The only nav surface below md — Sidebar doesn't render at all there.
// Profile gets its own permanent tab (never buried in "More") since that
// was the whole point: no scrolling or menu-hunting to reach it.
export function MobileTabBar({ isAdmin, unreadMessageCount }: { isAdmin: boolean; unreadMessageCount: number }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const inMoreSection =
    pathname.startsWith("/admin") || pathname === "/account" || pathname === "/about" || pathname === "/lessons";

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-slate-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-center transition ${
                active ? "text-amber-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <NavIcon path={tab.icon} />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              {tab.href === "/messages" && unreadMessageCount > 0 && (
                <span className="absolute right-[22%] top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-slate-950">
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-center transition ${
            inMoreSection ? "text-amber-300" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <NavIcon path={ICON_PATHS.more} />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} isAdmin={isAdmin} />
    </>
  );
}
