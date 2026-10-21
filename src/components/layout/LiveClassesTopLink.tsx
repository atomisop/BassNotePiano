"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";

/** The live classes shortcut in the top bar, for students. Stays pressed in while you are on the booking pages. */
export function LiveClassesTopLink() {
  const pathname = usePathname();
  const active = pathname === "/lessons" || pathname.startsWith("/lessons/");
  return (
    <Link
      href="/lessons"
      aria-label="Live classes"
      title="Live classes"
      aria-current={active ? "page" : undefined}
      className={`tap flex h-9 w-9 items-center justify-center rounded-lg bg-neu-base transition ${
        active
          ? "text-signal-fg shadow-pressed-low"
          : "text-slate-400 shadow-raised-low hover:text-slate-200 hover:shadow-raised-mid active:shadow-pressed-low"
      }`}
    >
      <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </Link>
  );
}
