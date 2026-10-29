"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

/**
 * The Admin shortcut in the top bar. Client-side only so it can read the
 * current route: while you are anywhere under /admin the button stays
 * pressed in and lit, so it reads as "you are here" (same look the other
 * top-bar buttons use while their panel is open).
 */
export function AdminTopLink() {
  const pathname = usePathname();
  const active = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <Link
      href="/admin"
      aria-label="Admin"
      aria-current={active ? "page" : undefined}
      className={`tap flex h-9 w-9 items-center justify-center rounded-full bg-neu-base transition ${
        active
          ? "text-signal-fg shadow-pressed-low"
          : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
      }`}
    >
      <Shield className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </Link>
  );
}
