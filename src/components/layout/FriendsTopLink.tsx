"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "@/components/ui/appIcons";

/** Friends in the top bar (it left the dock to make room for the Roadmap). Stays pressed in while you are on the friends pages. */
export function FriendsTopLink() {
  const pathname = usePathname();
  const active = pathname === "/friends" || pathname.startsWith("/friends/");
  return (
    <Link
      href="/friends"
      aria-label="Friends"
      title="Friends"
      data-tour="nav-friends"
      aria-current={active ? "page" : undefined}
      className={`tap press flex h-9 w-9 items-center justify-center rounded-full bg-neu-base ${
        active
          ? "text-signal-fg shadow-pressed-low"
          : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
      }`}
    >
      <Users className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </Link>
  );
}
